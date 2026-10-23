// ─── KaraokeSession ────────────────────────────────────────────────────────
// Per-frame orchestrator: which line is active, count-ins, section changes,
// song finished. Runs in the engine's "update" bucket and publishes a coarse
// snapshot that changes only when a value changes (scoring is layered on in
// a later phase through the same snapshot).

import type { Section } from "../lyrics";
import type { TrackTimeline } from "../model/timeline";
import type { Frame, PlaybackEngine } from "./PlaybackEngine";
import type { PitchSample, PitchTracker } from "./PitchTracker";
import {
  applyResult,
  createScoreState,
  rateLine,
  recompute,
  scoreSyllable,
  summarize,
  type Difficulty,
  type LineRating,
  type ScoreState,
  type ScoreSummary,
  type SyllableResult,
} from "./scoring";

export interface ScoreSnapshot {
  total: number;
  combo: number;
  maxCombo: number;
  evaluated: number;
  lastLine: { rating: LineRating; lineIdx: number; key: number } | null;
}

export interface ScoringOptions {
  difficulty: Difficulty;
  /** seconds between the singer's sound and the mic sample */
  micLatency: number;
}

export interface CountInState {
  lineIdx: number;
  /** number currently shown: 3, 2, 1 */
  show: number;
  total: number;
}

export interface SectionEvent {
  name: Section;
  /** unique per firing so the UI can replay its animation */
  key: number;
}

export interface SessionSnapshot {
  /** active line or -1 during a gap */
  activeIdx: number;
  /** activeIdx when active, otherwise the index of the next upcoming line (lines.length past the end) */
  cursorIdx: number;
  countIn: CountInState | null;
  sectionEvent: SectionEvent | null;
  finished: boolean;
  /** engine generation at the last change (seek/source) */
  generation: number;
  /** null while the microphone is off */
  score: ScoreSnapshot | null;
  /** filled when the song finishes with scoring on */
  summary: ScoreSummary | null;
}

export class KaraokeSession {
  readonly timeline: TrackTimeline;
  private engine: PlaybackEngine | null = null;
  private subs = new Set<() => void>();
  private snapshot: SessionSnapshot = {
    activeIdx: -1,
    cursorIdx: 0,
    countIn: null,
    sectionEvent: null,
    finished: false,
    generation: 0,
    score: null,
    summary: null,
  };
  private lastSectionLine = -1;
  private sectionKey = 0;
  private tracker: PitchTracker | null = null;
  private scoring: ScoringOptions = { difficulty: "normal", micLatency: 0.06 };
  private scoreState: ScoreState = createScoreState();
  private nextIdx = 0;
  private lastT = 0;
  private ratingKey = 0;
  private lastLine: ScoreSnapshot["lastLine"] = null;
  /** song time of the most recent frame (after offset) */
  songTime = 0;

  constructor(timeline: TrackTimeline) {
    this.timeline = timeline;
  }

  getSnapshot = (): SessionSnapshot => this.snapshot;

  subscribe = (cb: () => void): (() => void) => {
    this.subs.add(cb);
    return () => {
      this.subs.delete(cb);
    };
  };

  attach(engine: PlaybackEngine): () => void {
    this.engine = engine;
    const unsub = engine.subscribeFrame(this.onFrame, "update");
    return () => {
      unsub();
      if (this.engine === engine) this.engine = null;
    };
  }

  // ── scoring ──────────────────────────────────────────────────────────
  setScoring(tracker: PitchTracker | null, opts: ScoringOptions): void {
    const turningOn = !!tracker && !this.tracker;
    this.tracker = tracker;
    this.scoring = opts;
    if (!tracker) {
      this.set({ score: null, summary: null });
      return;
    }
    if (turningOn) {
      // start with the first syllable that hasn't clearly passed yet
      const t = this.songTime;
      let i = 0;
      while (i < this.timeline.flat.length && this.timeline.flat[i].end < t - 0.5) i++;
      this.nextIdx = Math.max(this.nextIdx, i);
      this.publishScore();
    }
  }

  resetScore(): void {
    this.scoreState = createScoreState();
    this.nextIdx = 0;
    this.lastLine = null;
    this.set({ summary: null });
    this.publishScore();
  }

  getResult(globalIdx: number): SyllableResult | undefined {
    return this.scoreState.results.get(globalIdx);
  }

  private publishScore(): void {
    if (!this.tracker) return;
    const st = this.scoreState;
    this.set({ score: { total: st.total, combo: st.combo, maxCombo: st.maxCombo, evaluated: st.results.size, lastLine: this.lastLine } });
  }

  private scoreFrame(t: number, seeked: boolean): void {
    const tracker = this.tracker;
    if (!tracker) return;
    const flat = this.timeline.flat;
    const lat = this.scoring.micLatency;

    if (seeked && t < this.lastT) {
      // backward seek: forget results that start after the new position
      let removed = false;
      for (const idx of [...this.scoreState.results.keys()]) {
        if (flat[idx].start >= t - 0.05) {
          this.scoreState.results.delete(idx);
          removed = true;
        }
      }
      if (removed) recompute(this.scoreState, this.timeline);
      let i = 0;
      while (i < flat.length && flat[i].end < t - 0.05) i++;
      this.nextIdx = Math.min(this.nextIdx, i);
      tracker.truncateAfter(t);
      this.publishScore();
    } else if (seeked && t > this.lastT + 1.5) {
      // forward jump: don't score syllables that were skipped
      let i = this.nextIdx;
      while (i < flat.length && flat[i].end < t - 0.5) i++;
      this.nextIdx = i;
    }

    let changed = false;
    while (this.nextIdx < flat.length && t >= flat[this.nextIdx].end + lat + 0.1) {
      const syl = flat[this.nextIdx];
      const prevEnd = this.nextIdx > 0 ? flat[this.nextIdx - 1].end : -Infinity;
      const samples: PitchSample[] = [];
      for (const s of tracker.history) {
        const ts = s.t - lat;
        if (ts < syl.start - 0.45) continue;
        if (ts > syl.end + 0.05) break;
        samples.push({ t: ts, midi: s.midi, confidence: s.confidence, rms: s.rms });
      }
      const r = scoreSyllable(syl, prevEnd, samples, this.scoring.difficulty);
      applyResult(this.scoreState, syl, r);
      const next = flat[this.nextIdx + 1];
      if (!next || next.lineIdx !== syl.lineIdx) {
        const rating = rateLine(this.scoreState, this.timeline, syl.lineIdx);
        this.lastLine = { rating, lineIdx: syl.lineIdx, key: ++this.ratingKey };
      }
      this.nextIdx++;
      changed = true;
    }
    if (changed) this.publishScore();
  }

  private set(partial: Partial<SessionSnapshot>): void {
    const prev = this.snapshot;
    let changed = false;
    for (const k in partial) {
      const key = k as keyof SessionSnapshot;
      if (prev[key] !== partial[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.snapshot = { ...prev, ...partial };
    for (const cb of this.subs) cb();
  }

  private onFrame = (f: Readonly<Frame>): void => {
    const tl = this.timeline;
    const t = f.time + (tl.track.offset ?? 0);
    this.songTime = t;
    const prev = this.snapshot;

    // generation (seek / source change)
    const seeked = f.generation !== prev.generation;
    if (seeked) {
      this.lastSectionLine = -1;
    }

    // active line
    const activeIdx = tl.findActiveLine(t);
    let cursorIdx = activeIdx;
    if (activeIdx < 0) {
      // next upcoming line
      let lo = 0;
      let hi = tl.lineStarts.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tl.lineStarts[mid] <= t) lo = mid + 1;
        else hi = mid;
      }
      cursorIdx = lo;
    }

    // count-in for the upcoming/active line
    let countIn: CountInState | null = prev.countIn;
    const ciLine = activeIdx >= 0 ? activeIdx : cursorIdx;
    const ci = tl.countIns.get(ciLine);
    if (ci && t >= ci.beats[0] - 0.05 && t < ci.beats[ci.beats.length - 1]) {
      let k = 0;
      for (let i = 0; i < ci.beats.length - 1; i++) if (ci.beats[i] <= t) k = i + 1;
      const show = ci.beats.length - k;
      if (!countIn || countIn.lineIdx !== ciLine || countIn.show !== show)
        countIn = { lineIdx: ciLine, show, total: ci.beats.length - 1 };
    } else countIn = null;

    // section change (fires when a section-opening line becomes active)
    let sectionEvent = prev.sectionEvent;
    if (activeIdx >= 0 && activeIdx !== this.lastSectionLine) {
      if (tl.sectionChanges.has(activeIdx) && prev.activeIdx !== activeIdx) {
        sectionEvent = { name: tl.track.lines[activeIdx].section, key: ++this.sectionKey };
      }
      this.lastSectionLine = activeIdx;
    }

    const playback = this.engine?.getSnapshot();
    const finished = !!playback?.ended;

    this.scoreFrame(t, seeked);
    this.lastT = t;

    let summary = prev.summary;
    if (finished && !prev.finished && this.tracker) {
      summary = summarize(this.scoreState, tl);
    } else if (!finished && prev.finished) summary = null;

    this.set({ activeIdx, cursorIdx, countIn, sectionEvent, finished, generation: f.generation, summary });
  };
}
