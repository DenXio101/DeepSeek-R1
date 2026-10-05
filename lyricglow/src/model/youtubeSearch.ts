// ─── YouTube Data API v3 search (needs a domain-restricted API key) ────────
import { overlap } from "./songMatch";

/**
 * What kind of upload a hit is. Only `topic` (YouTube Music art track = the album
 * master), `official` (VEVO / "Official Video") and `artist` (the artist's own channel)
 * count as official; their timing matches the record LRCLIB lyrics were made for.
 */
export type HitKind = "topic" | "official" | "artist" | "other" | "unofficial";

export interface YouTubeHit {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  /** seconds, 0 when unknown */
  duration: number;
  kind: HitKind;
  /** topic / official / artist */
  official: boolean;
}

const API = "https://www.googleapis.com/youtube/v3";
/** YouTube Data API category id for Music */
const MUSIC_CATEGORY = "10";

const UNOFFICIAL_RE =
  /\b(karaoke|cover(?:ed|s)?|live(?:\s+at|\s+from|\s+in|\s+performance|\s+version)?|remix|sped\s*up|slowed|nightcore|reverb|lyrics?|lyric\s*video|instrumental|tribute|reaction|8d|1\s*hour|loop(?:ed)?|mashup|acoustic\s+version|piano\s+version|choir|parody|backing\s+track|minus\s+one|edit)\b/i;
const OFFICIAL_TITLE_RE = /\bofficial\s+(?:music\s+)?(?:video|audio|visuali[sz]er|lyric\s+video)\b|\(official\)|\bvideo\s+oficial\b|\baudio\s+oficial\b/i;

export function classifyUpload(title: string, channel: string, artist = ""): HitKind {
  const ch = channel.trim();
  if (/\s-\sTopic$/i.test(ch)) return "topic";
  const t = title.trim();
  // an official lyric video is still the record; only call it unofficial when nothing marks it official
  const officialMark = /vevo$/i.test(ch) || OFFICIAL_TITLE_RE.test(t);
  if (!officialMark && (UNOFFICIAL_RE.test(t) || UNOFFICIAL_RE.test(ch))) return "unofficial";
  if (officialMark) return "official";
  if (artist) {
    const chClean = ch.replace(/\s*(official|music|records|tv)\s*$/i, "");
    if (overlap(artist, chClean) >= 0.6 || overlap(chClean, artist) >= 0.6) return "artist";
  }
  return "other";
}

export function isOfficialKind(kind: HitKind): boolean {
  return kind === "topic" || kind === "official" || kind === "artist";
}

export function kindLabel(kind: HitKind): string {
  switch (kind) {
    case "topic":
      return "YouTube Music";
    case "official":
      return "Official";
    case "artist":
      return "Artist channel";
    case "unofficial":
      return "Not official";
    default:
      return "";
  }
}

const KIND_ORDER: Record<HitKind, number> = { topic: 0, official: 1, artist: 2, other: 3, unofficial: 4 };

/** Official uploads first (YouTube Music → VEVO/official → artist), then closest length to the lyrics, then title match. */
export function rankHits(hits: YouTubeHit[], song: { title: string; artist?: string; lyricsDuration?: number }): YouTubeHit[] {
  const dur = song.lyricsDuration ?? 0;
  const durPenalty = (h: YouTubeHit) => (dur && h.duration ? Math.min(60, Math.abs(h.duration - dur)) : 30);
  return [...hits].sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      durPenalty(a) - durPenalty(b) ||
      overlap(song.title, b.title) - overlap(song.title, a.title),
  );
}

/** search text for the official recording: title + artist, no "karaoke" suffix */
export function officialQuery(title: string, artist = ""): string {
  const a = artist && artist !== "Unknown artist" ? artist : "";
  return `${title} ${a}`.trim();
}

export function youtubeApiKey(): string | null {
  const k = (import.meta.env.VITE_YT_API_KEY as string | undefined)?.trim();
  return k ? k : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/** PT4M13S → 253 */
export function parseIsoDuration(iso: string): number {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

interface SearchResp {
  items?: { id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: { medium?: { url?: string }; default?: { url?: string } } } }[];
  error?: { message?: string; errors?: { reason?: string }[] };
}
interface VideosResp {
  items?: { id?: string; contentDetails?: { duration?: string } }[];
}

interface VideoMetaResp {
  items?: { id?: string; snippet?: { title?: string; channelTitle?: string }; contentDetails?: { duration?: string } }[];
}

/** title / channel / duration for one video id (1 quota unit); null on any failure */
export async function fetchVideoMeta(videoId: string, key: string, signal?: AbortSignal): Promise<{ title: string; channel: string; duration: number } | null> {
  try {
    const p = new URLSearchParams({ part: "snippet,contentDetails", id: videoId, key });
    const res = await fetch(`${API}/videos?${p}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as VideoMetaResp;
    const it = data.items?.[0];
    if (!it) return null;
    return {
      title: decodeEntities(it.snippet?.title ?? ""),
      channel: decodeEntities(it.snippet?.channelTitle ?? ""),
      duration: parseIsoDuration(it.contentDetails?.duration ?? ""),
    };
  } catch {
    return null;
  }
}

export async function searchYouTube(query: string, key: string, signal?: AbortSignal, max = 12, artist = ""): Promise<YouTubeHit[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: MUSIC_CATEGORY,
    videoEmbeddable: "true",
    videoSyndicated: "true",
    maxResults: String(max),
    q,
    key,
  });
  let res: Response;
  try {
    res = await fetch(`${API}/search?${params}`, { signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new Error("Couldn't reach YouTube search.", { cause: err });
  }
  const data = (await res.json().catch(() => ({}))) as SearchResp;
  if (!res.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") throw new Error("YouTube search quota used up for today — paste a link instead.");
    if (res.status === 403 || res.status === 400) throw new Error(`YouTube search refused the API key (${data.error?.message ?? res.status}).`);
    throw new Error(`YouTube search error (${res.status}).`);
  }
  const hits: YouTubeHit[] = [];
  for (const it of data.items ?? []) {
    const id = it.id?.videoId;
    if (!id) continue;
    const title = decodeEntities(it.snippet?.title ?? "");
    const channel = decodeEntities(it.snippet?.channelTitle ?? "");
    const kind = classifyUpload(title, channel, artist);
    hits.push({
      videoId: id,
      title,
      channel,
      thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? "",
      duration: 0,
      kind,
      official: isOfficialKind(kind),
    });
  }
  if (!hits.length) return hits;
  // durations (1 quota unit)
  try {
    const p2 = new URLSearchParams({ part: "contentDetails", id: hits.map((h) => h.videoId).join(","), key });
    const r2 = await fetch(`${API}/videos?${p2}`, { signal });
    if (r2.ok) {
      const d2 = (await r2.json()) as VideosResp;
      const byId = new Map((d2.items ?? []).map((v) => [v.id ?? "", parseIsoDuration(v.contentDetails?.duration ?? "")]));
      for (const h of hits) h.duration = byId.get(h.videoId) ?? 0;
    }
  } catch {
    /* durations are optional */
  }
  return hits;
}
