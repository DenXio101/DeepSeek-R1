// ─── Tap-to-sync helpers (pure; shared by the stage card and the fixtures) ──
import type { Line, Track } from "../lyrics";

/** reaction allowance: people tap a beat after they hear the first word */
export const TAP_REACTION_S = 0.12;

/** The line the singer will hit next (or the current one if it has barely started). */
export function upcomingLine(track: Track, mediaTime: number): Line | null {
  const t = mediaTime + (track.offset ?? 0);
  for (const line of track.lines) {
    if (line.start > t + 0.2) return line;
    const len = Math.max(0.2, line.end - line.start);
    if (t >= line.start && t - line.start < len * 0.25) return line;
  }
  return null;
}

/** Offset that makes `line` begin exactly when the user tapped (song time = media time + offset). */
export function offsetForTap(line: Line, mediaTime: number): number {
  return Math.round((line.start - (mediaTime - TAP_REACTION_S)) * 100) / 100;
}

/** First words of a line, for "tap when you hear …" prompts. */
export function lineLabel(line: Line, maxWords = 6): string {
  const words: string[] = [];
  let cur = "";
  for (const s of line.syllables) {
    cur += s.text;
    if (s.wordEnd) {
      words.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) words.push(cur.trim());
  const shown = words.slice(0, maxWords).join(" ");
  return words.length > maxWords ? `${shown}…` : shown;
}

export function formatOffset(offset: number): string {
  return `${offset >= 0 ? "+" : "−"}${Math.abs(offset).toFixed(2)} s`;
}
