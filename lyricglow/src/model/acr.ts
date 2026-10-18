// ─── ACRCloud types shared by the browser and api/recognize.ts, plus the client-side position math ──

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

export interface AcrMusic {
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
