// Reads the microphone analyser at ≤ 45 Hz inside the engine's update bucket and
// keeps a short, song-time-stamped history for scoring and the pitch lane.
import type { AudioGraph } from "./AudioGraph";
import { CLARITY_ACCEPT, detectPitchMPM, hzToMidi, PitchSmoother } from "./pitch";
import type { Frame, PlaybackEngine } from "./PlaybackEngine";

export interface PitchSample {
  /** song time (seconds) the sample was captured at, latency NOT yet applied */
  t: number;
  midi: number | null;
  confidence: number;
  rms: number;
}

const INTERVAL_MS = 22;
const HISTORY_SEC = 6;

export class PitchTracker {
  readonly history: PitchSample[] = [];
  latest: PitchSample = { t: 0, midi: null, confidence: 0, rms: 0 };
  private graph: AudioGraph;
  private smoother = new PitchSmoother();
  private lastRun = 0;
  private offset = 0;
  private release: (() => void) | null = null;
  private unsub: (() => void) | null = null;

  constructor(graph: AudioGraph) {
    this.graph = graph;
  }

  setOffset(offset: number): void {
    this.offset = offset;
  }

  attach(engine: PlaybackEngine): () => void {
    this.unsub = engine.subscribeFrame(this.onFrame, "update");
    this.release = engine.hold(); // keep frames flowing while paused so the lane shows live pitch
    return () => this.detach();
  }

  detach(): void {
    this.unsub?.();
    this.release?.();
    this.unsub = null;
    this.release = null;
    this.history.length = 0;
    this.smoother.reset();
    this.latest = { t: 0, midi: null, confidence: 0, rms: 0 };
  }

  private onFrame = (f: Readonly<Frame>): void => {
    if (f.now - this.lastRun < INTERVAL_MS) return;
    this.lastRun = f.now;
    const buf = this.graph.readMicTimeDomain();
    const t = f.time + this.offset;
    if (!buf) return;
    const r = detectPitchMPM(buf, this.graph.sampleRate);
    const accepted = r && r.clarity >= CLARITY_ACCEPT ? hzToMidi(r.hz) : null;
    const s = this.smoother.push(accepted, r?.clarity ?? 0, f.now / 1000);
    const sample: PitchSample = { t, midi: s.midi, confidence: s.confidence, rms: r?.rms ?? 0 };
    this.latest = sample;
    // during playback append; while paused keep only the live value
    if (f.playing) {
      this.history.push(sample);
      const cutoff = t - HISTORY_SEC;
      while (this.history.length && (this.history[0].t < cutoff || this.history[0].t > t + 0.5)) this.history.shift();
    }
  };

  /** drop history after a backward seek */
  truncateAfter(t: number): void {
    while (this.history.length && this.history[this.history.length - 1].t > t) this.history.pop();
  }
}
