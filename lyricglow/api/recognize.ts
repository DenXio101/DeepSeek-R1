// ─── POST /api/recognize — forwards a short WAV snippet to ACRCloud ──────────
// The ACRCloud secret stays here (server env), never in the browser bundle.
import { createHmac } from "node:crypto";
import { acrStringToSign, parseAcrResponse, type AcrResponse, type RecognizeResult } from "../src/model/acr";

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

function json(body: RecognizeResult, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const host = process.env.ACR_HOST?.trim();
  const key = process.env.ACR_ACCESS_KEY?.trim();
  const secret = process.env.ACR_ACCESS_SECRET?.trim();
  if (!host || !key || !secret) return json({ ok: false, code: -1, status: 503, error: "Song recognition isn't set up yet on this server." }, 503);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  if (limited(ip)) return json({ ok: false, code: -2, status: 429, error: "Too many recognition requests — try again in a minute." }, 429);

  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES) return json({ ok: false, code: -3, status: 413, error: "Audio snippet too large." }, 413);
  const audio = await req.arrayBuffer();
  if (audio.byteLength < 1000 || audio.byteLength > MAX_BYTES) return json({ ok: false, code: -3, status: 413, error: "Audio snippet has the wrong size." }, 413);

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha1", secret).update(acrStringToSign(key, timestamp)).digest("base64");
  const form = new FormData();
  form.append("sample", new Blob([audio], { type: "audio/wav" }), "sample.wav");
  form.append("sample_bytes", String(audio.byteLength));
  form.append("access_key", key);
  form.append("data_type", "audio");
  form.append("signature_version", "1");
  form.append("signature", signature);
  form.append("timestamp", String(timestamp));

  let data: AcrResponse;
  try {
    const res = await fetch(`https://${host.replace(/^https?:\/\//, "")}/v1/identify`, { method: "POST", body: form });
    data = (await res.json()) as AcrResponse;
  } catch {
    return json({ ok: false, code: -4, status: 502, error: "Couldn't reach the song recognition service." }, 502);
  }
  const result = parseAcrResponse(data);
  return json(result, result.ok ? 200 : result.status);
}
