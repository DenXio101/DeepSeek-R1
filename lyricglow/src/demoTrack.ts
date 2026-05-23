import type { Track } from "./lyrics";

// ~50 second demo track with syllable-level timing
// wordEnd: false for mid-word syllables, wordEnd: true for final syllable of each word
// emphasis: true on the last syllable of each line (phrase-ending peak)
const demoTrack: Track = {
  title: "Embers & Light",
  artist: "LyricGlow Demo",
  bpm: 78,
  lines: [
    // ── INTRO ───────────────────────────────────────────────────────────
    {
      id: "intro-1",
      voice: "duet",
      section: "Intro",
      start: 2.0,
      end: 5.5,
      syllables: [
        { text: "Soft", start: 2.0, end: 2.5, wordEnd: false, wordIndex: 0 },
        { text: "ly", start: 2.5, end: 3.0, wordEnd: true, wordIndex: 0 },
        { text: "now", start: 3.2, end: 3.8, wordEnd: true, wordIndex: 1 },
        { text: "the", start: 3.9, end: 4.2, wordEnd: true, wordIndex: 2 },
        { text: "light", start: 4.3, end: 5.0, wordEnd: true, wordIndex: 3 },
        { text: "fades", start: 5.0, end: 5.5, wordEnd: true, wordIndex: 4, emphasis: true },
      ],
    },
    {
      id: "intro-2",
      voice: "duet",
      section: "Intro",
      start: 6.0,
      end: 9.5,
      syllables: [
        { text: "Lan", start: 6.0, end: 6.4, wordEnd: false, wordIndex: 0 },
        { text: "terns", start: 6.4, end: 6.9, wordEnd: true, wordIndex: 0 },
        { text: "drift", start: 7.1, end: 7.6, wordEnd: true, wordIndex: 1 },
        { text: "a", start: 7.7, end: 7.9, wordEnd: false, wordIndex: 2 },
        { text: "bove", start: 7.9, end: 8.4, wordEnd: true, wordIndex: 2 },
        { text: "the", start: 8.5, end: 8.7, wordEnd: true, wordIndex: 3 },
        { text: "ci", start: 8.8, end: 9.1, wordEnd: false, wordIndex: 4 },
        { text: "ty", start: 9.1, end: 9.5, wordEnd: true, wordIndex: 4, emphasis: true },
      ],
    },

    // ── VERSE 1 ─────────────────────────────────────────────────────────
    {
      id: "verse1-1",
      voice: "male",
      section: "Verse",
      start: 10.5,
      end: 14.0,
      syllables: [
        { text: "Morn", start: 10.5, end: 10.9, wordEnd: false, wordIndex: 0 },
        { text: "ing", start: 10.9, end: 11.3, wordEnd: true, wordIndex: 0 },
        { text: "came", start: 11.5, end: 12.0, wordEnd: true, wordIndex: 1 },
        { text: "so", start: 12.1, end: 12.4, wordEnd: true, wordIndex: 2 },
        { text: "qui", start: 12.5, end: 12.8, wordEnd: false, wordIndex: 3 },
        { text: "et", start: 12.8, end: 13.2, wordEnd: true, wordIndex: 3 },
        { text: "here", start: 13.3, end: 14.0, wordEnd: true, wordIndex: 4, emphasis: true },
      ],
    },
    {
      id: "verse1-2",
      voice: "male",
      section: "Verse",
      start: 14.5,
      end: 18.0,
      syllables: [
        { text: "Whis", start: 14.5, end: 14.9, wordEnd: false, wordIndex: 0 },
        { text: "pers", start: 14.9, end: 15.3, wordEnd: true, wordIndex: 0 },
        { text: "from", start: 15.5, end: 15.8, wordEnd: true, wordIndex: 1 },
        { text: "be", start: 15.9, end: 16.2, wordEnd: false, wordIndex: 2 },
        { text: "low", start: 16.2, end: 16.7, wordEnd: true, wordIndex: 2 },
        { text: "your", start: 16.9, end: 17.2, wordEnd: true, wordIndex: 3 },
        { text: "win", start: 17.3, end: 17.6, wordEnd: false, wordIndex: 4 },
        { text: "dow", start: 17.6, end: 18.0, wordEnd: true, wordIndex: 4, emphasis: true },
      ],
    },

    // ── VERSE 2 ─────────────────────────────────────────────────────────
    {
      id: "verse2-1",
      voice: "female",
      section: "Verse",
      start: 19.0,
      end: 22.5,
      syllables: [
        { text: "Em", start: 19.0, end: 19.4, wordEnd: false, wordIndex: 0 },
        { text: "bers", start: 19.4, end: 19.9, wordEnd: true, wordIndex: 0 },
        { text: "glow", start: 20.1, end: 20.6, wordEnd: true, wordIndex: 1 },
        { text: "like", start: 20.7, end: 21.1, wordEnd: true, wordIndex: 2 },
        { text: "sum", start: 21.2, end: 21.5, wordEnd: false, wordIndex: 3 },
        { text: "mer", start: 21.5, end: 21.9, wordEnd: true, wordIndex: 3 },
        { text: "stars", start: 22.0, end: 22.5, wordEnd: true, wordIndex: 4, emphasis: true },
      ],
    },
    {
      id: "verse2-2",
      voice: "female",
      section: "Verse",
      start: 23.0,
      end: 27.0,
      syllables: [
        { text: "Hold", start: 23.0, end: 23.4, wordEnd: true, wordIndex: 0 },
        { text: "me", start: 23.5, end: 23.9, wordEnd: true, wordIndex: 1 },
        { text: "in", start: 24.0, end: 24.2, wordEnd: true, wordIndex: 2 },
        { text: "the", start: 24.3, end: 24.5, wordEnd: true, wordIndex: 3 },
        { text: "qui", start: 24.6, end: 24.9, wordEnd: false, wordIndex: 4 },
        { text: "et", start: 24.9, end: 25.2, wordEnd: true, wordIndex: 4 },
        { text: "dark", start: 25.4, end: 26.0, wordEnd: true, wordIndex: 5 },
        { text: "ness", start: 26.0, end: 26.5, wordEnd: true, wordIndex: 6, emphasis: true },
      ],
    },

    // ── CHORUS ──────────────────────────────────────────────────────────
    {
      id: "chorus-1",
      voice: "duet",
      section: "Chorus",
      start: 28.0,
      end: 32.0,
      syllables: [
        { text: "Fly", start: 28.0, end: 28.5, wordEnd: true, wordIndex: 0 },
        { text: "like", start: 28.6, end: 28.9, wordEnd: true, wordIndex: 1 },
        { text: "em", start: 29.0, end: 29.3, wordEnd: false, wordIndex: 2 },
        { text: "bers", start: 29.3, end: 29.7, wordEnd: true, wordIndex: 2 },
        { text: "in", start: 29.9, end: 30.1, wordEnd: true, wordIndex: 3 },
        { text: "the", start: 30.2, end: 30.4, wordEnd: true, wordIndex: 4 },
        { text: "night", start: 30.5, end: 31.2, wordEnd: true, wordIndex: 5 },
        { text: "sky", start: 31.3, end: 32.0, wordEnd: true, wordIndex: 6, emphasis: true },
      ],
    },
    {
      id: "chorus-2",
      voice: "duet",
      section: "Chorus",
      start: 32.5,
      end: 36.5,
      syllables: [
        { text: "Burn", start: 32.5, end: 33.0, wordEnd: true, wordIndex: 0 },
        { text: "bright", start: 33.1, end: 33.6, wordEnd: true, wordIndex: 1 },
        { text: "through", start: 33.7, end: 34.0, wordEnd: true, wordIndex: 2 },
        { text: "the", start: 34.1, end: 34.3, wordEnd: true, wordIndex: 3 },
        { text: "qui", start: 34.4, end: 34.7, wordEnd: false, wordIndex: 4 },
        { text: "et", start: 34.7, end: 35.0, wordEnd: true, wordIndex: 4 },
        { text: "and", start: 35.1, end: 35.4, wordEnd: true, wordIndex: 5 },
        { text: "the", start: 35.5, end: 35.7, wordEnd: true, wordIndex: 6 },
        { text: "cold", start: 35.8, end: 36.5, wordEnd: true, wordIndex: 7, emphasis: true },
      ],
    },

    // ── BRIDGE ──────────────────────────────────────────────────────────
    {
      id: "bridge-1",
      voice: "female",
      section: "Bridge",
      start: 37.5,
      end: 41.0,
      syllables: [
        { text: "Be", start: 37.5, end: 37.8, wordEnd: false, wordIndex: 0 },
        { text: "neath", start: 37.8, end: 38.2, wordEnd: true, wordIndex: 0 },
        { text: "the", start: 38.3, end: 38.5, wordEnd: true, wordIndex: 1 },
        { text: "lan", start: 38.6, end: 38.9, wordEnd: false, wordIndex: 2 },
        { text: "tern", start: 38.9, end: 39.3, wordEnd: true, wordIndex: 2 },
        { text: "light", start: 39.4, end: 40.0, wordEnd: true, wordIndex: 3 },
        { text: "we", start: 40.1, end: 40.4, wordEnd: true, wordIndex: 4 },
        { text: "shine", start: 40.5, end: 41.0, wordEnd: true, wordIndex: 5, emphasis: true },
      ],
    },
    {
      id: "bridge-2",
      voice: "male",
      section: "Bridge",
      start: 41.5,
      end: 45.0,
      syllables: [
        { text: "No", start: 41.5, end: 41.8, wordEnd: true, wordIndex: 0 },
        { text: "whis", start: 41.9, end: 42.2, wordEnd: false, wordIndex: 1 },
        { text: "per", start: 42.2, end: 42.6, wordEnd: true, wordIndex: 1 },
        { text: "lost", start: 42.8, end: 43.3, wordEnd: true, wordIndex: 2 },
        { text: "in", start: 43.4, end: 43.6, wordEnd: true, wordIndex: 3 },
        { text: "the", start: 43.7, end: 43.9, wordEnd: true, wordIndex: 4 },
        { text: "dark", start: 44.0, end: 44.5, wordEnd: true, wordIndex: 5 },
        { text: "ness", start: 44.5, end: 45.0, wordEnd: true, wordIndex: 6, emphasis: true },
      ],
    },

    // ── CODA ────────────────────────────────────────────────────────────
    {
      id: "coda-1",
      voice: "duet",
      section: "Coda",
      start: 46.0,
      end: 49.5,
      syllables: [
        { text: "Soft", start: 46.0, end: 46.4, wordEnd: false, wordIndex: 0 },
        { text: "ly", start: 46.4, end: 46.8, wordEnd: true, wordIndex: 0 },
        { text: "now", start: 47.0, end: 47.5, wordEnd: true, wordIndex: 1 },
        { text: "we", start: 47.6, end: 47.9, wordEnd: true, wordIndex: 2 },
        { text: "glow", start: 48.0, end: 48.6, wordEnd: true, wordIndex: 3 },
        { text: "to", start: 48.7, end: 48.9, wordEnd: true, wordIndex: 4 },
        { text: "geth", start: 49.0, end: 49.2, wordEnd: false, wordIndex: 5 },
        { text: "er", start: 49.2, end: 49.5, wordEnd: true, wordIndex: 5, emphasis: true },
      ],
    },

    // ── OUTRO ───────────────────────────────────────────────────────────
    {
      id: "outro-1",
      voice: "duet",
      section: "Outro",
      start: 50.5,
      end: 54.0,
      syllables: [
        { text: "Light", start: 50.5, end: 51.0, wordEnd: true, wordIndex: 0 },
        { text: "fades", start: 51.2, end: 51.8, wordEnd: true, wordIndex: 1 },
        { text: "in", start: 51.9, end: 52.2, wordEnd: true, wordIndex: 2 },
        { text: "the", start: 52.3, end: 52.5, wordEnd: true, wordIndex: 3 },
        { text: "morn", start: 52.6, end: 52.9, wordEnd: false, wordIndex: 4 },
        { text: "ing", start: 52.9, end: 53.3, wordEnd: true, wordIndex: 4 },
        { text: "haze", start: 53.4, end: 54.0, wordEnd: true, wordIndex: 5, emphasis: true },
      ],
    },
  ],
};

export default demoTrack;
