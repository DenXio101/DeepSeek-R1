import type { Line, Section, Syllable, Track, Voice } from "./lyrics";

// ─── compact authoring helpers ────────────────────────────────────────────
// A syllable row: [text, start, end, midiNote, joinNext?]
// joinNext = true means the next row continues the same word ("Soft" + "ly").
type Row = [text: string, start: number, end: number, note: number, joinNext?: boolean];

function L(id: string, voice: Voice, section: Section, rows: Row[]): Line {
  let wordIndex = 0;
  const syllables: Syllable[] = rows.map(([text, start, end, note, joinNext], i) => {
    const wordEnd = !joinNext;
    const s: Syllable = { text, start, end, wordEnd, wordIndex, note };
    if (i === rows.length - 1) s.emphasis = true;
    if (wordEnd) wordIndex++;
    return s;
  });
  return { id, voice, section, syllables, start: syllables[0].start, end: syllables[syllables.length - 1].end };
}

// Key: A minor at 78 bpm. Male/duet lines sit in A3–E4 (57–64), female lines a fourth higher.
// Scoring is octave-agnostic, so the singer's own octave never matters.
const A3 = 57, B3 = 59, C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71;

const demoTrack: Track = {
  title: "Embers & Light",
  artist: "LyricGlow Demo",
  bpm: 78,
  duration: 56,
  beatOffset: 2.0 % (60 / 78),
  source: "demo",
  lines: [
    // ── INTRO ──────────────────────────────────────────────────────────
    L("intro-1", "duet", "Intro", [
      ["Soft", 2.0, 2.5, E4, true], ["ly", 2.5, 3.0, D4],
      ["now", 3.2, 3.8, C4], ["the", 3.9, 4.2, B3], ["light", 4.3, 5.0, D4], ["fades", 5.0, 5.5, A3],
    ]),
    L("intro-2", "duet", "Intro", [
      ["Lan", 6.0, 6.4, A3, true], ["terns", 6.4, 6.9, B3],
      ["drift", 7.1, 7.6, C4], ["a", 7.7, 7.9, D4, true], ["bove", 7.9, 8.4, E4],
      ["the", 8.5, 8.7, D4], ["ci", 8.8, 9.1, C4, true], ["ty", 9.1, 9.5, E4],
    ]),

    // ── VERSE 1 (male) ─────────────────────────────────────────────────
    L("verse1-1", "male", "Verse", [
      ["Morn", 10.5, 10.9, E4, true], ["ing", 10.9, 11.3, D4],
      ["came", 11.5, 12.0, C4], ["so", 12.1, 12.4, D4],
      ["qui", 12.5, 12.8, C4, true], ["et", 12.8, 13.2, B3], ["here", 13.3, 14.0, A3],
    ]),
    L("verse1-2", "male", "Verse", [
      ["Whis", 14.5, 14.9, C4, true], ["pers", 14.9, 15.3, D4],
      ["from", 15.5, 15.8, E4], ["be", 15.9, 16.2, D4, true], ["low", 16.2, 16.7, C4],
      ["your", 16.9, 17.2, B3], ["win", 17.3, 17.6, C4, true], ["dow", 17.6, 18.0, E4],
    ]),

    // ── VERSE 2 (female) ───────────────────────────────────────────────
    L("verse2-1", "female", "Verse", [
      ["Em", 19.0, 19.4, A4, true], ["bers", 19.4, 19.9, G4],
      ["glow", 20.1, 20.6, F4], ["like", 20.7, 21.1, E4],
      ["sum", 21.2, 21.5, F4, true], ["mer", 21.5, 21.9, G4], ["stars", 22.0, 22.5, A4],
    ]),
    L("verse2-2", "female", "Verse", [
      ["Hold", 23.0, 23.4, E4], ["me", 23.5, 23.9, F4], ["in", 24.0, 24.2, G4], ["the", 24.3, 24.5, A4],
      ["qui", 24.6, 24.9, B4, true], ["et", 24.9, 25.2, A4], ["dark", 25.4, 26.0, G4, true], ["ness", 26.0, 26.5, E4],
    ]),

    // ── CHORUS (duet) ──────────────────────────────────────────────────
    L("chorus-1", "duet", "Chorus", [
      ["Fly", 28.0, 28.5, A4], ["like", 28.6, 28.9, G4],
      ["em", 29.0, 29.3, F4, true], ["bers", 29.3, 29.7, E4],
      ["in", 29.9, 30.1, F4], ["the", 30.2, 30.4, G4], ["night", 30.5, 31.2, A4], ["sky", 31.3, 32.0, E4],
    ]),
    L("chorus-2", "duet", "Chorus", [
      ["Burn", 32.5, 33.0, E4], ["bright", 33.1, 33.6, F4], ["through", 33.7, 34.0, G4], ["the", 34.1, 34.3, A4],
      ["qui", 34.4, 34.7, G4, true], ["et", 34.7, 35.0, F4],
      ["and", 35.1, 35.4, E4], ["the", 35.5, 35.7, D4], ["cold", 35.8, 36.5, A3],
    ]),

    // ── BRIDGE ─────────────────────────────────────────────────────────
    L("bridge-1", "female", "Bridge", [
      ["Be", 37.5, 37.8, G4, true], ["neath", 37.8, 38.2, A4],
      ["the", 38.3, 38.5, B4], ["lan", 38.6, 38.9, A4, true], ["tern", 38.9, 39.3, G4],
      ["light", 39.4, 40.0, F4], ["we", 40.1, 40.4, G4], ["shine", 40.5, 41.0, A4],
    ]),
    L("bridge-2", "male", "Bridge", [
      ["No", 41.5, 41.8, C4], ["whis", 41.9, 42.2, D4, true], ["per", 42.2, 42.6, E4],
      ["lost", 42.8, 43.3, D4], ["in", 43.4, 43.6, C4], ["the", 43.7, 43.9, B3],
      ["dark", 44.0, 44.5, C4, true], ["ness", 44.5, 45.0, A3],
    ]),

    // ── CODA (duet) ────────────────────────────────────────────────────
    L("coda-1", "duet", "Coda", [
      ["Soft", 46.0, 46.4, E4, true], ["ly", 46.4, 46.8, D4],
      ["now", 47.0, 47.5, C4], ["we", 47.6, 47.9, B3], ["glow", 48.0, 48.6, C4],
      ["to", 48.7, 48.9, D4, true], ["geth", 49.0, 49.2, C4, true], ["er", 49.2, 49.5, A3],
    ]),

    // ── OUTRO (duet) ───────────────────────────────────────────────────
    L("outro-1", "duet", "Outro", [
      ["Light", 50.5, 51.0, D4], ["fades", 51.2, 51.8, C4], ["in", 51.9, 52.2, B3], ["the", 52.3, 52.5, A3],
      ["morn", 52.6, 52.9, B3, true], ["ing", 52.9, 53.3, A3], ["haze", 53.4, 54.0, A3],
    ]),
  ],
};

export default demoTrack;
