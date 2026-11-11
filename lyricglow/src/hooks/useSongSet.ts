// ─── useSongSet ──────────────────────────────────────────────────────────────
// The session's song set: up to SET_CAP local files with their lyrics, the index
// of the one being sung and whether the set is running. Lives only in React
// state (nothing persisted). Loading an entry into the stage is App's job
// (the same path a single file upload takes), so the object-URL lifecycle has
// one owner, as before.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaKind } from "../components/MediaElement";
import type { Track } from "../lyrics";

export const SET_CAP = 8;

export interface SetEntry {
  id: string;
  file: File;
  mediaKind: MediaKind;
  /** shown on the intro card and in the list: the lyrics' title, else the file name */
  title: string;
  artist: string;
  /** null = no lyrics picked yet */
  track: Track | null;
}

export interface SetState {
  entries: SetEntry[];
  /** index of the current song; −1 before the set starts or after it ends */
  index: number;
  /** a set is running (the grade screen offers Next / End set) */
  active: boolean;
}

export const EMPTY_SET: SetState = { entries: [], index: -1, active: false };

// ── pure helpers (fixture-tested) ────────────────────────────────────────────

export function addEntry(state: SetState, entry: SetEntry): { state: SetState; ok: boolean; reason?: string } {
  if (state.entries.length >= SET_CAP) return { state, ok: false, reason: `Set is full (${SET_CAP} songs)` };
  return { state: { ...state, entries: [...state.entries, entry] }, ok: true };
}

/** remove by id; the index keeps pointing at the same song, or at the next one when the current song goes */
export function removeEntry(state: SetState, id: string): SetState {
  const at = state.entries.findIndex((e) => e.id === id);
  if (at < 0) return state;
  const entries = state.entries.filter((e) => e.id !== id);
  let index = state.index;
  if (at < index) index--;
  if (index >= entries.length) index = entries.length - 1;
  if (!entries.length) index = -1;
  return { ...state, entries, index, active: state.active && index >= 0 };
}

/** index of the song after the current one, or null at the end of the set */
export function nextIndex(state: SetState): number | null {
  const i = state.index + 1;
  return i < state.entries.length ? i : null;
}

export function mediaKindOf(file: File): MediaKind {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name) ? "video" : "audio";
}

export function entryFrom(file: File, track: Track | null): SetEntry {
  const stem = file.name.replace(/\.[^.]+$/, "");
  const title = track?.title && track.title !== "Untitled" ? track.title : stem;
  const artist = track?.artist && track.artist !== "Unknown artist" ? track.artist : "";
  return { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, file, mediaKind: mediaKindOf(file), title, artist, track };
}

// ── hook ─────────────────────────────────────────────────────────────────────

export function useSongSet() {
  const [state, setState] = useState<SetState>(EMPTY_SET);
  // actions read the latest state synchronously (start/next must return the entry inside the tap)
  const ref = useRef(state);
  useEffect(() => {
    ref.current = state;
  }, [state]);

  const add = useCallback((file: File, track: Track | null) => {
    const r = addEntry(ref.current, entryFrom(file, track));
    if (r.ok) {
      ref.current = r.state;
      setState(r.state);
    }
    return r;
  }, []);
  const remove = useCallback((id: string) => {
    const next = removeEntry(ref.current, id);
    ref.current = next;
    setState(next);
  }, []);
  /** start from the first song; returns it (null when the set is empty) */
  const start = useCallback((): SetEntry | null => {
    const s = ref.current;
    if (!s.entries.length) return null;
    const next = { ...s, index: 0, active: true };
    ref.current = next;
    setState(next);
    return s.entries[0];
  }, []);
  /** advance; returns the next song (null at the end) */
  const next = useCallback((): SetEntry | null => {
    const s = ref.current;
    const i = nextIndex(s);
    if (i === null) return null;
    const nextState = { ...s, index: i, active: true };
    ref.current = nextState;
    setState(nextState);
    return s.entries[i];
  }, []);
  /** stop running the set; the current song stays loaded on the stage */
  const end = useCallback(() => {
    const next = { ...ref.current, active: false };
    ref.current = next;
    setState(next);
  }, []);
  /** the stage is about to load something else: the set is no longer current */
  const leave = useCallback(() => {
    const s = ref.current;
    if (s.index === -1 && !s.active) return;
    const next = { ...s, index: -1, active: false };
    ref.current = next;
    setState(next);
  }, []);

  const current = state.index >= 0 ? (state.entries[state.index] ?? null) : null;
  const upcoming = nextIndex(state);
  const nextEntry = upcoming === null ? null : state.entries[upcoming];
  const position = current ? `Song ${state.index + 1} of ${state.entries.length}` : "";

  return useMemo(
    () => ({ state, current, nextEntry, position, cap: SET_CAP, add, remove, start, next, end, leave }),
    [state, current, nextEntry, position, add, remove, start, next, end, leave],
  );
}

export type SongSet = ReturnType<typeof useSongSet>;
