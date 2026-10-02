// ─── PlaybackEngine ────────────────────────────────────────────────────────
// Framework-agnostic clock + transport. Owns the single requestAnimationFrame
// loop; everything that needs per-frame time subscribes here. Coarse state
// (playing / ended / duration / rate) is published as immutable snapshots.

export type FramePhase = "update" | "render";

export interface Frame {
  /** media or demo time in song-seconds */
  time: number;
  /** wall-clock delta since the previous frame, seconds (clamped) */
  dt: number;
  rate: number;
  playing: boolean;
  /** performance.now() of this frame */
  now: number;
  /** bumps on seek / restart / source change so consumers reset caches */
  generation: number;
}

export type FrameCallback = (frame: Readonly<Frame>) => void;
export type SourceKind = "demo" | "media";

export interface PlaybackSnapshot {
  playing: boolean;
  ended: boolean;
  duration: number;
  rate: number;
  sourceKind: SourceKind;
  generation: number;
}

export const MIN_RATE = 0.5;
export const MAX_RATE = 2.0;

export class PlaybackEngine {
  readonly frame: Frame = { time: 0, dt: 0, rate: 1, playing: false, now: 0, generation: 0 };
  /** called synchronously inside play() (user gesture) — used to resume the AudioContext */
  private onBeforePlay: (() => void) | null = null;

  setBeforePlay(fn: (() => void) | null): void {
    this.onBeforePlay = fn;
  }

  private media: HTMLMediaElement | null = null;
  private mediaCleanup: (() => void) | null = null;
  private demoDuration = 60;
  private songTime = 0;
  private playingFlag = false;
  private ended = false;
  private duration = 60;

  private rafId = 0;
  private lastNow = 0;
  private pendingFrames = 0;
  private holds = 0;
  private lastMediaTime = -1;
  private lastMediaNow = 0;

  private updateSubs = new Set<FrameCallback>();
  private renderSubs = new Set<FrameCallback>();
  private stateSubs = new Set<() => void>();
  private snapshot: PlaybackSnapshot;

  constructor() {
    this.snapshot = this.buildSnapshot();
  }

  // ── snapshot store (useSyncExternalStore-compatible) ────────────────────
  getSnapshot = (): PlaybackSnapshot => this.snapshot;

  subscribeState = (cb: () => void): (() => void) => {
    this.stateSubs.add(cb);
    return () => {
      this.stateSubs.delete(cb);
    };
  };

  private buildSnapshot(): PlaybackSnapshot {
    return {
      playing: this.playingFlag,
      ended: this.ended,
      duration: this.duration,
      rate: this.frame.rate,
      sourceKind: this.media ? "media" : "demo",
      generation: this.frame.generation,
    };
  }

  private publish(): void {
    const next = this.buildSnapshot();
    const prev = this.snapshot;
    if (
      prev.playing === next.playing &&
      prev.ended === next.ended &&
      prev.duration === next.duration &&
      prev.rate === next.rate &&
      prev.sourceKind === next.sourceKind &&
      prev.generation === next.generation
    )
      return;
    this.snapshot = next;
    for (const cb of this.stateSubs) cb();
  }

  // ── frame subscriptions ─────────────────────────────────────────────────
  subscribeFrame(cb: FrameCallback, phase: FramePhase = "render"): () => void {
    const set = phase === "update" ? this.updateSubs : this.renderSubs;
    set.add(cb);
    this.requestFrame();
    return () => {
      set.delete(cb);
    };
  }

  /** run one more frame even while paused (after seek, resize, …) */
  requestFrame(): void {
    this.pendingFrames = Math.max(this.pendingFrames, 1);
    this.schedule();
  }

  /** keep the loop alive while paused (e.g. mic monitoring); returns release fn */
  hold(): () => void {
    this.holds++;
    this.schedule();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
    };
  }

  private schedule(): void {
    if (this.rafId) return;
    this.rafId = requestAnimationFrame(this.tick);
  }

  private tick = (now: number): void => {
    this.rafId = 0;
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    const f = this.frame;
    f.now = now;
    f.dt = dt;
    f.playing = this.playingFlag;

    if (this.media) {
      const el = this.media;
      const t = el.currentTime;
      if (this.playingFlag && t === this.lastMediaTime) {
        // browser hasn't advanced currentTime yet: extrapolate (bounded)
        const est = t + ((now - this.lastMediaNow) / 1000) * f.rate;
        f.time = Math.min(est, t + 0.25);
      } else {
        const wasPlaying = this.playingFlag && this.lastMediaTime >= 0;
        this.lastMediaTime = t;
        this.lastMediaNow = now;
        // never step backwards by a hair when a fresh value lands behind our estimate
        f.time = wasPlaying && f.time > t && f.time - t < 0.05 ? f.time : t;
      }
    } else {
      if (this.playingFlag) {
        this.songTime += dt * f.rate;
        if (this.songTime >= this.demoDuration) {
          this.songTime = this.demoDuration;
          this.playingFlag = false;
          this.ended = true;
          f.playing = false;
          this.publish();
        }
      }
      f.time = this.songTime;
    }

    for (const cb of this.updateSubs) cb(f);
    for (const cb of this.renderSubs) cb(f);

    if (this.pendingFrames > 0) this.pendingFrames--;
    if (this.playingFlag || this.holds > 0 || this.pendingFrames > 0) this.schedule();
    else this.lastNow = 0;
  };

  // ── sources ────────────────────────────────────────────────────────────
  setDemoDuration(d: number): void {
    this.demoDuration = Math.max(1, d);
    if (!this.media) {
      this.duration = this.demoDuration;
      if (this.songTime > this.duration) this.songTime = this.duration;
      this.publish();
      this.requestFrame();
    }
  }

  attachMedia(el: HTMLMediaElement | null): void {
    if (el === this.media) return;
    this.mediaCleanup?.();
    this.mediaCleanup = null;
    this.media = el;
    this.lastMediaTime = -1;
    this.frame.generation++;

    if (el) {
      el.playbackRate = this.frame.rate;
      this.playingFlag = !el.paused && !el.ended;
      this.ended = el.ended;
      this.duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;

      const onPlay = () => {
        this.playingFlag = true;
        this.ended = false;
        this.lastMediaTime = -1;
        this.publish();
        this.schedule();
      };
      const onPause = () => {
        this.playingFlag = false;
        this.publish();
        this.requestFrame();
      };
      const onEnded = () => {
        this.playingFlag = false;
        this.ended = true;
        this.publish();
        this.requestFrame();
      };
      const onDuration = () => {
        this.duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
        this.publish();
      };
      const onRate = () => {
        if (el.playbackRate > 0 && el.playbackRate !== this.frame.rate) {
          this.frame.rate = el.playbackRate;
          this.publish();
        }
      };
      const onSeek = () => {
        this.lastMediaTime = -1;
        this.frame.generation++;
        this.publish();
        this.requestFrame();
      };
      el.addEventListener("play", onPlay);
      el.addEventListener("pause", onPause);
      el.addEventListener("ended", onEnded);
      el.addEventListener("durationchange", onDuration);
      el.addEventListener("loadedmetadata", onDuration);
      el.addEventListener("ratechange", onRate);
      el.addEventListener("seeking", onSeek);
      this.mediaCleanup = () => {
        el.removeEventListener("play", onPlay);
        el.removeEventListener("pause", onPause);
        el.removeEventListener("ended", onEnded);
        el.removeEventListener("durationchange", onDuration);
        el.removeEventListener("loadedmetadata", onDuration);
        el.removeEventListener("ratechange", onRate);
        el.removeEventListener("seeking", onSeek);
      };
    } else {
      this.playingFlag = false;
      this.ended = false;
      this.songTime = 0;
      this.duration = this.demoDuration;
    }
    this.publish();
    this.requestFrame();
  }

  get mediaElement(): HTMLMediaElement | null {
    return this.media;
  }

  // ── transport ──────────────────────────────────────────────────────────
  play(): void {
    if (this.ended) this.seek(0);
    this.onBeforePlay?.();
    if (this.media) {
      void this.media.play().catch(() => {
        /* autoplay policy or decode error: snapshot stays paused */
      });
    } else {
      this.playingFlag = true;
      this.ended = false;
      this.lastNow = 0;
      this.publish();
      this.schedule();
    }
  }

  pause(): void {
    if (this.media) {
      this.media.pause();
    } else {
      this.playingFlag = false;
      this.publish();
      this.requestFrame();
    }
  }

  toggle(): void {
    if (this.playingFlag) this.pause();
    else this.play();
  }

  seek(t: number): void {
    const target = Math.max(0, Math.min(t, this.duration || t));
    this.frame.generation++;
    if (this.media) {
      this.media.currentTime = target;
      this.lastMediaTime = -1;
      this.frame.time = target;
    } else {
      this.songTime = target;
      this.frame.time = target;
      if (target < this.demoDuration) this.ended = false;
    }
    this.publish();
    this.requestFrame();
  }

  restart(): void {
    this.seek(0);
    this.play();
  }

  setRate(r: number): void {
    const rate = Math.max(MIN_RATE, Math.min(MAX_RATE, r));
    if (rate === this.frame.rate) return;
    this.frame.rate = rate;
    if (this.media) this.media.playbackRate = rate;
    this.publish();
    this.requestFrame();
  }

  /** stop the loop and detach listeners; the engine stays usable (StrictMode remounts) */
  dispose(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.lastNow = 0;
    this.mediaCleanup?.();
    this.mediaCleanup = null;
    this.media = null;
    this.playingFlag = false;
    this.publish();
  }
}
