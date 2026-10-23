import type { Line, SectionMarker, Syllable, Track } from "../lyrics";

/** Loosely-typed input: what an import or the Studio may hand us before cleanup. */
export type RawSyllable = Omit<Syllable, "wordIndex" | "wordEnd"> & {
  wordIndex?: number;
  wordEnd?: boolean;
};
export type RawLine = Omit<Line, "syllables" | "start" | "end" | "id"> & {
  id?: string;
  syllables: RawSyllable[];
  start?: number;
  end?: number;
};
export type RawTrack = Omit<Track, "lines"> & { lines: RawLine[] };

const MIN_SYL = 0.04;

/**
 * Produce a fully-populated, sorted, internally consistent Track.
 * Idempotent: normalizing a normalized track returns an equal track.
 */
export function normalizeTrack(raw: RawTrack): Track {
  const usedIds = new Set<string>();
  const lines: Line[] = raw.lines
    .filter((l) => l.syllables.length > 0)
    .map((l, li) => {
      // syllables: enforce monotonic non-negative durations
      let wordIndex = 0;
      const syllables: Syllable[] = l.syllables.map((s, si, arr) => {
        const start = Math.max(0, s.start);
        const nextStart = arr[si + 1]?.start;
        let end = Math.max(start + MIN_SYL, s.end);
        if (nextStart !== undefined && end > nextStart + 0.001) end = Math.max(start + MIN_SYL, nextStart);
        const isLast = si === arr.length - 1;
        const wordEnd = s.wordEnd ?? isLast;
        const out: Syllable = {
          text: s.text,
          start,
          end,
          wordEnd,
          wordIndex: s.wordIndex ?? wordIndex,
        };
        if (s.emphasis) out.emphasis = true;
        if (typeof s.note === "number" && Number.isFinite(s.note)) out.note = s.note;
        if (wordEnd) wordIndex++;
        return out;
      });
      // guarantee the last syllable closes its word
      syllables[syllables.length - 1].wordEnd = true;

      let id = l.id ?? `l${li}`;
      while (usedIds.has(id)) id = `${id}_`;
      usedIds.add(id);

      const line: Line = {
        id,
        voice: l.voice ?? "duet",
        section: l.section ?? "Verse",
        syllables,
        start: l.start ?? syllables[0].start,
        end: l.end ?? syllables[syllables.length - 1].end,
      };
      if (l.singer) line.singer = l.singer;
      return line;
    })
    .sort((a, b) => a.start - b.start);

  const lastEnd = lines.length ? lines[lines.length - 1].end : 0;
  const bpm = raw.bpm > 0 && Number.isFinite(raw.bpm) ? raw.bpm : 100;
  const beat = 60 / bpm;

  const sections: SectionMarker[] = raw.sections?.length
    ? [...raw.sections].sort((a, b) => a.start - b.start)
    : deriveSections(lines);

  const track: Track = {
    title: raw.title || "Untitled",
    artist: raw.artist || "Unknown artist",
    bpm,
    lines,
    duration: raw.duration && raw.duration > lastEnd ? raw.duration : Math.ceil(lastEnd + 2),
    beatOffset: raw.beatOffset ?? (lines.length ? lines[0].start % beat : 0),
    sections,
    offset: raw.offset ?? 0,
    source: raw.source ?? "json",
  };
  if (raw.album) track.album = raw.album;
  if (raw.language) track.language = raw.language;
  return track;
}

function deriveSections(lines: Line[]): SectionMarker[] {
  const out: SectionMarker[] = [];
  let prev: string | null = null;
  for (const l of lines) {
    if (l.section !== prev) {
      out.push({ name: l.section, start: l.start });
      prev = l.section;
    }
  }
  return out;
}
