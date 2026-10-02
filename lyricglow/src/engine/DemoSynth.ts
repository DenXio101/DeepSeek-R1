// ─── DemoSynth ─────────────────────────────────────────────────────────────
// Gives the built-in demo a voice: a soft electric-piano melody from each
// syllable's `note`, a warm bass on the beat and a light tick, all scheduled a
// few hundred ms ahead against the engine clock. Output goes through the
// AudioGraph's analyser so the stage lights react to it.

import type { Voice } from "../lyrics";
import type { FlatSyllable, TrackTimeline } from "../model/timeline";
import type { AudioGraph } from "./AudioGraph";
import { midiToHz } from "./pitch";
import type { Frame, PlaybackEngine } from "./PlaybackEngine";

const LOOKAHEAD = 0.35; // seconds of song scheduled ahead of the clock
const LATE_GRACE = 0.06; // still trigger notes that started this long ago

interface ActiveVoice {
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  stopAt: number;
}

export class DemoSynth {
  enabled = true;
  /** notes scheduled since the last reset (exposed for tests via data attribute) */
  scheduledCount = 0;

  private graph: AudioGraph;
  private timeline: TrackTimeline;
  private master: GainNode | null = null;
  private active: ActiveVoice[] = [];
  private unsub: (() => void) | null = null;
  private lastGen = -1;
  private wasPlaying = false;
  private sylCursor = 0;
  private beatCursor = 0;
  private cursorValid = false;

  constructor(graph: AudioGraph, timeline: TrackTimeline) {
    this.graph = graph;
    this.timeline = timeline;
  }

  attach(engine: PlaybackEngine): () => void {
    this.unsub = engine.subscribeFrame(this.onFrame, "update");
    return () => this.detach();
  }

  detach(): void {
    this.unsub?.();
    this.unsub = null;
    this.cutAll();
    this.cursorValid = false;
    if (this.master) {
      try {
        this.graph.detachSourceNode(this.master);
        this.master.disconnect();
      } catch {
        /* ignore */
      }
      this.master = null;
    }
  }

  private ensureNodes(): AudioContext | null {
    const ctx = this.graph.ensureContext();
    if (!ctx) return null;
    if (!this.master) {
      const master = ctx.createGain();
      master.gain.value = 0.55;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 3;
      master.connect(comp);
      comp.connect(ctx.destination);
      this.graph.attachSourceNode(master);
      this.master = master;
    }
    return ctx;
  }

  private cutAll(): void {
    const ctx = this.graph.ctx;
    const now = ctx?.currentTime ?? 0;
    for (const v of this.active) {
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.02);
        for (const n of v.nodes) n.stop(now + 0.12);
      } catch {
        /* already stopped */
      }
    }
    this.active = [];
  }

  private pruneActive(now: number): void {
    if (this.active.length > 64) this.active = this.active.filter((v) => v.stopAt > now);
  }

  private resetCursors(t: number): void {
    const flat = this.timeline.flat;
    let lo = 0;
    let hi = flat.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (flat[mid].start < t - LATE_GRACE) lo = mid + 1;
      else hi = mid;
    }
    this.sylCursor = lo;
    const { beat, beatOffset } = this.timeline;
    this.beatCursor = beat > 0 ? Math.max(0, Math.ceil((t - LATE_GRACE - beatOffset) / beat)) : 0;
    this.cursorValid = true;
  }

  private onFrame = (f: Readonly<Frame>): void => {
    if (f.generation !== this.lastGen) {
      this.lastGen = f.generation;
      this.cutAll();
      this.cursorValid = false;
    }
    if (!f.playing || !this.enabled) {
      if (this.wasPlaying) {
        this.cutAll();
        this.cursorValid = false;
      }
      this.wasPlaying = false;
      return;
    }
    const ctx = this.ensureNodes();
    if (!ctx || ctx.state !== "running" || !this.master) return;
    const t = f.time + (this.timeline.track.offset ?? 0);
    if (!this.wasPlaying || !this.cursorValid) this.resetCursors(t);
    this.wasPlaying = true;

    const rate = Math.max(0.25, f.rate);
    const now = ctx.currentTime;
    const flat = this.timeline.flat;
    const horizon = t + LOOKAHEAD * rate;

    // melody
    while (this.sylCursor < flat.length && flat[this.sylCursor].start < horizon) {
      const s = flat[this.sylCursor++];
      if (s.note === undefined || s.start < t - LATE_GRACE) continue;
      const when = now + Math.max(0, (s.start - t) / rate);
      const dur = Math.max(0.09, (s.end - s.start) / rate);
      this.playNote(ctx, s, when, dur);
    }

    // beat: bass on every beat, tick on the off-beats
    const { beat, beatOffset } = this.timeline;
    if (beat > 0) {
      while (beatOffset + this.beatCursor * beat < horizon) {
        const k = this.beatCursor++;
        const bt = beatOffset + k * beat;
        if (bt < t - LATE_GRACE) continue;
        const when = now + Math.max(0, (bt - t) / rate);
        if (k % 2 === 0) this.playKick(ctx, when);
        else this.playTick(ctx, when);
      }
    }
    this.pruneActive(now);
    document.documentElement.dataset.synthNotes = String(this.scheduledCount);
  };

  private playNote(ctx: AudioContext, s: FlatSyllable, when: number, dur: number): void {
    const master = this.master!;
    const hz = midiToHz(s.note!);
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(6000, hz * 6);
    filter.Q.value = 0.7;
    gain.connect(filter);
    filter.connect(master);

    const voice: Voice = s.voice;
    const nodes: AudioScheduledSourceNode[] = [];
    const add = (type: OscillatorType, mult: number, level: number, detune = 0) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz * mult;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      o.connect(g);
      g.connect(gain);
      o.start(when);
      o.stop(when + dur + 0.4);
      nodes.push(o);
    };
    // timbre per voice: male = warmer/rounder, female = brighter, duet = both layered
    if (voice === "male") {
      add("triangle", 1, 0.55);
      add("sine", 0.5, 0.25);
      add("sawtooth", 1, 0.08, 6);
    } else if (voice === "female") {
      add("sine", 1, 0.5);
      add("triangle", 2, 0.16, -4);
      add("sine", 3, 0.05);
    } else {
      add("triangle", 1, 0.45, -5);
      add("triangle", 1, 0.45, 5);
      add("sine", 2, 0.12);
    }

    const peak = s.emphasis ? 0.5 : 0.38;
    const g = gain.gain;
    g.setValueAtTime(0.0001, when);
    g.exponentialRampToValueAtTime(peak, when + 0.015);
    g.exponentialRampToValueAtTime(peak * 0.6, when + Math.min(0.25, dur * 0.5));
    g.setValueAtTime(peak * 0.6, when + dur);
    g.exponentialRampToValueAtTime(0.0001, when + dur + 0.25);
    this.active.push({ gain, nodes, stopAt: when + dur + 0.4 });
    this.scheduledCount++;
  }

  private playKick(ctx: AudioContext, when: number): void {
    const master = this.master!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(130, when);
    o.frequency.exponentialRampToValueAtTime(48, when + 0.14);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.5, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.26);
    o.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + 0.3);
    this.active.push({ gain: g, nodes: [o], stopAt: when + 0.3 });
  }

  private playTick(ctx: AudioContext, when: number): void {
    const master = this.master!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = "square";
    o.frequency.value = 3200;
    f.type = "highpass";
    f.frequency.value = 2500;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.06, when + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    o.connect(f);
    f.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + 0.06);
    this.active.push({ gain: g, nodes: [o], stopAt: when + 0.06 });
  }
}
