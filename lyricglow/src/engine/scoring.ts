// ─── Scoring (pure) ──────────────────────────────────────────────────────
import type { FlatSyllable, TrackTimeline } from "../model/timeline";
import { basePoints } from "../model/timeline";
import { pitchClassDistance } from "./pitch";
import type { PitchSample } from "./PitchTracker";

export type Difficulty = "easy" | "normal" | "hard";
export const DIFFICULTIES: readonly Difficulty[] = ["easy", "normal", "hard"];
export const TOLERANCE: Record<Difficulty, { full: number; zero: number }> = {
  easy: { full: 0.75, zero: 3.0 },
  normal: { full: 0.5, zero: 2.0 },
  hard: { full: 0.3, zero: 1.25 },
};

export type LineRating = "Perfect" | "Great" | "Good" | "Miss";
export type GradeLetter = "S" | "A" | "B" | "C" | "D" | "E";

export interface SyllableResult {
  globalIdx: number;
  lineIdx: number;
  ratio: number;
  pitchScore: number | null;
  timingScore: number;
  base: number;
  points: number;
  centsErr: number | null;
}

export interface ScoreState {
  total: number;
  combo: number;
  maxCombo: number;
  results: Map<number, SyllableResult>;
  lineRatings: Map<number, LineRating>;
}

export function createScoreState(): ScoreState {
  return { total: 0, combo: 0, maxCombo: 0, results: new Map(), lineRatings: new Map() };
}

export function pitchAccuracy(dist: number, d: Difficulty): number {
  const { full, zero } = TOLERANCE[d];
  return Math.max(0, Math.min(1, 1 - (dist - full) / (zero - full)));
}

const SAMPLE_DT = 0.022;
const ONSET_WINDOW = 0.35;
const ONSET_FREE = 0.08;
const ONSET_ZERO = 0.38;
const SILENCE_GAP = 0.08;
const CONF_MIN = 0.5;

/**
 * Score one syllable from the mic samples (song-time stamped, latency already applied by caller).
 * Timing-only when the syllable carries no target note.
 */
export function scoreSyllable(
  syl: Pick<FlatSyllable, "start" | "end" | "note" | "emphasis">,
  prevEnd: number,
  samples: readonly PitchSample[],
  difficulty: Difficulty,
): { pitchScore: number | null; timingScore: number; ratio: number; centsErr: number | null } {
  const dur = Math.max(0.05, syl.end - syl.start);
  const winStart = Math.max(syl.start - ONSET_WINDOW, prevEnd - 0.05);

  // coverage + pitch accuracy inside [start, end]
  let voiced = 0;
  let accSum = 0;
  let centsSum = 0;
  let centsN = 0;
  for (const s of samples) {
    if (s.t < syl.start || s.t > syl.end) continue;
    if (s.midi === null || s.confidence < CONF_MIN) continue;
    voiced++;
    if (syl.note !== undefined) {
      const dist = pitchClassDistance(s.midi, syl.note);
      accSum += pitchAccuracy(dist, difficulty);
      centsSum += dist * 100;
      centsN++;
    }
  }
  const coverage = Math.min(1, (voiced * SAMPLE_DT) / dur);

  // onset: first voiced sample after ≥ 80 ms of silence inside the search window; legato → on time
  let onset: number | null = null;
  let lastVoicedT = -Infinity;
  let sawVoicedBeforeStart = false;
  for (const s of samples) {
    if (s.t < winStart) {
      if (s.midi !== null && s.confidence >= CONF_MIN) lastVoicedT = s.t;
      continue;
    }
    if (s.t > syl.end) break;
    const v = s.midi !== null && s.confidence >= CONF_MIN;
    if (v) {
      if (s.t - lastVoicedT >= SILENCE_GAP) {
        onset = s.t;
        break;
      }
      if (s.t < syl.start) sawVoicedBeforeStart = true;
      lastVoicedT = s.t;
    }
  }
  let onsetScore: number;
  if (onset !== null) onsetScore = 1 - Math.max(0, Math.min(1, (Math.abs(onset - syl.start) - ONSET_FREE) / (ONSET_ZERO - ONSET_FREE)));
  else if (voiced > 0 || sawVoicedBeforeStart) onsetScore = 1; // continuous singing through the boundary
  else onsetScore = 0;
  const coverageScore = Math.min(1, coverage / 0.7);
  const timingScore = voiced === 0 && onset === null ? 0 : 0.5 * onsetScore + 0.5 * coverageScore;

  let pitchScore: number | null = null;
  let centsErr: number | null = null;
  if (syl.note !== undefined) {
    if (coverage < 0.3 || centsN === 0) pitchScore = 0;
    else pitchScore = (accSum / centsN) * Math.min(1, coverage / 0.6);
    centsErr = centsN ? centsSum / centsN : null;
  }
  const ratio = pitchScore === null ? timingScore : 0.6 * pitchScore + 0.4 * timingScore;
  return { pitchScore, timingScore, ratio, centsErr };
}

export function comboMultiplier(combo: number): number {
  return 1 + (0.5 * Math.min(combo, 50)) / 50;
}

/** append a result (in song order) and update totals/combo */
export function applyResult(state: ScoreState, syl: FlatSyllable, r: ReturnType<typeof scoreSyllable>): SyllableResult {
  const base = basePoints(syl);
  if (r.ratio >= 0.6) state.combo++;
  else if (r.ratio < 0.3) state.combo = 0;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  const points = Math.round(base * r.ratio * comboMultiplier(state.combo));
  const res: SyllableResult = { globalIdx: syl.globalIdx, lineIdx: syl.lineIdx, ratio: r.ratio, pitchScore: r.pitchScore, timingScore: r.timingScore, base, points, centsErr: r.centsErr };
  state.results.set(syl.globalIdx, res);
  state.total += points;
  return res;
}

export function lineRating(ratio: number): LineRating {
  return ratio >= 0.9 ? "Perfect" : ratio >= 0.72 ? "Great" : ratio >= 0.45 ? "Good" : "Miss";
}

export function rateLine(state: ScoreState, timeline: TrackTimeline, lineIdx: number): LineRating {
  let pts = 0;
  let base = 0;
  for (const s of timeline.flat) {
    if (s.lineIdx !== lineIdx) continue;
    const r = state.results.get(s.globalIdx);
    base += basePoints(s);
    if (r) pts += r.base * r.ratio;
  }
  const rating = lineRating(base ? pts / base : 0);
  state.lineRatings.set(lineIdx, rating);
  return rating;
}

/** rebuild totals after results were removed (backward seek) */
export function recompute(state: ScoreState, timeline: TrackTimeline): void {
  const ordered = [...state.results.values()].sort((a, b) => a.globalIdx - b.globalIdx);
  state.total = 0;
  state.combo = 0;
  state.maxCombo = 0;
  state.results.clear();
  for (const r of ordered) {
    const syl = timeline.flat[r.globalIdx];
    applyResult(state, syl, { pitchScore: r.pitchScore, timingScore: r.timingScore, ratio: r.ratio, centsErr: r.centsErr });
  }
  for (const li of [...state.lineRatings.keys()]) {
    const any = timeline.flat.some((s) => s.lineIdx === li && state.results.has(s.globalIdx));
    if (!any) state.lineRatings.delete(li);
  }
}

export interface ScoreSummary {
  total: number;
  maxScore: number;
  accuracy: number;
  coverage: number;
  grade: GradeLetter;
  partial: boolean;
  maxCombo: number;
  perfectLines: number;
  lines: number;
  meanCents: number | null;
}

export function gradeFor(ratio: number): GradeLetter {
  return ratio >= 0.95 ? "S" : ratio >= 0.85 ? "A" : ratio >= 0.7 ? "B" : ratio >= 0.5 ? "C" : ratio >= 0.3 ? "D" : "E";
}

export function summarize(state: ScoreState, timeline: TrackTimeline): ScoreSummary {
  let ratioSum = 0;
  let baseSum = 0;
  let centsSum = 0;
  let centsN = 0;
  for (const r of state.results.values()) {
    ratioSum += r.ratio * r.base;
    baseSum += r.base;
    if (r.centsErr !== null) {
      centsSum += r.centsErr;
      centsN++;
    }
  }
  const accuracy = baseSum ? ratioSum / baseSum : 0;
  const coverage = timeline.flat.length ? state.results.size / timeline.flat.length : 0;
  let perfectLines = 0;
  for (const v of state.lineRatings.values()) if (v === "Perfect") perfectLines++;
  return {
    total: state.total,
    maxScore: Math.round(timeline.maxScore * comboMultiplier(50)),
    accuracy,
    coverage,
    grade: gradeFor(accuracy),
    partial: coverage < 0.7,
    maxCombo: state.maxCombo,
    perfectLines,
    lines: timeline.track.lines.length,
    meanCents: centsN ? centsSum / centsN : null,
  };
}
