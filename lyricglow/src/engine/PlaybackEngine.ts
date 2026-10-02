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

import { mediaTransport, type Transport, type TransportEvent } from "./Transport";

export type FrameCallback = (frame: Readonly<Frame>) => void;
export type SourceKind = "demo" | "media" | "youtube";

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

  private transport: Transport | null = null;
  private transportCleanup: (() => void) | null = null;
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
      sourceKind: this.transport ? this.transport.kind : "demo",
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

    if (this.transport) {
      const tr = this.transport;
      const t = tr.time();
      if (this.playingFlag && t === this.lastMediaTime) {
        // source hasn't advanced its clock yet: extrapolate (bounded)
        const est = t + ((now - this.lastMediaNow) / 1000) * f.rate;
        f.time = Math.min(est, t + tr.extrapolation);
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
    if (!this.transport) {
      this.duration = this.demoDuration;
      if (this.songTime > this.duration) this.songTime = this.duration;
      this.publish();
      this.requestFrame();
    }
  }

  /** convenience for <audio>/<video> elements */
  attachMedia(el: HTMLMediaElement | null): void {
    if (el === null) {
      if (this.transport?.kind === "media") this.attachTransport(null);
      return;
    }
    if (this.transport?.element === el) return;
    this.attachTransport(mediaTransport(el));
  }

  attachTransport(tr: Transport | null): void {
    if (tr === this.transport) return;
    this.transportCleanup?.();
    this.transportCleanup = null;
    this.transport?.dispose?.();
    this.transport = tr;
    this.lastMediaTime = -1;
    this.frame.generation++;

    if (tr) {
      tr.setRate(this.frame.rate);
      this.playingFlag = tr.playing();
      this.ended = tr.ended();
      this.duration = tr.duration();
      this.transportCleanup = tr.subscribe((ev: TransportEvent) => {
        switch (ev) {
          case "play":
            this.playingFlag = true;
            this.ended = false;
            this.lastMediaTime = -1;
            this.publish();
            this.schedule();
            break;
          case "pause":
            this.playingFlag = false;
            this.publish();
            this.requestFrame();
            break;
          case "ended":
            this.playingFlag = false;
            this.ended = true;
            this.publish();
            this.requestFrame();
            break;
          case "duration":
            this.duration = tr.duration();
            this.publish();
            break;
          case "rate": {
            const r = tr.rate();
            if (r > 0 && r !== this.frame.rate) {
              this.frame.rate = r;
              this.publish();
            }
            break;
          }
          case "seek":
            this.lastMediaTime = -1;
            this.frame.generation++;
            this.publish();
            this.requestFrame();
            break;
        }
      });
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
    return this.transport?.element ?? null;
  }

  get currentTransport(): Transport | null {
    return this.transport;
  }

  // ── transport ──────────────────────────────────────────────────────────
  play(): void {
    if (this.ended) this.seek(0);
    this.onBeforePlay?.();
    if (this.transport) {
      this.transport.play();
    } else {
      this.playingFlag = true;
      this.ended = false;
      this.lastNow = 0;
      this.publish();
      this.schedule();
    }
  }

  pause(): void {
    if (this.transport) {
      this.transport.pause();
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
    if (this.transport) {
      this.transport.seek(target);
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
    if (this.transport) this.transport.setRate(rate);
    this.publish();
    this.requestFrame();
  }

  /** stop the loop and detach listeners; the engine stays usable (StrictMode remounts) */
  dispose(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.lastNow = 0;
    this.transportCleanup?.();
    this.transportCleanup = null;
    this.transport?.dispose?.();
    this.transport = null;
    this.playingFlag = false;
    this.publish();
  }
}
