// ─── LRCLIB client (https://lrclib.net) — free, keyless synced-lyrics database ──
import type { Track } from "../lyrics";
import { parseLrc } from "./lrc";

export const LRCLIB_BASE = "https://lrclib.net/api";

export interface LrclibResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsSearchHit {
  id: number;
  title: string;
  artist: string;
  album: string;
  /** seconds, 0 when unknown */
  duration: number;
  synced: boolean;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

function toHit(r: LrclibResult): LyricsSearchHit {
  return {
    id: r.id,
    title: r.trackName ?? "",
    artist: r.artistName ?? "",
    album: r.albumName ?? "",
    duration: typeof r.duration === "number" && Number.isFinite(r.duration) ? r.duration : 0,
    synced: !!r.syncedLyrics && r.syncedLyrics.trim().length > 0,
    instrumental: !!r.instrumental,
    plainLyrics: r.plainLyrics ?? "",
    syncedLyrics: r.syncedLyrics ?? "",
  };
}

/** Free-text search ("title artist"). Synced results sort first. */
export async function searchLyrics(query: string, signal?: AbortSignal): Promise<LyricsSearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `${LRCLIB_BASE}/search?q=${encodeURIComponent(q)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Couldn't reach the lyrics service. Check your connection and try again.", { cause: err });
  }
  if (!res.ok) throw new Error(`Lyrics service error (${res.status}).`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Unexpected response from the lyrics service.");
  const hits = (data as LrclibResult[]).filter((r) => r && typeof r.id === "number").map(toHit);
  hits.sort((a, b) => Number(b.synced) - Number(a.synced));
  return hits.slice(0, 25);
}

/** Build a playable Track from a synced LRCLIB hit (uses the normal LRC parser). */
export function trackFromHit(hit: LyricsSearchHit): Track {
  if (!hit.synced) throw new Error("This result has no synced lyrics.");
  const header = [`[ti:${hit.title}]`, `[ar:${hit.artist}]`, hit.album ? `[al:${hit.album}]` : ""].filter(Boolean).join("\n");
  const r = parseLrc(`${header}\n${hit.syncedLyrics}`);
  const track = r.track;
  if (hit.duration > track.duration!) track.duration = Math.ceil(hit.duration);
  return track;
}

/** Plain-lyrics hit → text for Sync Studio (voice/section lines left to the user). */
export function studioTextFromHit(hit: LyricsSearchHit): string {
  return hit.plainLyrics.replace(/\r\n?/g, "\n").trim();
}

export function formatDuration(s: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
