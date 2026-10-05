// ─── LyricGlow data model ──────────────────────────────────────────────────
// Syllable-level, time-stamped lyrics. All times are song-seconds.

export type Voice = "male" | "female" | "duet";

export type KnownSection =
  | "Intro"
  | "Verse"
  | "Pre-Chorus"
  | "Chorus"
  | "Bridge"
  | "Interlude"
  | "Coda"
  | "Outro";

/** Known sections get styling; any other string (from LRC) is preserved. */
export type Section = KnownSection | (string & {});

export interface Syllable {
  text: string;
  start: number;
  end: number;
  /** true on the final syllable of a word; syllables are joined visually until then */
  wordEnd: boolean;
  wordIndex: number;
  /** phrase-ending performance peak */
  emphasis?: boolean;
  /** target pitch as (possibly fractional) MIDI note; absent → timing-only scoring */
  note?: number;
}

export interface Line {
  id: string;
  voice: Voice;
  section: Section;
  syllables: Syllable[];
  start: number;
  end: number;
  /** optional display name of the singer */
  singer?: string;
}

export interface SectionMarker {
  name: Section;
  start: number;
}

export type TrackSource = "demo" | "lrc" | "lrc-enhanced" | "json" | "studio";

export interface Track {
  title: string;
  artist: string;
  bpm: number;
  lines: Line[];
  album?: string;
  language?: string;
  /** seconds added to media time before lyric lookup (positive = lyrics later) */
  offset?: number;
  /** length of the virtual clock when no media is loaded */
  duration?: number;
  /** seconds from 0 to the first downbeat */
  beatOffset?: number;
  sections?: SectionMarker[];
  source?: TrackSource;
}

export const VOICES: readonly Voice[] = ["male", "female", "duet"];

export const KNOWN_SECTIONS: readonly KnownSection[] = [
  "Intro",
  "Verse",
  "Pre-Chorus",
  "Chorus",
  "Bridge",
  "Interlude",
  "Coda",
  "Outro",
];

// ─── helpers ───────────────────────────────────────────────────────────────

export function groupSyllablesIntoWords(syllables: Syllable[]): Syllable[][] {
  const words: Syllable[][] = [];
  let current: Syllable[] = [];
  for (const syl of syllables) {
    current.push(syl);
    if (syl.wordEnd) {
      words.push(current);
      current = [];
    }
  }
  if (current.length > 0) words.push(current);
  return words;
}

export function wordText(word: Syllable[]): string {
  return word.map((s) => s.text).join("");
}

export function lineText(line: Line): string {
  return groupSyllablesIntoWords(line.syllables).map(wordText).join(" ");
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function formatTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function voiceColorVar(voice: Voice): string {
  return voice === "male" ? "var(--cyan)" : voice === "female" ? "var(--rose)" : "var(--gold)";
}

export function isKnownSection(s: string): s is KnownSection {
  return (KNOWN_SECTIONS as readonly string[]).includes(s);
}
