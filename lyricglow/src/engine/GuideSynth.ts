// ─── GuideSynth ────────────────────────────────────────────────────────────
// The "ever so light" audible cue over a real backing track: a soft hum that
// breathes in just before every line (pitched to the line's first note, or to a
// gentle default per voice) and a faint tick on each word onset. Scheduled a few
// hundred ms ahead against the engine clock, like DemoSynth, but mixed very low
// and kept out of the stage analyser so the lights keep following the music.

import type { Voice } from "../lyrics";
import type { FlatSyllable, TrackTimeline } from "../model/timeline";
import type { AudioGraph } from "./AudioGraph";
import { midiToHz } from "./pitch";
import type { Frame, PlaybackEngine } from "./PlaybackEngine";

const LOOKAHEAD = 0.4; // seconds of song scheduled ahead of the clock
const LATE_GRACE = 0.05; // still trigger cues that started this long ago
/** the line hum starts this long before the first word (song seconds at 1×) */
export const LINE_LEAD_S = 0.22;
/** master level at slider = 1; the default slider sits at 0.25 → a hint, not a part */
const MAX_MASTER = 0.42;
/** fallback hum pitch per voice when the lyrics carry no melody */
const DEFAULT_HZ: Record<Voice, number> = { male: 196, female: 392, duet: 294 };

interface ActiveNode {
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  stopAt: number;
}

export class GuideSynth {
  /** cues scheduled since creation (exposed on <html data-guide-cues> for tests) */
  scheduledCount = 0;

  private graph: AudioGraph;
  private timeline: TrackTimeline;
  private level: number;
  private master: GainNode | null = null;
  private active: ActiveNode[] = [];
  private unsub: (() => void) | null = null;
  private lastGen = -1;
  private wasPlaying = false;
  private cursor = 0;
  private cursorValid = false;

  constructor(graph: AudioGraph, timeline: TrackTimeline, level = 0.25) {
    this.graph = graph;
    this.timeline = timeline;
    this.level = level;
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
        this.master.disconnect();
      } catch {
        /* ignore */
      }
      this.master = null;
    }
  }

  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    const ctx = this.graph.ctx;
    if (this.master && ctx) this.master.gain.setTargetAtTime(this.level * MAX_MASTER, ctx.currentTime, 0.03);
  }

  private ensureNodes(): AudioContext | null {
    const ctx = this.graph.ensureContext();
    if (!ctx) return null;
    if (!this.master) {
      const master = ctx.createGain();
      master.gain.value = this.level * MAX_MASTER;
      master.connect(ctx.destination);
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
        for (const n of v.nodes) n.stop(now + 0.1);
      } catch {
        /* already stopped */
      }
    }
    this.active = [];
  }

  private resetCursor(t: number): void {
    const flat = this.timeline.flat;
    let lo = 0;
    let hi = flat.length;
    // cue times can precede a syllable by LINE_LEAD_S, so search from a little earlier
    const from = t - LATE_GRACE - LINE_LEAD_S;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (flat[mid].start < from) lo = mid + 1;
      else hi = mid;
    }
    this.cursor = lo;
    this.cursorValid = true;
  }

  private onFrame = (f: Readonly<Frame>): void => {
    if (f.generation !== this.lastGen) {
      this.lastGen = f.generation;
      this.cutAll();
      this.cursorValid = false;
    }
    if (!f.playing || this.level <= 0) {
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
    if (!this.wasPlaying || !this.cursorValid) this.resetCursor(t);
    this.wasPlaying = true;

    const rate = Math.max(0.25, f.rate);
    const now = ctx.currentTime;
    const flat = this.timeline.flat;
    const horizon = t + (LOOKAHEAD + LINE_LEAD_S) * rate;

    while (this.cursor < flat.length && flat[this.cursor].start < horizon) {
      const s = flat[this.cursor++];
      const lineStart = s.sylIdx === 0;
      const wordStart = lineStart || this.wordStartsAt(s);
      if (!wordStart) continue;
      const cueAt = lineStart ? s.start - LINE_LEAD_S * rate : s.start;
      if (cueAt < t - LATE_GRACE) continue;
      const when = now + Math.max(0, (cueAt - t) / rate);
      if (lineStart) this.playHum(ctx, s, when, Math.max(0.16, Math.min(0.32, (s.end - s.start) / rate + LINE_LEAD_S)));
      else this.playTick(ctx, when);
    }
    if (this.active.length > 48) this.active = this.active.filter((v) => v.stopAt > now);
    document.documentElement.dataset.guideCues = String(this.scheduledCount);
  };

  private wordStartsAt(s: FlatSyllable): boolean {
    const prev = this.timeline.flat[s.globalIdx - 1];
    return !prev || prev.lineIdx !== s.lineIdx || prev.wordEnd;
  }

  /** breathy hum: sine + quiet octave, low-passed, swelling into the first word */
  private playHum(ctx: AudioContext, s: FlatSyllable, when: number, dur: number): void {
    const master = this.master!;
    const hz = s.note !== undefined ? midiToHz(s.note) : DEFAULT_HZ[s.voice];
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = Math.min(2400, hz * 4);
    filter.Q.value = 0.5;
    gain.connect(filter);
    filter.connect(master);
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
      o.stop(when + dur + 0.3);
      nodes.push(o);
    };
    add("sine", 1, 0.6);
    add("triangle", 1, 0.2, 4);
    add("sine", 2, 0.1);
    const g = gain.gain;
    g.setValueAtTime(0.0001, when);
    g.exponentialRampToValueAtTime(0.5, when + 0.08);
    g.setValueAtTime(0.5, when + dur * 0.7);
    g.exponentialRampToValueAtTime(0.0001, when + dur + 0.2);
    this.active.push({ gain, nodes, stopAt: when + dur + 0.3 });
    this.scheduledCount++;
  }

  /** soft wooden tock on a word onset */
  private playTick(ctx: AudioContext, when: number): void {
    const master = this.master!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = ctx.createBiquadFilter();
    o.type = "sine";
    o.frequency.setValueAtTime(1400, when);
    o.frequency.exponentialRampToValueAtTime(900, when + 0.03);
    f.type = "bandpass";
    f.frequency.value = 1200;
    f.Q.value = 2;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.22, when + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
    o.connect(f);
    f.connect(g);
    g.connect(master);
    o.start(when);
    o.stop(when + 0.07);
    this.active.push({ gain: g, nodes: [o], stopAt: when + 0.07 });
    this.scheduledCount++;
  }
}
