// ─── Track import / export (JSON + file sniffing + downloads) ──────────────
import type { Track } from "../lyrics";
import { normalizeTrack, type RawTrack } from "./normalize";
import { exportEnhancedLrc, parseLrc } from "./lrc";

export const TRACK_FORMAT = "lyricglow-track";
export const TRACK_VERSION = 1;

export interface ImportResult {
  track: Track;
  warnings: string[];
  kind: "json" | "lrc";
}

export function trackToJson(track: Track): string {
  return JSON.stringify({ format: TRACK_FORMAT, version: TRACK_VERSION, ...track }, null, 2);
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

/** Structural check with helpful error messages; accepts the bare Track shape too. */
export function assertTrackLike(x: unknown): asserts x is RawTrack {
  if (!isObj(x)) throw new Error("JSON root must be an object.");
  if (!Array.isArray(x.lines)) throw new Error('Missing "lines" array.');
  if (x.lines.length === 0) throw new Error('"lines" is empty.');
  x.lines.forEach((l, li) => {
    if (!isObj(l) || !Array.isArray(l.syllables)) throw new Error(`Line ${li + 1}: missing "syllables" array.`);
    if (l.syllables.length === 0) throw new Error(`Line ${li + 1}: no syllables.`);
    l.syllables.forEach((s, si) => {
      if (!isObj(s) || typeof s.text !== "string") throw new Error(`Line ${li + 1}, syllable ${si + 1}: missing "text".`);
      if (typeof s.start !== "number" || typeof s.end !== "number" || !Number.isFinite(s.start) || !Number.isFinite(s.end))
        throw new Error(`Line ${li + 1}, syllable ${si + 1} ("${s.text}"): start/end must be numbers.`);
      if (s.end < s.start) throw new Error(`Line ${li + 1}, syllable ${si + 1} ("${s.text}"): end before start.`);
    });
  });
}

export function parseTrackJson(text: string): Track {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not valid JSON.");
  }
  if (isObj(data) && data.format && data.format !== TRACK_FORMAT) throw new Error(`Unknown format "${String(data.format)}".`);
  assertTrackLike(data);
  const raw: RawTrack = { ...data, title: String(data.title ?? "Imported track"), artist: String(data.artist ?? ""), bpm: Number(data.bpm ?? 100), source: "json" };
  delete (raw as Record<string, unknown>).format;
  delete (raw as Record<string, unknown>).version;
  return normalizeTrack(raw);
}

export function sniffKind(name: string, text: string): "json" | "lrc" | "text" {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "json") return "json";
  if (ext === "lrc") return "lrc";
  const t = text.replace(/^﻿/, "").trimStart();
  if (t.startsWith("{")) return "json";
  if (/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/.test(t)) return "lrc";
  return "text";
}

export function importLyricsText(name: string, text: string): ImportResult {
  const kind = sniffKind(name, text);
  if (kind === "json") return { track: parseTrackJson(text), warnings: [], kind };
  if (kind === "lrc") {
    const r = parseLrc(text);
    return { track: r.track, warnings: r.warnings, kind };
  }
  throw new Error("No timestamps found. Use an .lrc or LyricGlow .json file — or open Sync Studio to time plain lyrics.");
}

export function exportLrc(track: Track): string {
  return exportEnhancedLrc(track);
}

export function safeFileStem(s: string): string {
  return (s || "lyricglow").replace(/[^\p{L}\p{N}_-]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "lyricglow";
}

/** Hand a text file to the user (allowed: nothing is persisted in the browser). */
export function downloadTextFile(name: string, text: string, mime = "text/plain"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
