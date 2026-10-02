// ─── YouTube Data API v3 search (needs a domain-restricted API key) ────────
export interface YouTubeHit {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  /** seconds, 0 when unknown */
  duration: number;
}

const API = "https://www.googleapis.com/youtube/v3";

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

export async function searchYouTube(query: string, key: string, signal?: AbortSignal, max = 8): Promise<YouTubeHit[]> {
  const q = query.trim();
  if (!q) return [];
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
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
    hits.push({
      videoId: id,
      title: decodeEntities(it.snippet?.title ?? ""),
      channel: decodeEntities(it.snippet?.channelTitle ?? ""),
      thumbnail: it.snippet?.thumbnails?.medium?.url ?? it.snippet?.thumbnails?.default?.url ?? "",
      duration: 0,
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
