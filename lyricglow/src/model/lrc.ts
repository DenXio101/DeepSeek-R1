// ─── LRC import / export ───────────────────────────────────────────────────
// Supports standard line-timed LRC ([mm:ss.xx]), enhanced word-timed LRC
// (<mm:ss.xx> tokens), Walaoke voice prefixes (M:/F:/D:), inline [v:] tags,
// section markers and the usual metadata tags.

import type { Section, SectionMarker, Track, Voice } from "../lyrics";
import { isKnownSection } from "../lyrics";
import { normalizeTrack, type RawLine, type RawSyllable, type RawTrack } from "./normalize";
import { splitSyllables } from "./syllables";

export interface LrcParseResult {
  track: Track;
  warnings: string[];
  enhanced: boolean;
}

const TS_SRC = String.raw`\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]`;
const TS_NC = String.raw`\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]`;
const LINE_RE = new RegExp(`^((?:${TS_NC})+)(.*)$`);
const TS_G = new RegExp(TS_SRC, "g");
const WORD_TS_G = /<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>/g;
const META_RE = /^\[([a-zA-Z][a-zA-Z0-9_-]*):(.*)\]$/;
const SECTION_RE = /^[[(#\s]*(intro|verse|pre-?chorus|chorus|refrain|hook|bridge|interlude|solo|instrumental|coda|outro)(?:\s*\d+)?[\])\s]*$/i;
const VOICE_PREFIX_RE = /^\s*(M|F|D|M1|M2|F1|F2|MALE|FEMALE|DUET|BOTH)\s*:\s*/i;
const VOICE_TAG_G = /\[v(?:oice)?\s*:\s*(male|female|duet|m|f|d|both|1|2)\]/gi;
const FUNCTION_WORDS = new Set(["a", "an", "the", "of", "to", "in", "on", "and", "or", "but", "at", "by", "for", "so"]);

function tsToSeconds(m: string, s: string, frac?: string): number {
  let f = 0;
  if (frac) {
    const digits = frac.length;
    f = parseInt(frac, 10) / Math.pow(10, digits === 1 ? 1 : digits === 2 ? 2 : 3);
  }
  return parseInt(m, 10) * 60 + parseInt(s, 10) + f;
}

function voiceFrom(tag: string): Voice {
  const t = tag.toLowerCase();
  if (t.startsWith("f") || t === "2") return "female";
  if (t.startsWith("m") || t === "1") return "male";
  return "duet";
}

function sectionFrom(word: string): Section {
  const w = word.toLowerCase().replace(/\s+/g, "");
  if (w === "refrain" || w === "hook" || w === "chorus") return "Chorus";
  if (w === "prechorus" || w === "pre-chorus") return "Pre-Chorus";
  if (w === "solo" || w === "instrumental" || w === "interlude") return "Interlude";
  const cap = w.charAt(0).toUpperCase() + w.slice(1);
  return isKnownSection(cap) ? cap : cap;
}

interface Event {
  time: number;
  text: string;
  order: number;
}

/** "[Chorus]", "# Verse 2", "(Bridge)" → canonical section, else null. Shared with Sync Studio. */
export function parseSectionMarker(text: string): Section | null {
  const m = SECTION_RE.exec(text.trim());
  return m && text.trim().length <= 24 ? sectionFrom(m[1]) : null;
}

/** "M: hello" → { voice: "male", rest: "hello" }; no prefix → voice null. */
export function stripVoicePrefix(text: string): { voice: Voice | null; rest: string } {
  const vp = VOICE_PREFIX_RE.exec(text);
  if (!vp) return { voice: null, rest: text };
  return { voice: voiceFrom(vp[1]), rest: text.slice(vp[0].length) };
}

export function parseLrc(input: string): LrcParseResult {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const warnings: string[] = [];
  const meta: Record<string, string> = {};
  const sectionMarkers: SectionMarker[] = [];
  const lgSections: SectionMarker[] = [];
  const untimedSectionAt: { order: number; section: Section }[] = [];
  const untimedVoiceAt: { order: number; voice: Voice }[] = [];
  const events: Event[] = [];
  let order = 0;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;
    const metaMatch = META_RE.exec(line.trim());
    if (metaMatch) {
      const key = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (key === "v" || key === "voice") {
        untimedVoiceAt.push({ order, voice: voiceFrom(val) });
        continue;
      }
      if (key === "lg-section") {
        const [t, name] = val.split("|");
        const tm = new RegExp(`^(\\d{1,3}):(\\d{2})(?:[.:](\\d{1,3}))?$`).exec(t.trim());
        if (tm && name) lgSections.push({ name: sectionFrom(name.trim()) || name.trim(), start: tsToSeconds(tm[1], tm[2], tm[3]) });
      } else meta[key] = val;
      continue;
    }
    const lm = LINE_RE.exec(line);
    if (!lm) {
      // untimed: section marker, voice default, or ignorable text
      const sm = SECTION_RE.exec(line);
      if (sm) {
        untimedSectionAt.push({ order, section: sectionFrom(sm[1]) });
        continue;
      }
      const vt = new RegExp(VOICE_TAG_G.source, "i").exec(line);
      if (vt && line.replace(new RegExp(VOICE_TAG_G.source, "gi"), "").trim() === "") {
        untimedVoiceAt.push({ order, voice: voiceFrom(vt[1]) });
        continue;
      }
      continue;
    }
    const stamps = [...lm[1].matchAll(TS_G)].map((m) => tsToSeconds(m[1], m[2], m[3]));
    const body = lm[2];
    for (const t of stamps) events.push({ time: t, text: body, order });
    order++;
  }

  if (events.length === 0) throw new Error("No timestamped lyric lines found ([mm:ss.xx] …).");
  events.sort((a, b) => a.time - b.time || a.order - b.order);
  lgSections.sort((a, b) => a.start - b.start);
  sectionMarkers.push(...lgSections);

  // LRC convention: positive [offset:] shifts lyrics EARLIER by that many ms.
  const offsetMs = meta.offset ? parseFloat(meta.offset) : 0;
  const offset = Number.isFinite(offsetMs) ? -offsetMs / 1000 : 0;

  let enhanced = false;
  let currentSection: Section = "Verse";
  let defaultVoice: Voice = "duet";
  const lines: RawLine[] = [];
  let sectionIdx = 0;
  let voiceIdx = 0;

  for (let ei = 0; ei < events.length; ei++) {
    const ev = events[ei];
    const nextStart = ei + 1 < events.length ? events[ei + 1].time : Infinity;

    // apply untimed markers that appeared before this line in the file
    while (sectionIdx < untimedSectionAt.length && untimedSectionAt[sectionIdx].order <= ev.order) {
      currentSection = untimedSectionAt[sectionIdx].section;
      sectionMarkers.push({ name: currentSection, start: ev.time });
      sectionIdx++;
    }
    while (voiceIdx < untimedVoiceAt.length && untimedVoiceAt[voiceIdx].order <= ev.order) {
      defaultVoice = untimedVoiceAt[voiceIdx].voice;
      voiceIdx++;
    }

    // explicit [lg-section:] markers (our own export) take precedence
    if (lgSections.length) {
      for (const m of lgSections) if (m.start <= ev.time + 0.011) currentSection = m.name;
    }

    let body = ev.text;
    // timed section marker line (e.g. "[00:28.00][Chorus]" or "[00:28.00]# Chorus")
    const plainBody = body.replace(WORD_TS_G, "").trim();
    const secM = SECTION_RE.exec(plainBody);
    if (secM && plainBody.length <= 24) {
      currentSection = sectionFrom(secM[1]);
      sectionMarkers.push({ name: currentSection, start: ev.time });
      continue;
    }

    // voice: inline tags then prefix
    let voice: Voice = defaultVoice;
    let sawTag = false;
    body = body.replace(VOICE_TAG_G, (_, v: string) => {
      voice = voiceFrom(v);
      sawTag = true;
      return "";
    });
    if (sawTag && body.trim() === "") {
      defaultVoice = voice;
      continue;
    }
    const vp = VOICE_PREFIX_RE.exec(body);
    if (vp) {
      voice = voiceFrom(vp[1]);
      body = body.slice(vp[0].length);
    }
    if (!body.trim()) continue; // instrumental gap line

    const id = `l${lines.length}-${Math.round(ev.time * 100)}`;
    let syllables: RawSyllable[];
    if (WORD_TS_G.test(body)) {
      enhanced = true;
      syllables = parseEnhancedBody(body, ev.time, nextStart, warnings);
    } else {
      syllables = distributePlainLine(body, ev.time, nextStart);
    }
    WORD_TS_G.lastIndex = 0;
    if (!syllables.length) continue;
    syllables[syllables.length - 1].emphasis = true;
    lines.push({ id, voice, section: currentSection, syllables });
  }

  if (!lines.length) throw new Error("The file has timestamps but no singable lyric lines.");

  const bpm = meta.bpm ? parseFloat(meta.bpm) : NaN;
  const raw: RawTrack = {
    title: meta.ti || meta.title || "Imported lyrics",
    artist: meta.ar || meta.artist || "",
    album: meta.al,
    bpm: Number.isFinite(bpm) && bpm > 0 ? bpm : 100,
    lines,
    offset,
    sections: sectionMarkers.length ? dedupeSections(sectionMarkers) : undefined,
    source: enhanced ? "lrc-enhanced" : "lrc",
  };
  if (!meta.bpm) warnings.push("No [bpm:] tag — beat effects use 100 bpm.");
  return { track: normalizeTrack(raw), warnings, enhanced };
}

function dedupeSections(markers: SectionMarker[]): SectionMarker[] {
  const sorted = [...markers].sort((a, b) => a.start - b.start);
  const out: SectionMarker[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && last.name === m.name) continue;
    if (last && Math.abs(last.start - m.start) < 0.01) {
      out[out.length - 1] = m;
      continue;
    }
    out.push(m);
  }
  return out;
}

/** heuristic length of a plain line */
function plainLineEnd(start: number, nextStart: number, nSyl: number): number {
  const natural = Math.min(Math.max(0.32 * nSyl + 0.4, 1.2), 0.55 * nSyl + 0.8);
  if (!Number.isFinite(nextStart)) return start + 0.45 * nSyl + 0.6;
  return Math.max(start + 0.4, Math.min(nextStart - 0.15, start + natural));
}

interface Chunk {
  text: string;
  wordEnd: boolean;
  weight: number;
  restAfter: number;
}

function chunkWords(words: string[]): Chunk[] {
  const chunks: Chunk[] = [];
  words.forEach((w, wi) => {
    const syls = splitSyllables(w);
    const isLastWord = wi === words.length - 1;
    const lowerCore = w.toLowerCase().replace(/[^\p{L}]/gu, "");
    syls.forEach((s, si) => {
      const last = si === syls.length - 1;
      let weight = 1;
      if (last) weight *= 1.15;
      if (last && isLastWord) weight *= 1.6;
      if (syls.length === 1 && FUNCTION_WORDS.has(lowerCore)) weight *= 0.7;
      const restAfter = last && /[,;:]$/.test(w) ? 0.12 : last && /[.!?]$/.test(w) && !isLastWord ? 0.18 : 0;
      chunks.push({ text: s, wordEnd: last, weight, restAfter });
    });
  });
  return chunks;
}

function distributePlainLine(body: string, start: number, nextStart: number): RawSyllable[] {
  const words = body.trim().split(/\s+/).filter(Boolean);
  const chunks = chunkWords(words);
  if (!chunks.length) return [];
  const end = plainLineEnd(start, nextStart, chunks.length);
  return layoutChunks(chunks, start, end);
}

/** spread chunks across [start, end] by weight with 6 % inter-word gaps and punctuation rests */
function layoutChunks(chunks: Chunk[], start: number, end: number): RawSyllable[] {
  const rests = chunks.reduce((a, c) => a + c.restAfter, 0);
  const span = Math.max(0.2, end - start - rests);
  const totalW = chunks.reduce((a, c) => a + c.weight, 0);
  const out: RawSyllable[] = [];
  let t = start;
  chunks.forEach((c) => {
    const dur = (span * c.weight) / totalW;
    const gap = c.wordEnd ? dur * 0.06 : 0;
    const sEnd = t + dur - gap;
    out.push({ text: c.text, start: round3(t), end: round3(sEnd), wordEnd: c.wordEnd });
    t += dur + c.restAfter;
  });
  return out;
}

interface Token {
  time: number;
  text: string;
  /** set when an empty <time> token followed this one */
  endOverride?: number;
}

function parseEnhancedBody(body: string, lineStart: number, nextStart: number, warnings: string[]): RawSyllable[] {
  const tokens: Token[] = [];
  let lastIdx = 0;
  let lastTime = lineStart;
  WORD_TS_G.lastIndex = 0;
  let m: RegExpExecArray | null;
  let first = true;
  while ((m = WORD_TS_G.exec(body))) {
    const seg = body.slice(lastIdx, m.index);
    if (first) {
      if (seg.trim()) tokens.push({ time: lineStart, text: seg });
      first = false;
    } else tokens.push({ time: lastTime, text: seg });
    lastTime = tsToSeconds(m[1], m[2], m[3]);
    lastIdx = m.index + m[0].length;
  }
  tokens.push({ time: lastTime, text: body.slice(lastIdx) });

  // trailing empty token = explicit end time
  let explicitEnd: number | null = null;
  if (tokens.length && tokens[tokens.length - 1].text.trim() === "") {
    explicitEnd = tokens.pop()!.time;
  }
  // interior empty tokens mark where the previous token stopped (inter-word gaps)
  const clean: Token[] = [];
  for (const tk of tokens) {
    if (tk.text.trim() === "") {
      const prev = clean[clean.length - 1];
      if (prev) {
        if (prev.endOverride === undefined) prev.endOverride = tk.time;
        prev.text += tk.text; // keep the word-separating whitespace
      }
      continue;
    }
    clean.push(tk);
  }
  if (!clean.length) return [];

  let nSyl = 0;
  for (const tk of clean) nSyl += Math.max(1, tk.text.trim().split(/\s+/).length);
  const lineEnd = explicitEnd ?? plainLineEnd(lineStart, nextStart, nSyl);

  const out: RawSyllable[] = [];
  clean.forEach((tk, i) => {
    const tStart = tk.time;
    const tEnd = tk.endOverride ?? (i + 1 < clean.length ? clean[i + 1].time : lineEnd);
    if (tEnd <= tStart) warnings.push(`Non-increasing word time at ${tStart.toFixed(2)}s`);
    const text = tk.text;
    const trailingSpace = /\s$/.test(text);
    const words = text.trim().split(/\s+/).filter(Boolean);
    if (words.length === 1) {
      out.push({ text: words[0], start: round3(tStart), end: round3(Math.max(tStart + 0.04, tEnd)), wordEnd: trailingSpace || i === clean.length - 1 });
      return;
    }
    // several words inside one token: split evenly by syllable weight
    const chunks = chunkWords(words);
    if (!trailingSpace && i < clean.length - 1) chunks[chunks.length - 1].wordEnd = false;
    out.push(...layoutChunks(chunks, tStart, Math.max(tStart + 0.08, tEnd)));
  });
  if (out.length) out[out.length - 1].wordEnd = true;
  return out;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ─── export ────────────────────────────────────────────────────────────────

export function formatLrcTime(t: number): string {
  const total = Math.max(0, t);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  const cs = Math.round(s * 100);
  const ss = Math.floor(cs / 100);
  const frac = cs % 100;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
}

const VOICE_PREFIX: Record<Voice, string> = { male: "M", female: "F", duet: "D" };

/** Enhanced LRC with Walaoke voice prefixes and lg-section metadata (lossless except notes). */
export function exportEnhancedLrc(track: Track): string {
  const out: string[] = [];
  out.push(`[ti:${track.title}]`);
  out.push(`[ar:${track.artist}]`);
  if (track.album) out.push(`[al:${track.album}]`);
  out.push(`[by:LyricGlow]`);
  out.push(`[re:LyricGlow]`);
  out.push(`[ve:1]`);
  out.push(`[bpm:${track.bpm}]`);
  const offsetMs = Math.round(-(track.offset ?? 0) * 1000);
  out.push(`[offset:${offsetMs >= 0 ? "+" : ""}${offsetMs}]`);
  for (const s of track.sections ?? []) out.push(`[lg-section:${formatLrcTime(s.start)}|${s.name}]`);
  out.push("");
  for (const line of track.lines) {
    let s = `[${formatLrcTime(line.start)}]${VOICE_PREFIX[line.voice]}: `;
    line.syllables.forEach((syl, i, arr) => {
      const next = arr[i + 1];
      s += `<${formatLrcTime(syl.start)}>${syl.text}`;
      // explicit end token when the next syllable doesn't start where this one ends
      if (next && next.start - syl.end > 0.011) s += `<${formatLrcTime(syl.end)}>`;
      if (syl.wordEnd) s += " ";
    });
    s = s.trimEnd() + `<${formatLrcTime(line.end)}>`;
    out.push(s);
  }
  return out.join("\n") + "\n";
}
