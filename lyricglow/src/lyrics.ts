export type Voice = "male" | "female" | "duet";
export type Section = "Intro" | "Verse" | "Chorus" | "Bridge" | "Coda" | "Outro";

export interface Syllable {
  text: string;
  start: number;
  end: number;
  wordEnd: boolean;
  wordIndex: number;
  emphasis?: boolean;
}

export interface Line {
  id: string;
  voice: Voice;
  section: Section;
  syllables: Syllable[];
  start: number;
  end: number;
}

export interface Track {
  title: string;
  artist: string;
  bpm: number;
  lines: Line[];
}

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

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
