// Fixture checks for the lyric model: syllable counts, LRC parsing, round-trips.
// Run: npm run check:model
import demoTrack from "../src/demoTrack";
import { normalizeTrack } from "../src/model/normalize";
import { buildTimeline } from "../src/model/timeline";
import { splitSyllables } from "../src/model/syllables";
import { exportEnhancedLrc, parseLrc } from "../src/model/lrc";
import { parseTrackJson, trackToJson, sniffKind } from "../src/model/trackIO";
import { lineText } from "../src/lyrics";
import { detectPitchMPM, hzToMidi, pitchClassDistance } from "../src/engine/pitch";
import { createScoreState, applyResult, scoreSyllable, lineRating, gradeFor, summarize } from "../src/engine/scoring";
import type { PitchSample } from "../src/engine/PitchTracker";
import { parseYouTubeId, youtubeTransport, type YTPlayer } from "../src/engine/youtube";
import { trackFromHit, type LyricsSearchHit } from "../src/model/lrclib";
import { cleanVideoTitle, pickLyricsForVideo, trackMatchesVideo } from "../src/model/songMatch";
import { TAP_REACTION_S, formatOffset, lineLabel, offsetForTap, upcomingLine } from "../src/model/sync";
import { classifyUpload, isOfficialKind, officialQuery, rankHits, type YouTubeHit } from "../src/model/youtubeSearch";
import { PlaybackEngine } from "../src/engine/PlaybackEngine";
import type { Transport } from "../src/engine/Transport";

let failures = 0;
const ok = (cond: boolean, msg: string) => {
  if (!cond) failures++;
  console.log(`${cond ? "  ✓" : "  ✗"} ${msg}`);
};

console.log("syllables (acceptance list)");
const expectCounts: [string, number][] = [
  ["Softly", 2], ["Lanterns", 2], ["city", 2], ["Morning", 2], ["quiet", 2], ["Whispers", 2], ["below", 2],
  ["window", 2], ["Embers", 2], ["summer", 2], ["together", 3], ["fades", 1], ["light", 1], ["the", 1],
  ["candle", 2], ["waited", 2], ["played", 1], ["roses", 2], ["darkness", 2], ["beautiful", 3], ["music", 2],
  ["fire", 1], ["love", 1], ["heart", 1], ["forever", 3], ["tonight", 2], ["remember", 3], ["shadows", 2],
  ["yesterday", 3], ["little", 2], ["table", 2], ["river", 2], ["sky,", 1], ["\"Hello\"", 2], ["ci|ty", 2], ["ocean", 2],
];
for (const [w, n] of expectCounts) {
  const s = splitSyllables(w);
  ok(s.length === n, `${w} → ${s.join("-")} (${s.length}, want ${n})`);
}
const joined = splitSyllables("Softly").join("");
ok(joined === "Softly", "split pieces re-join to the original word");

console.log("\nstandard LRC (BOM, CRLF, prefixes, sections, offset, repeated stamps)");
const std = "﻿[ti:Test Song]\r\n[ar:Someone]\r\n[bpm:120]\r\n[offset:+500]\r\n[Intro]\r\n[00:01.00]M: Softly now the light fades\r\n[00:04.50]F: Lanterns drift above the city\r\n[Chorus]\r\n[00:08.00][00:20.00]D: Fly like embers in the night sky\r\n[00:12.00]# Bridge\r\n[00:13.00]Whispers from below, your window\r\n[00:16.00]\r\n";
const r1 = parseLrc(std);
const t1 = r1.track;
ok(t1.title === "Test Song" && t1.artist === "Someone" && t1.bpm === 120, `meta: ${t1.title} / ${t1.artist} / ${t1.bpm} bpm`);
ok(Math.abs((t1.offset ?? 0) + 0.5) < 1e-9, `offset +500ms → track.offset ${t1.offset}`);
ok(t1.lines.length === 5, `5 sung lines (repeated chorus duplicated) → ${t1.lines.length}`);
ok(t1.lines[0].voice === "male" && t1.lines[1].voice === "female" && t1.lines[2].voice === "duet", `voices ${t1.lines.map((l) => l.voice).join(",")}`);
ok(t1.lines[0].section === "Intro" && t1.lines[2].section === "Chorus" && t1.lines[3].section === "Bridge", `sections ${t1.lines.map((l) => l.section).join(",")}`);
ok(lineText(t1.lines[0]) === "Softly now the light fades", `text rebuilt: "${lineText(t1.lines[0])}"`);
const l0 = t1.lines[0];
ok(l0.syllables.length === 6, `syllable count line 0 = ${l0.syllables.length} (Soft-ly now the light fades)`);
ok(l0.syllables[0].wordEnd === false && l0.syllables[1].wordEnd === true, "Soft(ly) joined via wordEnd");
ok(l0.syllables.every((s, i, a) => i === 0 || s.start >= a[i - 1].end - 1e-9), "syllables monotonic");
ok(l0.end <= t1.lines[1].start - 0.14, `line 0 ends before line 1 starts (${l0.end} < ${t1.lines[1].start})`);
ok(l0.syllables[l0.syllables.length - 1].emphasis === true, "last syllable emphasised");
ok(t1.lines[4].start === 20, `repeated timestamp sorted into place (start ${t1.lines[4].start})`);
const slow = l0.syllables.find((s) => s.text === "the")!;
const loud = l0.syllables.find((s) => s.text === "fades")!;
ok(loud.end - loud.start > slow.end - slow.start, `function word shorter than final word (${(slow.end - slow.start).toFixed(2)} < ${(loud.end - loud.start).toFixed(2)})`);
ok(r1.warnings.length === 0, `no warnings (${r1.warnings.join("; ")})`);

console.log("\nenhanced LRC");
const enh = "[00:02.00]D: <00:02.00>Soft<00:02.50>ly <00:03.20>now <00:03.90>the <00:04.30>light <00:05.00>fades<00:05.50>\n[00:06.00]Lan<00:06.40>terns <00:07.10>drift\n[v:female]\n[00:08.00]<00:08.00>Hold me <00:08.90>in<00:09.40>\n";
const r2 = parseLrc(enh);
ok(r2.enhanced && r2.track.source === "lrc-enhanced", "detected enhanced");
const e0 = r2.track.lines[0];
ok(e0.syllables.map((s) => s.text).join("|") === "Soft|ly|now|the|light|fades", `tokens ${e0.syllables.map((s) => s.text).join("|")}`);
ok(e0.syllables[0].wordEnd === false && e0.syllables[1].wordEnd === true, "mid-word token has wordEnd=false");
ok(Math.abs(e0.syllables[5].end - 5.5) < 1e-9 && Math.abs(e0.end - 5.5) < 1e-9, `trailing end tag closes the line at ${e0.end}`);
ok(Math.abs(e0.syllables[1].start - 2.5) < 1e-9 && Math.abs(e0.syllables[1].end - 3.2) < 1e-9, "token end = next token time");
const e1 = r2.track.lines[1];
ok(e1.syllables[0].text === "Lan" && Math.abs(e1.syllables[0].start - 6.0) < 1e-9, "A2 leading text takes the line time");
const e2 = r2.track.lines[2];
ok(e2.voice === "female", "bare [v:female] sets default voice for following lines");
ok(e2.syllables.length === 3 && e2.syllables[1].text === "me", `multi-word token split: ${e2.syllables.map((s) => s.text).join("|")}`);

console.log("\nround trips");
const demo = normalizeTrack(demoTrack);
const back = parseTrackJson(trackToJson(demo));
ok(JSON.stringify(back) === JSON.stringify({ ...demo, source: "json" }), "JSON → parse → deep-equal (source becomes json)");
const lrcText = exportEnhancedLrc(demo);
const re = parseLrc(lrcText).track;
ok(re.lines.length === demo.lines.length, `LRC round trip line count ${re.lines.length}`);
let maxErr = 0;
let textOk = true;
let voiceOk = true;
let sectionOk = true;
demo.lines.forEach((l, i) => {
  const m = re.lines[i];
  if (!m) return;
  if (lineText(l) !== lineText(m)) {
    if (textOk) console.log(`    first text mismatch line ${i}: "${lineText(l)}" vs "${lineText(m)}" | tokens: ${m.syllables.map((s) => s.text + (s.wordEnd ? "|" : "+")).join("")}`);
    textOk = false;
  }
  if (l.voice !== m.voice) voiceOk = false;
  if (l.section !== m.section) sectionOk = false;
  l.syllables.forEach((s, j) => {
    const q = m.syllables[j];
    if (!q) return;
    maxErr = Math.max(maxErr, Math.abs(s.start - q.start), Math.abs(s.end - q.end));
  });
});
ok(textOk, "LRC round trip texts equal");
ok(voiceOk, "LRC round trip voices equal");
ok(sectionOk, "LRC round trip sections equal");
ok(maxErr <= 0.01, `LRC round trip max timing error ${maxErr.toFixed(4)} s (≤ 0.01)`);
ok(sniffKind("x.txt", "[00:01.00] hi") === "lrc" && sniffKind("x.txt", " {\"lines\":[]}") === "json" && sniffKind("x.txt", "hello") === "text", "sniffKind");

console.log("\ntimeline");
const tl = buildTimeline(demo);
ok(tl.findActiveLine(1.0) === 0 && tl.findActiveLine(5.6) === 0 && tl.findActiveLine(5.7) === 1, `handover (prev end 5.5, next start 6.0): 1.0→${tl.findActiveLine(1.0)} 5.6→${tl.findActiveLine(5.6)} 5.7→${tl.findActiveLine(5.7)}`);
ok(tl.findActiveLine(0.3) === -1 && tl.findActiveLine(55.9) === -1, "gaps return -1");
ok(tl.countIns.has(0), `count-in before first line: ${tl.countIns.get(0)?.beats.map((b) => b.toFixed(2)).join(",")}`);
ok(tl.sectionChanges.size === 6, `6 section openings (${tl.sectionChanges.size})`);
ok(tl.maxScore === tl.flat.reduce((a, s) => a + (s.emphasis ? 150 : 100), 0), `maxScore ${tl.maxScore}`);

console.log("\npitch detection (MPM)");
const SR = 48000;
const tone = (hz: number, harmonics = 1, amp = 0.3) => {
  const b = new Float32Array(2048);
  for (let i = 0; i < b.length; i++) {
    let v = 0;
    for (let h = 1; h <= harmonics; h++) v += Math.sin((2 * Math.PI * hz * h * i) / SR) / h;
    b[i] = amp * v;
  }
  return b;
};
for (const hz of [110, 220, 440, 880]) {
  const r = detectPitchMPM(tone(hz), SR);
  ok(!!r && Math.abs(r.hz - hz) / hz < 0.01 && r.clarity > 0.9, `${hz} Hz sine → ${r ? r.hz.toFixed(1) + " Hz, clarity " + r.clarity.toFixed(3) : "null"}`);
}
const rich = detectPitchMPM(tone(196, 6), SR);
ok(!!rich && Math.abs(rich.hz - 196) / 196 < 0.01, `196 Hz with 6 harmonics → ${rich?.hz.toFixed(1)} Hz (no octave error)`);
ok(detectPitchMPM(new Float32Array(2048), SR) === null, "silence → null");
const noise = new Float32Array(2048).map(() => (Math.random() - 0.5) * 0.4);
const nr = detectPitchMPM(noise, SR);
ok(!nr || nr.clarity < 0.85, `white noise → ${nr ? "clarity " + nr.clarity.toFixed(2) + " (rejected by threshold)" : "null"}`);
ok(Math.abs(hzToMidi(440) - 69) < 1e-9 && Math.abs(hzToMidi(220) - 57) < 1e-9, "hzToMidi");
ok(pitchClassDistance(60, 72) === 0 && pitchClassDistance(60, 67) === 5 && pitchClassDistance(60, 71) === 1, "octave-agnostic distance");

console.log("\nscoring");
const mk = (from: number, to: number, midi: number | null, conf = 1): PitchSample[] => {
  const out: PitchSample[] = [];
  for (let t = from; t <= to; t += 0.022) out.push({ t, midi, confidence: conf, rms: 0.1 });
  return out;
};
const syl = { start: 10, end: 10.5, note: 60, emphasis: false };
const perfect = scoreSyllable(syl, 9.5, mk(9.98, 10.5, 60), "normal");
ok(perfect.ratio > 0.95, `on pitch, on time → ratio ${perfect.ratio.toFixed(3)}`);
const octave = scoreSyllable(syl, 9.5, mk(9.98, 10.5, 72.1), "normal");
ok(octave.ratio > 0.95, `octave above → ratio ${octave.ratio.toFixed(3)}`);
const wrong = scoreSyllable(syl, 9.5, mk(9.98, 10.5, 63), "normal");
ok(wrong.pitchScore === 0 && wrong.timingScore > 0.9, `3 semitones off (normal) → pitch ${wrong.pitchScore}, timing ${wrong.timingScore.toFixed(2)}`);
const easyWrong = scoreSyllable(syl, 9.5, mk(9.98, 10.5, 61.5), "easy");
ok(easyWrong.pitchScore! > 0.5 && easyWrong.pitchScore! < 0.8, `1.5 st off (easy) → partial pitch ${easyWrong.pitchScore?.toFixed(2)}`);
const silent = scoreSyllable(syl, 9.5, mk(9.6, 10.5, null, 0), "normal");
ok(silent.ratio === 0, `silence → ratio ${silent.ratio}`);
const late = scoreSyllable(syl, 9.5, [...mk(9.6, 10.24, null, 0), ...mk(10.25, 10.5, 60)], "normal");
ok(late.timingScore < 0.75 && late.timingScore > 0.2, `250 ms late onset → timing ${late.timingScore.toFixed(2)}`);
const legato = scoreSyllable(syl, 9.5, mk(9.5, 10.5, 60), "normal");
ok(legato.timingScore > 0.95, `legato through the boundary → timing ${legato.timingScore.toFixed(2)}`);
const noNote = scoreSyllable({ start: 10, end: 10.5, emphasis: false }, 9.5, mk(9.98, 10.5, 40), "normal");
ok(noNote.pitchScore === null && noNote.ratio > 0.95, `no target note → timing-only ratio ${noNote.ratio.toFixed(2)}`);
ok(lineRating(0.95) === "Perfect" && lineRating(0.8) === "Great" && lineRating(0.5) === "Good" && lineRating(0.1) === "Miss", "line ratings");
ok(gradeFor(0.97) === "S" && gradeFor(0.86) === "A" && gradeFor(0.72) === "B" && gradeFor(0.5) === "C" && gradeFor(0.3) === "D" && gradeFor(0.1) === "E", "grades");
const st = createScoreState();
for (let i = 0; i < 5; i++) applyResult(st, tl.flat[i], perfect);
ok(st.combo === 5 && st.total > 500, `combo climbs: combo ${st.combo}, total ${st.total}`);
applyResult(st, tl.flat[5], silent);
ok(st.combo === 0 && st.maxCombo === 5, `miss resets combo (max kept ${st.maxCombo})`);
const sum = summarize(st, tl);
ok(sum.partial && sum.coverage < 0.1, `partial summary when few syllables evaluated (coverage ${(sum.coverage * 100).toFixed(0)}%)`);

console.log("\nyoutube");
const ids: [string, string | null][] = [
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ?t=42", "dQw4w9WgXcQ"],
  ["https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RD", "dQw4w9WgXcQ"],
  ["youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://example.com/watch?v=dQw4w9WgXcQ", null],
  ["not a link", null],
  ["", null],
];
for (const [inp, want] of ids) ok(parseYouTubeId(inp) === want, `parseYouTubeId(${JSON.stringify(inp)}) → ${parseYouTubeId(inp)}`);
const fake = { t: 0, state: 2, rate: 1, played: 0, paused: 0, seeks: [] as number[] };
const fp: YTPlayer = {
  playVideo: () => { fake.played++; fake.state = 1; },
  pauseVideo: () => { fake.paused++; fake.state = 2; },
  seekTo: (s) => { fake.seeks.push(s); fake.t = s; },
  getCurrentTime: () => fake.t,
  getDuration: () => 213,
  getPlayerState: () => fake.state,
  getPlaybackRate: () => fake.rate,
  setPlaybackRate: (r) => { fake.rate = r; },
  getAvailablePlaybackRates: () => [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2],
  destroy: () => {},
};
const tr = youtubeTransport(fp);
const evs: string[] = [];
tr.subscribe((e) => evs.push(e));
tr.play(); tr.setRate(1.3); tr.seek(30.5); tr.notify("pause");
ok(fake.played === 1 && tr.playing(), "transport.play → playVideo, playing()");
ok(fake.rate === 1.25 && tr.rate() === 1.25, `rate 1.3 snaps to nearest available (${fake.rate})`);
ok(fake.seeks[0] === 30.5 && tr.time() === 30.5 && evs.includes("seek"), "seek forwards to player and emits seek");
ok(tr.duration() === 213 && evs.includes("pause"), "duration + notify");
ok(tr.kind === "youtube" && tr.extrapolation > 0.25, "youtube transport allows longer extrapolation");

console.log("\nlrclib");
const hit: LyricsSearchHit = {
  id: 1, title: "Embers & Light", artist: "Demo", album: "", duration: 60, synced: true, instrumental: false, plainLyrics: "",
  syncedLyrics: "[00:02.00] Softly now the light fades\n[00:06.00] Lanterns drift above the city\n[00:10.50] Morning came so quiet here\n",
};
const ht = trackFromHit(hit);
ok(ht.title === "Embers & Light" && ht.artist === "Demo", `trackFromHit meta ${ht.title} / ${ht.artist}`);
ok(ht.lines.length === 3 && ht.lines[0].syllables.length === 6, `3 lines, first has 6 syllables (${ht.lines[0].syllables.length})`);
ok(ht.duration === 60, `duration from hit (${ht.duration})`);
let threw = false;
try { trackFromHit({ ...hit, synced: false, syncedLyrics: "" }); } catch { threw = true; }
ok(threw, "plain hit refuses trackFromHit");

console.log("\nsong matching");
const c1 = cleanVideoTitle("Lady Gaga - Bad Romance (Official Music Video)", "LadyGagaVEVO");
ok(c1.title === "Bad Romance" && c1.artist === "Lady Gaga", `clean: ${JSON.stringify(c1)}`);
const c2 = cleanVideoTitle("Bad Romance", "Lady Gaga - Topic");
ok(c2.title === "Bad Romance" && c2.artist === "Lady Gaga", `topic channel: ${JSON.stringify(c2)}`);
const c3 = cleanVideoTitle("Lady Gaga - Paparazzi (Lyrics)", "MusiCat");
ok(c3.title === "Paparazzi" && c3.artist === "Lady Gaga", `lyrics video: ${JSON.stringify(c3)}`);
const c4 = cleanVideoTitle("LADY GAGA (Video Oficial) - Peso Pluma", "Peso Pluma");
ok(c4.artist.toLowerCase() === "peso pluma", `flip when channel names 2nd part: ${JSON.stringify(c4)}`);
const c5 = cleanVideoTitle("Hallelujah [Official Audio] HD", "Jeff Buckley - Topic");
ok(c5.title === "Hallelujah" && c5.artist === "Jeff Buckley", `brackets/HD: ${JSON.stringify(c5)}`);
const mk2 = (id: number, title: string, artist: string, duration: number, synced = true): LyricsSearchHit => ({ id, title, artist, album: "", duration, synced, instrumental: false, plainLyrics: "x", syncedLyrics: synced ? "[00:01.00] a" : "" });
const video = { title: "Lady Gaga - Bad Romance (Official Music Video)", channel: "LadyGagaVEVO", duration: 308 };
const picked = pickLyricsForVideo([mk2(1, "Bad Romance", "Lady Gaga", 294), mk2(2, "Bad Romance", "Lady Gaga", 309), mk2(3, "Bad Romance (Live)", "Lady Gaga", 420), mk2(4, "Bad Romance", "Lady Gaga", 308, false)], video);
ok(picked?.id === 2, `prefers duration match among synced hits (picked ${picked?.id})`);
ok(pickLyricsForVideo([mk2(9, "Poker Face", "Lady Gaga", 237)], video) === null, "unrelated title → no match");
ok(trackMatchesVideo("Bad Romance", "Lady Gaga", video) && !trackMatchesVideo("Embers & Light", "LyricGlow Demo", video), "trackMatchesVideo");

console.log("\nofficial uploads (YouTube Music / official video filter)");
ok(classifyUpload("Bad Romance", "Lady Gaga - Topic") === "topic", "'- Topic' channel → YouTube Music art track");
ok(classifyUpload("Lady Gaga - Bad Romance (Official Music Video)", "LadyGagaVEVO") === "official", "VEVO → official");
ok(classifyUpload("Bad Romance (Official Lyric Video)", "Lady Gaga") === "official", "official lyric video stays official");
ok(classifyUpload("Bad Romance (Karaoke Version)", "KaraokeChannel") === "unofficial", "karaoke → unofficial");
ok(classifyUpload("Bad Romance - Lady Gaga (cover)", "Some Singer") === "unofficial", "cover → unofficial");
ok(classifyUpload("Bad Romance (Live at the Monster Ball)", "Fan Uploads") === "unofficial", "live → unofficial");
ok(classifyUpload("Bad Romance", "Lady Gaga", "Lady Gaga") === "artist", "artist's own channel → artist");
ok(classifyUpload("Bad Romance", "Random Channel", "Lady Gaga") === "other", "unknown uploader → other");
const mkYt = (id: string, title: string, channel: string, duration: number, artist = "Lady Gaga"): YouTubeHit => {
  const kind = classifyUpload(title, channel, artist);
  return { videoId: id, title, channel, thumbnail: "", duration, kind, official: isOfficialKind(kind) };
};
const ranked = rankHits(
  [
    mkYt("k", "Bad Romance (Karaoke Version)", "KaraokeChannel", 295),
    mkYt("o", "Lady Gaga - Bad Romance (Official Music Video)", "LadyGagaVEVO", 308),
    mkYt("t2", "Bad Romance", "Lady Gaga - Topic", 334),
    mkYt("t1", "Bad Romance", "Lady Gaga - Topic", 295),
    mkYt("a", "Bad Romance", "Lady Gaga", 300),
  ],
  { title: "Bad Romance", artist: "Lady Gaga", lyricsDuration: 294 },
);
ok(ranked.map((h) => h.videoId).join(",") === "t1,t2,o,a,k", `rank: topic (closest length first) → official → artist → unofficial last (${ranked.map((h) => h.videoId).join(",")})`);
ok(officialQuery("Bad Romance", "Lady Gaga") === "Bad Romance Lady Gaga" && officialQuery("Bad Romance", "Unknown artist") === "Bad Romance", "officialQuery drops the karaoke suffix and unknown artists");

console.log("\ntap-to-sync");
const demoN = normalizeTrack(demoTrack);
const up0 = upcomingLine(demoN, 0);
ok(up0?.id === "intro-1", `at 0 s the upcoming line is intro-1 (${up0?.id})`);
ok(upcomingLine(demoN, 2.05)?.id === "intro-1", "just after a line starts it is still the target (first 25 %)");
ok(upcomingLine(demoN, 4.0)?.id === "intro-2", "mid-line → next line is the target");
ok(upcomingLine({ ...demoN, offset: -2 }, 5.2)?.id === "intro-2", "offset is honoured when picking the target");
ok(upcomingLine(demoN, 60) === null, "past the end → nothing");
const off = offsetForTap(demoN.lines[1], 8.0); // intro-2 starts at 6.0 in the lyrics, singer heard at 8.0
ok(Math.abs(off - (6.0 - (8.0 - TAP_REACTION_S))) < 1e-9, `offset for a tap at 8.0 on a 6.0 line = ${off}`);
ok(Math.abs(8.0 - TAP_REACTION_S + off - 6.0) < 1e-9, "media time + offset lands on the line start");
ok(lineLabel(demoN.lines[0]) === "Softly now the light fades", `line label: ${lineLabel(demoN.lines[0])}`);
ok(lineLabel(demoN.lines[1], 3) === "Lanterns drift above…", `truncated label: ${lineLabel(demoN.lines[1], 3)}`);
ok(formatOffset(1.3) === "+1.30 s" && formatOffset(-0.5) === "−0.50 s", "formatOffset");

console.log("\nmedia clock slew (PlaybackEngine with a coarse transport)");
{
  const g = globalThis as unknown as { requestAnimationFrame?: unknown; cancelAnimationFrame?: unknown };
  let tickCb: ((now: number) => void) | null = null;
  const prevRaf = g.requestAnimationFrame;
  const prevCaf = g.cancelAnimationFrame;
  g.requestAnimationFrame = (cb: (now: number) => void) => {
    tickCb = cb;
    return 1;
  };
  g.cancelAnimationFrame = () => {};
  let mediaTime = 10;
  let subs: ((ev: string) => void)[] = [];
  const coarse: Transport = {
    kind: "youtube",
    extrapolation: 0.6,
    time: () => mediaTime,
    duration: () => 100,
    playing: () => true,
    ended: () => false,
    rate: () => 1,
    play: () => {},
    pause: () => {},
    seek: () => {},
    setRate: () => {},
    subscribe: (cb) => {
      subs.push(cb as (ev: string) => void);
      return () => {
        subs = subs.filter((s) => s !== cb);
      };
    },
  };
  const eng = new PlaybackEngine();
  eng.attachTransport(coarse);
  const times: number[] = [];
  eng.subscribeFrame((f) => times.push(f.time), "render");
  let now = 1000;
  const step = () => {
    now += 16.7;
    tickCb?.(now);
  };
  step(); // first frame snaps to 10
  // the iframe reports every 250 ms, and the report jitters ±60 ms around the truth
  let maxJump = 0;
  let backward = 0;
  for (let i = 1; i <= 120; i++) {
    if (i % 15 === 0) mediaTime = 10 + (i * 16.7) / 1000 + (i % 30 === 0 ? 0.06 : -0.06);
    step();
    const d = times[times.length - 1] - times[times.length - 2];
    if (d < 0) backward++;
    maxJump = Math.max(maxJump, d);
  }
  const covered = times[times.length - 1] - times[0];
  ok(backward === 0, `no backward steps (${backward})`);
  ok(maxJump < 0.03, `largest per-frame jump ${maxJump.toFixed(3)} s (< 0.03 at 60 fps)`);
  ok(Math.abs(covered - 2.0) < 0.3, `2.0 s of wall time covered ≈ ${covered.toFixed(2)} s of song`);
  eng.dispose();
  g.requestAnimationFrame = prevRaf;
  g.cancelAnimationFrame = prevCaf;
}

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
