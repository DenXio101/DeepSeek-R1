// ─── ACRCloud identification helpers (pure; shared by the Vercel function and fixtures) ──

/** What the server hands the browser for one recognition. */
export interface RecognizedSong {
  title: string;
  artist: string;
  album: string;
  /** full track length, ms (0 when unknown) */
  durationMs: number;
  /** ACRCloud's position of the playing audio, ms */
  playOffsetMs: number;
  /** where inside the submitted sample the match ended, ms (optional) */
  sampleEndOffsetMs?: number;
  /** where inside the reference track the matched part ended, ms (optional) */
  dbEndOffsetMs?: number;
  /** 0..100 */
  score: number;
}

export type RecognizeResult = { ok: true; match: RecognizedSong | null; code: number } | { ok: false; error: string; code: number; status: number };

/** ACRCloud signature_version 1 string to sign */
export function acrStringToSign(accessKey: string, timestamp: number | string, method = "POST", uri = "/v1/identify", dataType = "audio"): string {
  return [method, uri, accessKey, dataType, "1", String(timestamp)].join("\n");
}

interface AcrMusic {
  title?: string;
  artists?: { name?: string }[];
  album?: { name?: string };
  duration_ms?: number;
  play_offset_ms?: number;
  sample_end_time_offset_ms?: number;
  db_end_time_offset_ms?: number;
  score?: number;
}
export interface AcrResponse {
  status?: { code?: number; msg?: string };
  metadata?: { music?: AcrMusic[]; humming?: AcrMusic[] };
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

/**
 * Track position (seconds) at the instant the captured sample ended.
 * Prefers the matched-segment offsets (precise); falls back to play_offset_ms.
 */
export function positionAtCaptureEnd(match: Pick<RecognizedSong, "playOffsetMs" | "sampleEndOffsetMs" | "dbEndOffsetMs">, sampleSeconds: number): number {
  if (match.dbEndOffsetMs !== undefined && match.sampleEndOffsetMs !== undefined && match.dbEndOffsetMs > 0) {
    return match.dbEndOffsetMs / 1000 + Math.max(0, sampleSeconds - match.sampleEndOffsetMs / 1000);
  }
  return match.playOffsetMs / 1000;
}
