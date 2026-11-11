// ─── Sync Studio state machine (pure) ──────────────────────────────────────────
import type { Section, Voice } from "../../lyrics";
import { parseSectionMarker, stripVoicePrefix } from "../../model/lrc";
import { splitWordsAndSyllables } from "../../model/syllables";

export type StudioPhase = "edit" | "tapping" | "review";

export interface DraftLine {
  id: string;
  text: string;
  voice: Voice;
  section: Section;
  /** words → syllable strings */
  syllables: string[][];
}

export interface Stamp {
  line: number;
  /** flat syllable index within the line */
  syl: number;
  t: number;
  /** created by END LINE distribution rather than a real tap */
  auto?: boolean;
}

export interface StudioState {
  phase: StudioPhase;
  rawText: string;
  title: string;
  artist: string;
  bpm: number;
  lines: DraftLine[];
  /** next syllable to stamp */
  cursor: { line: number; syl: number };
  stamps: Stamp[];
  lineEnds: Record<number, number>;
  /** seconds subtracted from each tap (human reaction) */
  tapLatency: number;
  /** global offset applied in review (becomes track.offset) */
  nudge: number;
  parsedFrom: string;
}

export type StudioAction =
  | { type: "setText"; text: string }
  | { type: "setMeta"; title?: string; artist?: string; bpm?: number }
  | { type: "parse" }
  | { type: "setLineVoice"; line: number; voice: Voice }
  | { type: "start"; fromLine?: number }
  | { type: "tap"; t: number }
  | { type: "endLine"; t: number }
  | { type: "undo" }
  | { type: "finish"; t: number }
  | { type: "nudge"; delta: number }
  | { type: "setLatency"; value: number }
  | { type: "retapFrom"; line: number }
  | { type: "backToEdit" }
  | { type: "reset" };

export const DEFAULT_TAP_LATENCY = 0.06;

export const SAMPLE_TEXT = `[Verse]
M: Morning came so quiet here
M: Whispers from below your window
[Chorus]
D: Fly like embers in the night sky
F: Hold me in the quiet darkness`;

export function initStudio(): StudioState {
  return {
    phase: "edit",
    rawText: "",
    title: "My Song",
    artist: "",
    bpm: 100,
    lines: [],
    cursor: { line: 0, syl: 0 },
    stamps: [],
    lineEnds: {},
    tapLatency: DEFAULT_TAP_LATENCY,
    nudge: 0,
    parsedFrom: "",
  };
}

export function sylCount(line: DraftLine): number {
  return line.syllables.reduce((a, w) => a + w.length, 0);
}

/** parse plain text into draft lines using the same voice/section rules as LRC */
export function parseDraft(text: string): DraftLine[] {
  const out: DraftLine[] = [];
  let section: Section = "Verse";
  let defaultVoice: Voice = "duet";
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const sec = parseSectionMarker(line);
    if (sec) {
      section = sec;
      continue;
    }
    const vm = /^\[v(?:oice)?\s*:\s*(male|female|duet|m|f|d)\]$/i.exec(line);
    if (vm) {
      const v = vm[1].toLowerCase();
      defaultVoice = v.startsWith("f") ? "female" : v.startsWith("m") ? "male" : "duet";
      continue;
    }
    const { voice, rest } = stripVoicePrefix(line);
    const syllables = splitWordsAndSyllables(rest);
    if (!syllables.length) continue;
    out.push({ id: `s${out.length}`, text: rest.trim(), voice: voice ?? defaultVoice, section, syllables });
  }
  return out;
}

function lastStampOf(state: StudioState, line: number): Stamp | undefined {
  for (let i = state.stamps.length - 1; i >= 0; i--) if (state.stamps[i].line === line) return state.stamps[i];
  return undefined;
}

function closeLine(state: StudioState, line: number, t: number): StudioState {
  if (line < 0 || line >= state.lines.length || state.lineEnds[line] !== undefined) return state;
  const total = sylCount(state.lines[line]);
  const stamped = state.stamps.filter((s) => s.line === line);
  if (!stamped.length) return state;
  const last = stamped[stamped.length - 1];
  const stamps = [...state.stamps];
  // distribute any syllables that were never tapped between the last tap and t
  const remaining = total - 1 - last.syl;
  let end = Math.max(last.t + 0.15, t);
  if (remaining > 0) {
    const span = Math.max(0.12 * (remaining + 1), end - last.t);
    end = last.t + span;
    const step = span / (remaining + 1);
    for (let k = 1; k <= remaining; k++) stamps.push({ line, syl: last.syl + k, t: last.t + step * k, auto: true });
  }
  return { ...state, stamps, lineEnds: { ...state.lineEnds, [line]: end }, cursor: { line: line + 1, syl: 0 } };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "setText":
      return { ...state, rawText: action.text };
    case "setMeta":
      return {
        ...state,
        title: action.title ?? state.title,
        artist: action.artist ?? state.artist,
        bpm: action.bpm !== undefined && Number.isFinite(action.bpm) && action.bpm > 0 ? action.bpm : state.bpm,
      };
    case "parse": {
      const lines = parseDraft(state.rawText);
      return { ...state, lines, stamps: [], lineEnds: {}, cursor: { line: 0, syl: 0 }, parsedFrom: state.rawText, phase: "edit" };
    }
    case "setLineVoice":
      return { ...state, lines: state.lines.map((l, i) => (i === action.line ? { ...l, voice: action.voice } : l)) };
    case "start": {
      if (!state.lines.length) return state;
      const from = Math.max(0, Math.min(action.fromLine ?? 0, state.lines.length - 1));
      const stamps = state.stamps.filter((s) => s.line < from);
      const lineEnds: Record<number, number> = {};
      for (const k in state.lineEnds) if (Number(k) < from) lineEnds[k] = state.lineEnds[k];
      return { ...state, phase: "tapping", stamps, lineEnds, cursor: { line: from, syl: 0 } };
    }
    case "tap": {
      if (state.phase !== "tapping") return state;
      const { line, syl } = state.cursor;
      if (line >= state.lines.length) return state;
      const t = Math.max(0, action.t - state.tapLatency);
      let next = state;
      // first tap of a new line closes the previous one if it is still open
      if (syl === 0 && line > 0 && state.lineEnds[line - 1] === undefined) next = closeLine(state, line - 1, t - 0.1);
      const prevInLine = lastStampOf(next, line);
      const tt = prevInLine ? Math.max(prevInLine.t + 0.05, t) : t;
      const stamps = [...next.stamps, { line, syl, t: tt }];
      const total = sylCount(next.lines[line]);
      const cursor = syl + 1 < total ? { line, syl: syl + 1 } : { line: line + 1, syl: 0 };
      return { ...next, stamps, cursor };
    }
    case "endLine": {
      if (state.phase !== "tapping") return state;
      const { line, syl } = state.cursor;
      // the open line is the cursor line if it has stamps, otherwise the previous one
      const open = syl > 0 ? line : line - 1;
      if (open < 0) return state;
      const t = Math.max(0, action.t - state.tapLatency);
      const closed = closeLine(state, open, t);
      if (closed === state) return state;
      const cursorLine = open + 1;
      return { ...closed, cursor: { line: cursorLine, syl: 0 } };
    }
    case "undo": {
      if (!state.stamps.length) return state;
      const stamps = [...state.stamps];
      // drop trailing auto stamps, then one real tap
      while (stamps.length && stamps[stamps.length - 1].auto) stamps.pop();
      const popped = stamps.pop();
      if (!popped) return { ...state, stamps };
      const lineEnds: Record<number, number> = {};
      for (const k in state.lineEnds) if (Number(k) < popped.line) lineEnds[k] = state.lineEnds[k];
      return { ...state, stamps, lineEnds, cursor: { line: popped.line, syl: popped.syl }, phase: "tapping" };
    }
    case "finish": {
      const t = Math.max(0, action.t - state.tapLatency);
      const { line, syl } = state.cursor;
      const open = syl > 0 ? line : line - 1;
      const closed = open >= 0 ? closeLine(state, open, t) : state;
      return { ...closed, phase: "review" };
    }
    case "nudge":
      return { ...state, nudge: Math.round((state.nudge + action.delta) * 1000) / 1000 };
    case "setLatency":
      return { ...state, tapLatency: Math.max(0, Math.min(0.4, Math.round(action.value * 1000) / 1000)) };
    case "retapFrom":
      return studioReducer(state, { type: "start", fromLine: action.line });
    case "backToEdit":
      return { ...state, phase: "edit" };
    case "reset":
      return initStudio();
    default:
      return state;
  }
}
