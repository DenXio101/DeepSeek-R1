// ─── Matching a YouTube video to LRCLIB lyrics ─────────────────────────────
import type { LyricsSearchHit } from "./lrclib";

export interface VideoMeta {
  title: string;
  channel: string;
  /** seconds, 0 when unknown */
  duration: number;
}

const NOISE = [
  /\((?:official\s*)?(?:music\s*)?(?:video|audio|lyric\s*video|lyrics|visualizer|hd|4k|remaster(?:ed)?(?:\s*\d{4})?)\)/gi,
  /\[(?:official\s*)?(?:music\s*)?(?:video|audio|lyric\s*video|lyrics|visualizer|hd|4k|remaster(?:ed)?(?:\s*\d{4})?)\]/gi,
  /\((?:video|audio)\s*oficial\)/gi,
  /\b(?:official|music)\s+video\b/gi,
  /\bofficial\s+audio\b/gi,
  /\blyrics?\b/gi,
  /\b(?:hd|4k|hq)\b/gi,
  /\bvideo\s+oficial\b/gi,
  /\(?\b(?:feat|ft)\.?\s+[^)\]]+\)?/gi,
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
  /\s*[|•·]\s*/g,
];

function tidy(s: string): string {
  return s.replace(/\s+/g, " ").replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "").trim();
}

function cleanChannel(channel: string): string {
  return tidy(channel.replace(/\s*-\s*topic$/i, "").replace(/vevo$/i, "").replace(/\s*official$/i, ""));
}

/** "Lady Gaga - Bad Romance (Official Music Video)" + channel → { title, artist, query } */
export function cleanVideoTitle(rawTitle: string, channel = ""): { title: string; artist: string; query: string } {
  let t = rawTitle;
  for (const re of NOISE) t = t.replace(re, " ");
  t = tidy(t.replace(/\(\s*\)|\[\s*\]/g, " "));
  const ch = cleanChannel(channel);
  let title = t;
  let artist = ch;
  const m = /^(.*?)\s+[-–—]\s+(.*)$/.exec(t);
  if (m) {
    const a = tidy(m[1]);
    const b = tidy(m[2]);
    // "Artist - Title" is the norm; flip when the channel names the second part
    if (ch && b.toLowerCase().includes(ch.toLowerCase()) && !a.toLowerCase().includes(ch.toLowerCase())) {
      title = a;
      artist = b;
    } else {
      artist = a;
      title = b;
    }
  }
  if (!artist) artist = ch;
  const query = tidy(`${title} ${artist}`);
  return { title, artist, query };
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function overlap(a: string, b: string): number {
  const ta = tokens(a);
  const tb = new Set(tokens(b));
  if (!ta.length) return 0;
  let n = 0;
  for (const w of ta) if (tb.has(w)) n++;
  return n / ta.length;
}

/** 0..1 — how well an LRCLIB hit fits a video (title/artist overlap + duration closeness) */
export function scoreHitForVideo(hit: LyricsSearchHit, video: VideoMeta): number {
  const { title, artist } = cleanVideoTitle(video.title, video.channel);
  const titleScore = Math.max(overlap(hit.title, title), overlap(title, hit.title));
  const artistScore = artist ? Math.max(overlap(hit.artist, artist), overlap(artist, hit.artist)) : 0.5;
  let durScore = 0.5;
  if (hit.duration && video.duration) {
    const d = Math.abs(hit.duration - video.duration);
    durScore = d <= 3 ? 1 : d <= 8 ? 0.85 : d <= 20 ? 0.5 : d <= 45 ? 0.2 : 0;
  }
  return 0.45 * titleScore + 0.2 * artistScore + 0.35 * durScore;
}

/** Best synced hit for a video, or null when nothing is convincing. */
export function pickLyricsForVideo(hits: LyricsSearchHit[], video: VideoMeta): LyricsSearchHit | null {
  let best: LyricsSearchHit | null = null;
  let bestScore = 0;
  for (const h of hits) {
    if (!h.synced || h.instrumental) continue;
    const s = scoreHitForVideo(h, video);
    if (s > bestScore) {
      bestScore = s;
      best = h;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

/** does a hit's length fit a known backing duration? */
export function fitsDuration(hit: LyricsSearchHit, backingDuration: number): boolean {
  return !!hit.duration && !!backingDuration && Math.abs(hit.duration - backingDuration) <= 8;
}

/** sort hits: synced first, then those matching the backing length, then original order */
export function sortHitsForBacking(hits: LyricsSearchHit[], backingDuration: number): LyricsSearchHit[] {
  if (!backingDuration) return hits;
  return [...hits].sort((a, b) => Number(b.synced) - Number(a.synced) || Number(fitsDuration(b, backingDuration)) - Number(fitsDuration(a, backingDuration)));
}

/** loose "is this track already this song?" check to avoid replacing a deliberate pick */
export function trackMatchesVideo(trackTitle: string, trackArtist: string, video: VideoMeta): boolean {
  const { title, artist } = cleanVideoTitle(video.title, video.channel);
  return overlap(title, trackTitle) >= 0.6 || (overlap(trackTitle, title) >= 0.6 && (!artist || overlap(artist, trackArtist) >= 0.5));
}
