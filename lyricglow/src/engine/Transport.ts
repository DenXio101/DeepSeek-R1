// ─── Transport ─────────────────────────────────────────────────────────────
// What the PlaybackEngine needs from any external clock: an <audio>/<video>
// element, a YouTube player, … The engine polls time() every frame and
// extrapolates between coarse updates (bounded by `extrapolation`).

export type TransportKind = "media" | "youtube";
export type TransportEvent = "play" | "pause" | "ended" | "duration" | "rate" | "seek";

export interface Transport {
  readonly kind: TransportKind;
  /** seconds the engine may extrapolate past the last reported time */
  readonly extrapolation: number;
  /** underlying element when there is one (for the audio analyser) */
  readonly element?: HTMLMediaElement;
  time(): number;
  duration(): number;
  playing(): boolean;
  ended(): boolean;
  rate(): number;
  play(): void;
  pause(): void;
  seek(t: number): void;
  setRate(r: number): void;
  subscribe(cb: (ev: TransportEvent) => void): () => void;
  /** called when the engine lets go of the transport */
  dispose?(): void;
}

/** Adapter for HTMLMediaElement. */
export function mediaTransport(el: HTMLMediaElement): Transport {
  const dur = () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0);
  return {
    kind: "media",
    extrapolation: 0.25,
    element: el,
    time: () => el.currentTime,
    duration: dur,
    playing: () => !el.paused && !el.ended,
    ended: () => el.ended,
    rate: () => el.playbackRate,
    play: () => {
      void el.play().catch(() => {
        /* autoplay policy or decode error: snapshot stays paused */
      });
    },
    pause: () => el.pause(),
    seek: (t) => {
      el.currentTime = t;
    },
    setRate: (r) => {
      el.playbackRate = r;
    },
    subscribe: (cb) => {
      const map: [string, TransportEvent][] = [
        ["play", "play"],
        ["pause", "pause"],
        ["ended", "ended"],
        ["durationchange", "duration"],
        ["loadedmetadata", "duration"],
        ["ratechange", "rate"],
        ["seeking", "seek"],
      ];
      const handlers = map.map(([dom, ev]) => {
        const h = () => cb(ev);
        el.addEventListener(dom, h);
        return [dom, h] as const;
      });
      return () => {
        for (const [dom, h] of handlers) el.removeEventListener(dom, h);
      };
    },
  };
}
