// ─── YouTube IFrame Player: loader, URL parsing, Transport adapter ─────────
import type { Transport, TransportEvent } from "./Transport";

/** Minimal typings for the parts of the IFrame API we use (no @types dependency). */
export interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getAvailablePlaybackRates(): number[];
  destroy(): void;
}
export interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}
export interface YTPlayerOptions {
  videoId: string;
  width?: string | number;
  height?: string | number;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTPlayerEvent) => void;
    onStateChange?: (e: YTPlayerEvent) => void;
    onPlaybackRateChange?: (e: YTPlayerEvent) => void;
    onError?: (e: YTPlayerEvent) => void;
  };
}
export interface YTNamespace {
  Player: new (el: HTMLElement | string, opts: YTPlayerOptions) => YTPlayer;
  PlayerState: { UNSTARTED: number; ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number };
}
type YTWindow = { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

export const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

let apiPromise: Promise<YTNamespace> | null = null;

/** Load https://www.youtube.com/iframe_api once and resolve with window.YT. */
export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) resolve(w.YT);
      else reject(new Error("YouTube API loaded without window.YT"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("Couldn't load the YouTube player (blocked or offline)."));
    };
    document.head.appendChild(script);
    window.setTimeout(() => {
      if (!w.YT?.Player) {
        apiPromise = null;
        reject(new Error("YouTube player took too long to load."));
      }
    }, 15000);
  });
  return apiPromise;
}

/** Accepts watch URLs, youtu.be, shorts, embed, music.youtube.com, or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  const id = (x: string | null | undefined) => (x && /^[A-Za-z0-9_-]{11}$/.test(x) ? x : null);
  if (host === "youtu.be") return id(url.pathname.slice(1).split("/")[0]);
  if (host === "youtube.com" || host === "music.youtube.com" || host === "youtube-nocookie.com") {
    const v = id(url.searchParams.get("v"));
    if (v) return v;
    const m = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    if (m) return m[1];
  }
  return null;
}

export function youtubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return "That doesn't look like a valid YouTube video id.";
    case 5:
      return "This video can't be played in the embedded player.";
    case 100:
      return "Video not found (removed or private).";
    case 101:
    case 150:
      return "The uploader doesn't allow this video to be embedded — try another upload of the song.";
    default:
      return "YouTube player error.";
  }
}

/**
 * Transport over a ready YT.Player. State changes arrive through `notify`,
 * which the owning component wires to the player's onStateChange/onPlaybackRateChange.
 */
export function youtubeTransport(player: YTPlayer): Transport & { notify(ev: TransportEvent): void } {
  const subs = new Set<(ev: TransportEvent) => void>();
  let lastRate = 1;
  const safe = <T>(f: () => T, fallback: T): T => {
    try {
      return f();
    } catch {
      return fallback;
    }
  };
  return {
    kind: "youtube",
    // the iframe reports time a few times a second → allow longer extrapolation
    extrapolation: 0.6,
    time: () => safe(() => player.getCurrentTime() || 0, 0),
    duration: () => safe(() => player.getDuration() || 0, 0),
    playing: () => safe(() => player.getPlayerState(), -1) === YT_STATE.PLAYING,
    ended: () => safe(() => player.getPlayerState(), -1) === YT_STATE.ENDED,
    rate: () => safe(() => player.getPlaybackRate() || lastRate, lastRate),
    play: () => safe(() => player.playVideo(), undefined),
    pause: () => safe(() => player.pauseVideo(), undefined),
    seek: (t) => {
      safe(() => player.seekTo(t, true), undefined);
      for (const cb of subs) cb("seek");
    },
    setRate: (r) => {
      // YouTube only supports a fixed set of rates; pick the nearest
      const avail = safe(() => player.getAvailablePlaybackRates(), [1]);
      let best = avail[0] ?? 1;
      for (const a of avail) if (Math.abs(a - r) < Math.abs(best - r)) best = a;
      lastRate = best;
      safe(() => player.setPlaybackRate(best), undefined);
    },
    subscribe: (cb) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    notify: (ev) => {
      for (const cb of subs) cb(ev);
    },
  };
}
