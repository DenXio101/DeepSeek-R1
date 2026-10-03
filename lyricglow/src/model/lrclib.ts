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

async function fetchHits(params: Record<string, string>, signal?: AbortSignal): Promise<LyricsSearchHit[]> {
  const qs = new URLSearchParams(params).toString();
  let res: Response;
  try {
    res = await fetch(`${LRCLIB_BASE}/search?${qs}`, { signal, headers: { Accept: "application/json" } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Couldn't reach the lyrics service. Check your connection and try again.", { cause: err });
  }
  if (!res.ok) throw new Error(`Lyrics service error (${res.status}).`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error("Unexpected response from the lyrics service.");
  return (data as LrclibResult[]).filter((r) => r && typeof r.id === "number").map(toHit);
}

/** "Title - Artist", "Title by Artist", "Artist – Title" → candidate splits */
export function splitQuery(q: string): { track: string; artist: string }[] {
  const out: { track: string; artist: string }[] = [];
  const sep = /\s+(?:-|–|—|\|)\s+|\s+by\s+/i;
  const parts = q.split(sep).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2) {
    out.push({ track: parts[0], artist: parts[1] });
    out.push({ track: parts[1], artist: parts[0] });
  }
  return out;
}

/**
 * Free-text search. LRCLIB's `q` matcher is strict about word order, so we also
 * try title/artist splits and a bare-title query, then merge and de-duplicate.
 * Synced results sort first, then by how well the artist/title match the query.
 */
export async function searchLyrics(query: string, signal?: AbortSignal): Promise<LyricsSearchHit[]> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2) return [];
  const attempts: Record<string, string>[] = [{ q }];
  for (const s of splitQuery(q)) attempts.push({ track_name: s.track, artist_name: s.artist });
  const words = q.split(" ");
  if (words.length >= 3) attempts.push({ q: words.slice(0, 3).join(" ") });
  if (words.length >= 2) attempts.push({ track_name: words.slice(0, -1).join(" "), artist_name: words[words.length - 1] });

  const settled = await Promise.allSettled(attempts.map((p) => fetchHits(p, signal)));
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");
  const seen = new Map<number, LyricsSearchHit>();
  let firstError: unknown = null;
  for (const r of settled) {
    if (r.status === "fulfilled") {
      for (const h of r.value) if (!seen.has(h.id)) seen.set(h.id, h);
    } else if (!firstError) firstError = r.reason;
  }
  if (!seen.size && firstError) throw firstError instanceof Error ? firstError : new Error("Search failed.");

  const terms = q.toLowerCase().split(" ");
  const score = (h: LyricsSearchHit) => {
    const hay = `${h.title} ${h.artist} ${h.album}`.toLowerCase();
    let n = 0;
    for (const t of terms) if (hay.includes(t)) n++;
    return n / terms.length;
  };
  return [...seen.values()]
    .map((h) => ({ h, s: score(h) }))
    .sort((a, b) => Number(b.h.synced) - Number(a.h.synced) || b.s - a.s || (b.h.duration ? 1 : 0) - (a.h.duration ? 1 : 0))
    .map((x) => x.h)
    .slice(0, 30);
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
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}
