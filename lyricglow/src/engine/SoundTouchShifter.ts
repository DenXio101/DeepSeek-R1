// ─── SoundTouchShifter ───────────────────────────────────────────────────────
// A pitch shifter for local files: the SoundTouch algorithm running as an
// AudioWorklet (@soundtouchjs/audio-worklet, MPL-2.0). The module and the
// processor file are loaded lazily on the first non-zero key, once per context.
// Tempo stays on the media element (`playbackRate`); the node only mirrors it so
// it can correct the pitch the rate change introduced while `preservesPitch` is off.

import type { SoundTouchNode } from "@soundtouchjs/audio-worklet";

export type ShifterStatus = "idle" | "loading" | "on" | "unavailable";

export const KEY_MIN = -6;
export const KEY_MAX = 6;

/** "+2", "−3", "0" */
export function formatKey(semitones: number): string {
  return semitones > 0 ? `+${semitones}` : semitones < 0 ? `−${-semitones}` : "0";
}

/**
 * Delay the worklet adds, in wall seconds. Measured by scripts/spike/key-spike.mjs on
 * 2026-11-11 (headless Chromium 1243, 44.1 kHz, envelope cross-correlation of tone bursts):
 * 126–133 ms at 1×, 103–120 ms at 0.5× and 2×. One constant keeps every reliable cell
 * within the 30 ms lyric-sync tolerance; re-measure if the package version changes.
 */
export const SHIFTER_LATENCY_S = 0.128;

type NodeCtor = typeof SoundTouchNode;
const registrations = new WeakMap<BaseAudioContext, Promise<NodeCtor>>();

/** import the node module + processor URL and register the worklet, once per context */
function registerFor(ctx: BaseAudioContext): Promise<NodeCtor> {
  let p = registrations.get(ctx);
  if (!p) {
    p = (async () => {
      if (typeof AudioWorkletNode === "undefined" || !ctx.audioWorklet) throw new Error("this browser has no AudioWorklet");
      const [{ SoundTouchNode: Ctor }, { default: processorUrl }] = await Promise.all([
        import("@soundtouchjs/audio-worklet"),
        import("@soundtouchjs/audio-worklet/processor?url"),
      ]);
      await Ctor.register(ctx, processorUrl);
      return Ctor;
    })();
    registrations.set(ctx, p);
    p.catch(() => registrations.delete(ctx));
  }
  return p;
}

export class SoundTouchShifter {
  status: ShifterStatus = "idle";
  reason: string | null = null;
  /** the worklet node once loaded; connect chain → node → destination */
  node: AudioNode | null = null;
  private st: SoundTouchNode | null = null;
  private semitones = 0;
  private rate = 1;
  private readonly ctx: AudioContext;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
  }

  /** resolves true when the node exists (loads it on first call) */
  async load(): Promise<boolean> {
    if (this.st) return true;
    this.status = "loading";
    this.reason = null;
    try {
      const Ctor = await registerFor(this.ctx);
      const node = new Ctor({ context: this.ctx });
      this.st = node;
      this.node = node;
      this.apply();
      this.status = "on";
      return true;
    } catch (err) {
      this.status = "unavailable";
      this.reason = err instanceof Error ? err.message : "couldn't load the pitch shifter";
      return false;
    }
  }

  setSemitones(n: number): void {
    this.semitones = Math.max(KEY_MIN, Math.min(KEY_MAX, Math.round(n)));
    this.apply();
  }

  /** mirror of the element's playbackRate (the processor divides pitch by it) */
  setRate(r: number): void {
    this.rate = r > 0 ? r : 1;
    this.apply();
  }

  private apply(): void {
    if (!this.st) return;
    this.st.pitchSemitones.value = this.semitones;
    this.st.playbackRate.value = this.rate;
  }

  dispose(): void {
    try {
      this.st?.disconnect();
    } catch {
      /* already gone */
    }
    this.st = null;
    this.node = null;
    this.status = "idle";
  }
}
