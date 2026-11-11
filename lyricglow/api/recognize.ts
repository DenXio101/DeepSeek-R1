// ─── POST /api/recognize — forwards a short WAV snippet to ACRCloud ──────────
// The ACRCloud secret stays here (server env), never in the browser bundle.
// Classic Node handler signature (req, res) for maximum compatibility with Vercel's builder.
import { createHmac } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AcrResponse, RecognizeResult } from "../src/model/acr.js";

// NOTE: only `import type` from src — Vercel compiles this file on its own, so any runtime
// import outside api/ would be missing at /var/task. The two helpers below are therefore
// defined here and exercised by scripts/check-model.ts.

/** ACRCloud signature_version 1 string to sign */
export function acrStringToSign(accessKey: string, timestamp: number | string, method = "POST", uri = "/v1/identify", dataType = "audio"): string {
  return [method, uri, accessKey, dataType, "1", String(timestamp)].join("\n");
}

/** ACRCloud status codes → our result */
export function parseAcrResponse(data: AcrResponse): RecognizeResult {
  const code = data.status?.code ?? -1;
  if (code === 0) {
    const m = data.metadata?.music?.[0];
    if (!m) return { ok: true, match: null, code: 0 };
    return {
      ok: true,
      code: 0,
      match: {
        title: m.title ?? "",
        artist: (m.artists ?? []).map((a) => a.name ?? "").filter(Boolean).join(", "),
        album: m.album?.name ?? "",
        durationMs: m.duration_ms ?? 0,
        playOffsetMs: m.play_offset_ms ?? 0,
        sampleEndOffsetMs: m.sample_end_time_offset_ms,
        dbEndOffsetMs: m.db_end_time_offset_ms,
        score: m.score ?? 0,
      },
    };
  }
  if (code === 1001) return { ok: true, match: null, code }; // no result
  if (code === 3003 || code === 3015) return { ok: false, code, status: 429, error: "Song recognition quota is used up for now." };
  if (code === 3001 || code === 3014 || code === 3006) return { ok: false, code, status: 502, error: "Song recognition keys are wrong — check the ACRCloud host, key and secret." };
  return { ok: false, code, status: 502, error: `Song recognition failed (${data.status?.msg ?? code}).` };
}

const MAX_BYTES = 600 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) hits.clear();
  return arr.length > MAX_PER_WINDOW;
}

function send(res: ServerResponse, body: RecognizeResult, status = 200): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    total += b.length;
    if (total > max) return null;
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    send(res, { ok: false, code: -5, status: 405, error: "Use POST with an audio/wav body." }, 405);
    return;
  }
  const host = process.env.ACR_HOST?.trim();
  const key = process.env.ACR_ACCESS_KEY?.trim();
  const secret = process.env.ACR_ACCESS_SECRET?.trim();
  if (!host || !key || !secret) {
    send(res, { ok: false, code: -1, status: 503, error: "Song recognition isn't set up yet on this server." }, 503);
    return;
  }
  const fwd = req.headers["x-forwarded-for"];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || "anon";
  if (limited(ip)) {
    send(res, { ok: false, code: -2, status: 429, error: "Too many recognition requests — try again in a minute." }, 429);
    return;
  }
  const audio = await readBody(req, MAX_BYTES);
  if (!audio || audio.length < 1000) {
    send(res, { ok: false, code: -3, status: 413, error: "Audio snippet has the wrong size." }, 413);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha1", secret).update(acrStringToSign(key, timestamp)).digest("base64");
  const form = new FormData();
  form.append("sample", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "sample.wav");
  form.append("sample_bytes", String(audio.length));
  form.append("access_key", key);
  form.append("data_type", "audio");
  form.append("signature_version", "1");
  form.append("signature", signature);
  form.append("timestamp", String(timestamp));

  let data: AcrResponse;
  try {
    const r = await fetch(`https://${host.replace(/^https?:\/\//, "")}/v1/identify`, { method: "POST", body: form });
    data = (await r.json()) as AcrResponse;
  } catch {
    send(res, { ok: false, code: -4, status: 502, error: "Couldn't reach the song recognition service." }, 502);
    return;
  }
  const result = parseAcrResponse(data);
  send(res, result, result.ok ? 200 : result.status);
}
