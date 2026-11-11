// Cue-ball trajectory math. Pure functions over a mutable state object that the
// Karaoke component owns; nothing here touches React.
import { clamp, easeInOutCubic, lerp } from "../lyrics";

/** How far ahead of the sung syllable the ball lands (conductor count-in), at rate 1. */
export const CONDUCTOR_LEAD = 0.32;
/** vertical distance from a syllable's center to the ball's resting center */
export const CUE_RISE = 38;

export interface Point {
  x: number;
  y: number;
}

export interface CueState {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  targetKey: string | null;
  arcStart: number;
  arcDur: number;
  settled: boolean;
}

export function createCueState(): CueState {
  return { x: 0, y: 0, fromX: 0, fromY: 0, targetKey: null, arcStart: 0, arcDur: 0, settled: false };
}

export function resetCue(s: CueState): void {
  s.targetKey = null;
  s.settled = false;
}

export function conductorLead(rate: number): number {
  return CONDUCTOR_LEAD / Math.max(0.4, rate);
}

/**
 * Advance the ball toward `target` (syllable center) for syllable timing `syl` at song time `t`.
 * Returns the ball center in stage coordinates.
 */
export function stepCue(
  s: CueState,
  key: string,
  target: Point,
  syl: { start: number; end: number },
  t: number,
  reduced: boolean,
): Point {
  const restY = target.y - CUE_RISE;

  if (s.targetKey === null) {
    // first appearance: materialise in place
    s.targetKey = key;
    s.x = target.x;
    s.y = restY;
    s.fromX = s.x;
    s.fromY = s.y;
    s.arcStart = t;
    s.arcDur = 0;
    s.settled = true;
  } else if (s.targetKey !== key) {
    // new syllable: launch an arc from wherever the ball currently is
    s.fromX = s.x;
    s.fromY = s.y;
    s.targetKey = key;
    s.arcStart = t;
    const dist = Math.hypot(target.x - s.fromX, restY - s.fromY);
    s.arcDur = reduced ? 0.12 : clamp(dist / 320, 0.09, 0.26);
    s.settled = false;
  }

  if (!s.settled) {
    const p = s.arcDur > 0 ? clamp((t - s.arcStart) / s.arcDur, 0, 1) : 1;
    const e = easeInOutCubic(p);
    const hop = reduced ? 0 : clamp(10 + Math.abs(target.x - s.fromX) * 0.14, 10, 30);
    s.x = lerp(s.fromX, target.x, e);
    s.y = lerp(s.fromY, restY, e) - hop * Math.sin(p * Math.PI);
    if (p >= 1) s.settled = true;
    return { x: s.x, y: s.y };
  }

  // settled on the syllable: bounce with the syllable's own duration
  s.x = target.x;
  if (reduced) {
    s.y = restY;
  } else {
    const dur = Math.max(0.05, syl.end - syl.start);
    const sp = clamp((t - syl.start) / dur, 0, 1);
    const waiting = t < syl.start;
    // waiting = ball hovers slightly; singing = one clean bounce over the syllable
    const bounce = waiting ? 2 * Math.sin((t - s.arcStart) * 9) : Math.sin(sp * Math.PI) * 7;
    s.y = restY - bounce;
  }
  return { x: s.x, y: s.y };
}

/** 1 → 1.18 pulse that decays over each beat */
export function beatPulse(t: number, beat: number, beatOffset: number, amount = 0.18): number {
  if (beat <= 0) return 1;
  const phase = (((t - beatOffset) / beat) % 1 + 1) % 1;
  return 1 + amount * Math.pow(1 - phase, 3);
}
