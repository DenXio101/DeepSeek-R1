import type { Track } from "../../lyrics";
import { normalizeTrack, type RawLine, type RawSyllable } from "../../model/normalize";
import type { StudioState } from "./studioReducer";

const MIN_SYL = 0.12;
const DEFAULT_LAST = 0.45;

/** Turn stamps into a playable Track. Lines without any stamp are skipped. */
export function buildTrack(state: StudioState): { track: Track | null; timedLines: number } {
  const lines: RawLine[] = [];
  state.lines.forEach((dl, li) => {
    const stamps = state.stamps.filter((s) => s.line === li).sort((a, b) => a.syl - b.syl || a.t - b.t);
    if (!stamps.length) return;
    const flat: string[] = dl.syllables.flat();
    const wordEnds: boolean[] = dl.syllables.flatMap((w) => w.map((_, i) => i === w.length - 1));
    const lineEnd = state.lineEnds[li];
    const syllables: RawSyllable[] = [];
    stamps.forEach((st, i) => {
      const next = stamps[i + 1];
      let end = next ? next.t : lineEnd !== undefined ? lineEnd : st.t + DEFAULT_LAST;
      if (end < st.t + MIN_SYL) end = next ? Math.max(next.t, st.t + 0.04) : st.t + MIN_SYL;
      syllables.push({ text: flat[st.syl] ?? "", start: st.t, end, wordEnd: wordEnds[st.syl] ?? true });
    });
    syllables[syllables.length - 1].emphasis = true;
    lines.push({ id: dl.id, voice: dl.voice, section: dl.section, syllables });
  });
  if (!lines.length) return { track: null, timedLines: 0 };
  const track = normalizeTrack({
    title: state.title || "Untitled",
    artist: state.artist,
    bpm: state.bpm,
    lines,
    offset: state.nudge,
    source: "studio",
  });
  return { track, timedLines: lines.length };
}
