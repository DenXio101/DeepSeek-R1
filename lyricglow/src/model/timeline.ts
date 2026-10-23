import type { Line, Syllable, Track } from "../lyrics";

/** How early a line becomes "active" (so the cue ball can lead in). */
export const LINE_LEAD = 1.5;
/** How long a line stays active after its last syllable. */
export const LINE_TAIL = 0.5;
/** When two lines' windows overlap, hand over this long before the next line starts … */
const HANDOVER_BEFORE_NEXT = 0.45;
/** … but never sooner than this after the previous line's last syllable. */
const MIN_TAIL_AFTER_PREV = 0.15;
/** Silence this long (or longer) before a line earns a count-in. */
export const COUNT_IN_GAP = 2.5;

export interface FlatSyllable extends Syllable {
  lineIdx: number;
  sylIdx: number;
  globalIdx: number;
  voice: Line["voice"];
}

export interface CountIn {
  lineIdx: number;
  /** absolute song times of each count beat, ascending; last one is the line start */
  beats: number[];
}

export interface TrackTimeline {
  track: Track;
  flat: FlatSyllable[];
  lineStarts: Float64Array;
  lineEnds: Float64Array;
  countIns: Map<number, CountIn>;
  sectionChanges: Set<number>;
  maxScore: number;
  /** total song length used for the demo clock */
  duration: number;
  beat: number;
  beatOffset: number;
  findActiveLine(time: number): number;
  findLineAt(time: number): number;
}

export function basePoints(syl: Syllable): number {
  return syl.emphasis ? 150 : 100;
}

export function buildTimeline(track: Track): TrackTimeline {
  const { lines } = track;
  const flat: FlatSyllable[] = [];
  const lineStarts = new Float64Array(lines.length);
  const lineEnds = new Float64Array(lines.length);
  const sectionChanges = new Set<number>();
  const countIns = new Map<number, CountIn>();
  const bpm = track.bpm > 0 ? track.bpm : 100;
  let beat = 60 / bpm;
  if (beat < 0.4) beat *= 2;
  const beatOffset = track.beatOffset ?? 0;
  let maxScore = 0;

  lines.forEach((line, li) => {
    lineStarts[li] = line.start;
    lineEnds[li] = line.end;
    if (li === 0 || lines[li - 1].section !== line.section) sectionChanges.add(li);
    line.syllables.forEach((s, si) => {
      flat.push({ ...s, lineIdx: li, sylIdx: si, globalIdx: flat.length, voice: line.voice });
      maxScore += basePoints(s);
    });

    const prevEnd = li === 0 ? 0 : lines[li - 1].end;
    const gap = line.start - prevEnd;
    const wantCount = li === 0 ? gap >= beat * 1.5 : gap >= COUNT_IN_GAP;
    if (wantCount) {
      const n = Math.min(3, Math.floor((gap - 0.15) / beat));
      if (n >= 1) {
        const beats: number[] = [];
        for (let k = n; k >= 1; k--) beats.push(line.start - k * beat);
        beats.push(line.start);
        countIns.set(li, { lineIdx: li, beats });
      }
    }
  });

  const lastEnd = lines.length ? lineEnds[lines.length - 1] : 0;
  const duration = track.duration && track.duration > lastEnd ? track.duration : lastEnd + 2;

  /** index of the last line whose start <= t, or -1 */
  const lastStartedBefore = (t: number): number => {
    let lo = 0;
    let hi = lines.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid] <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };

  const findActiveLine = (t: number): number => {
    if (!lines.length) return -1;
    // candidate = last line that has entered its lead window
    const i = lastStartedBefore(t + LINE_LEAD);
    if (i < 0) return -1;
    const prev = i - 1;
    const prevInTail = prev >= 0 && t <= lineEnds[prev] + LINE_TAIL;
    const curInWindow = t <= lineEnds[i] + LINE_TAIL;
    if (!curInWindow) return -1;
    if (prevInTail) {
      const handover = Math.max(lineEnds[prev] + MIN_TAIL_AFTER_PREV, lineStarts[i] - HANDOVER_BEFORE_NEXT);
      if (t < handover) return prev;
    }
    return i;
  };

  const findLineAt = (t: number): number => {
    const i = lastStartedBefore(t);
    if (i < 0) return -1;
    return t <= lineEnds[i] ? i : -1;
  };

  return {
    track,
    flat,
    lineStarts,
    lineEnds,
    countIns,
    sectionChanges,
    maxScore,
    duration,
    beat,
    beatOffset,
    findActiveLine,
    findLineAt,
  };
}
