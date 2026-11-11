# Finish the KaraFun set — key change, intro card + queue, Vocals switch

* **Author:** Dennis Valencia (repo owner; drafted by the session agent)
* **Date:** 2026-11-10
* **Inputs:** `feature_concept.md`, seven Goldfish lens reports in `lenses/` (Skeptical Architect, Observability, YAGNI, UX, Migration, Maintenance, Inventive Catalyst).

## Overview

LyricGlow already presents lyrics the way KaraFun does. What is missing is the "player" half of a karaoke machine: changing the key to fit the singer, playing several songs one after another with a title card between them, and switching the original singer's voice off with one tap. This brief turns the three requests into a bounded design that reuses what the app already has (a pitch-preserving tempo path, a centre-channel vocal reducer, count-in dots, section cards, a single engine clock) and adds only one genuinely new mechanism: a pitch shifter for local files.

**Ideal Final Result (from the Inventive Catalyst):** every new capability is either a mode of an existing part or costs nothing until used. The shifter is not in the audio graph at key 0. The queue holds file handles and lyrics, not decoded media. The thumb bar keeps five targets. The engine clock never changes, so lyrics never drift.

## Analysis

### What every lens agreed on

1. **Tempo is already done; only key is new.** Local-file tempo goes through `el.playbackRate`, which preserves pitch by default, and every lyric consumer reads the engine clock, so tempo changes already keep sync. The feature is "key" plus a Key row beside the existing Speed row (YAGNI #1, Architect #2, Migration #3).
2. **The shifter must never touch the clock or `playbackRate`.** It sits in the audio graph after the media element, works in the pitch domain only, and `engine.setRate` stays the single tempo authority (Architect #2, YAGNI #3, Migration #2).
3. **Key 0 must be a true bypass.** The worklet is not in the graph (or is a passthrough) so the default path is unchanged and has zero added latency; worklet load failure hides the Key control and leaves audio exactly as today (Migration #1, Inventive #1, Architect #1, Observability #1).
4. **Graph order:** media element → vocal chain → shifter (one worklet, both channels phase-locked) → analyser tap → destination. Cancelling the vocal first keeps the L−R maths intact; the mono detector stays on the raw source; the analyser sees what is heard (Architect #3, Inventive #2).
5. **Latency is a constant, not a drift.** Measure the shifter's fixed delay once and subtract it only while key ≠ 0, separately from the user's lyric-timing offset and mic latency (Architect #1, Migration #2, Inventive #1, Observability #2).
6. **Scoring, demo melody and guide hum must transpose with the key**, or a correct singer at key −2 is scored two semitones off. One shared `keyOffset` applied by PitchLane, scoring, DemoSynth and GuideSynth — an integer add on MIDI notes, no DSP (Architect #6, Inventive #7; Migration #8 and YAGNI #8 would instead disable them — rejected below).
7. **No sixth thumb target.** Five targets ≥ 44 px were verified at 320 px. Restart moves into the seek row (it is seek-to-zero) and Vocals takes its slot (UX #1, Inventive #4, YAGNI #5, Architect #7).
8. **Vocals is a view onto the one existing level, not a second state.** Off = 0, on = the last non-zero slider level (default 0.35). The More slider edits the same value. On mono files the switch is disabled with the existing "mono file" note; for YouTube, Listen and the demo it is hidden (or disabled with a one-line reason) (YAGNI #4, UX #3, Maintenance #7, Inventive #5).
9. **The queue needs a real "song" object and one owner.** Today `source` and `track` are separate React states mutated by eight handlers with ad-hoc cancellation refs, and the object URL is revoked in an effect cleanup. A queue grafted onto that is the classic stale-state bug. One `SongEntry` type, one `setCurrentSong` transition, and a store that owns File handles and creates/revokes URLs only on explicit enqueue/remove/advance (Maintenance #1–2, Architect #4, Observability #4, Inventive #3).
10. **The intro is a pre-roll phase, not a change to the track.** Title + artist in the cue slot in SectionCard style, the existing count-in dots as the countdown, `engine.play()` at zero, clock stays at 0. Skippable by one tap. It replaces the first line's count-in when the song starts at 0 so there is never a double countdown. YouTube and Listen get a card without countdown or delay, since the app cannot hold their start (YAGNI #7, UX #6, Inventive #6, Migration #8).
11. **Between songs, the grade screen's primary action becomes "Next: <title>"**, with "Sing again" secondary and "End set" third; the AudioContext stays open and the next song's start must work without a new gesture on iOS (UX #6, Architect #5).
12. **Ship in slices behind build-time flags, key last.** (a) Vocals switch, (b) SongEntry refactor with no visible change, (c) intro + flow state machine, (d) queue UI, (e) key shifter behind a device test. Each slice is independently revertible by redeploy (Migration #7, Architect #8, Maintenance order).
13. **Make it observable.** The key engine exposes a status readout; queue transitions and per-song applied settings are logged into an in-memory ring buffer; a "Download diagnostics" action under More exports it without lyrics, file names or audio (Observability #1–#6).

### Secondary trade-offs

- **Which shifter.** Options: (A) hand-written WSOLA/granular worklet (small, tunable, LGPL-free, lower quality on polyphonic music), (B) SoundTouchJS (MPL-2.0 `@soundtouchjs/audio-worklet` 2.1.1 is the maintained worklet package; the older `soundtouchjs` is LGPL-2.1 and 1.8 MB unpacked), (C) `preservesPitch = false` + `playbackRate = 2^(k/12)` (free, but couples tempo and pitch and fights the engine rate; rejected). The brief recommends (B) via the MPL-2.0 worklet package behind a thin `PitchShifter` interface (`setSemitones`, `latencySeconds`, `status`) so (A) can replace it later.
- **Delivery in PWA/Capacitor.** A worklet module must be emitted under `/assets/` (the SPA rewrite would otherwise serve HTML for a root path) and included in the service-worker precache; Capacitor iOS WKWebView is the riskiest platform and keeps the capability check.
- **Queue memory.** Cap at 8 entries; one shared media element with `src` swapped; `preload="metadata"` for non-current items; the queue is lost on reload by design (no storage allowed) and a leave-page warning is considered.
- **Per-song vs per-session settings.** Per-song: key, tempo, vocals on/off, lyric-timing offset (already on `track`). Per-session: guide level, difficulty, theme, motion, lyrics style. Key carries over to the next song by default (a singer's range is constant), tempo resets to 1.0 (song-specific); both are shown on the intro card and as a badge when non-default.
- **Autoplay policy.** Advancing from a `finished` event is not a user gesture. The design keeps one AudioContext alive and uses the same media element, which browsers allow to continue; this must be verified on iOS Safari and in the Capacitor shells before the queue ships by default there.

## Goals vs. Non-Goals

**In-scope goals**
- G1 Key change in semitones (±6) for local audio/video files, with transposed scoring, demo melody and guide hum; lyric sync within 30 ms at any key and tempo.
- G2 A Vocals switch on the thumb bar for local files, sharing state with the Voice slider; Restart moves to the seek row; five targets ≥ 44 px at 320 px.
- G3 A session queue of up to 8 songs (file + lyrics + per-song settings), with an intro card (title, artist, countdown) before each file-backed song, "Next" on the grade screen, and a queue list with move/remove buttons.
- G4 Everything behind build-time flags, shipped in slices, with fixtures for all pure logic and an in-repo browser flow for the three-song set.

**Out-of-scope non-goals**
- Key or vocals changes for YouTube and Listen sources (no audio access).
- Auto-matching lyrics for queued files (U9) — entries allow an optional track; matching can be a later enrichment.
- Drag-to-reorder, persistence across reloads, shared/party queues, more than 8 entries.
- Replacing the Voice slider; it stays as the fine control.
- A hand-written DSP shifter in this release (interface allows it later).

## Alternatives Weighed

- **`preservesPitch = false` + `playbackRate` for key** — Rejected by author: couples tempo and pitch, makes the engine rate differ from the user's tempo, and breaks the "clock never learns about key" rule (Architect #2, YAGNI #2–3).
- **Hand-written WSOLA worklet first** — Rejected by author for v1: largest piece of DSP work in the app's history with no quality baseline; kept as a later swap behind the `PitchShifter` interface.
- **Disable scoring/demo/guide when key ≠ 0** (Migration #8, YAGNI #8) — Rejected by author: transposition is an integer add on MIDI notes and the alternative punishes correct singers.
- **Sixth thumb-bar target or half-height stacked switches** — Rejected by author: fails the 320 px / 44 px check already verified in the QA audit.
- **Queue as a list of object URLs** — Rejected by author: multiple live URLs and decoded buffers on a phone; File handles are lazy and cheap.
- **Intro as a separate timer/overlay system** — Rejected by author: duplicates CountIn and SectionCard; a pre-roll phase in the session state machine reuses both.
- **Carry tempo across songs / reset key per song** — Rejected by author in favour of key carry-over + tempo reset, both visible on the intro card.

## Key Decisions & Staging for Next Steps

Resolved:
- D1 Scope item 1 = key only; tempo UI unchanged (Speed row stays for all sources).
- D2 Graph order and bypass rule as in Analysis #3–#5; `PitchShifter` interface; latency constant subtracted only at key ≠ 0.
- D3 One shared `keyOffset` consumed by PitchLane, scoring, DemoSynth, GuideSynth.
- D4 Vocals switch = view onto `vocalLevel`; Restart to the seek row.
- D5 `SongEntry` + `SongQueue` store (engine module + thin hook, KaraokeSession pattern) own source, track, per-song settings and URL lifecycle; App.tsx must not grow.
- D6 Intro = pre-roll phase in an explicit session state machine with a legal-transition table and fixtures; replaces the first count-in; skippable; no countdown for YouTube/Listen.
- D7 Slices behind `VITE_FEATURE_VOCALS_SWITCH`, `VITE_FEATURE_QUEUE`, `VITE_FEATURE_KEY`; native shells default off for KEY until device-tested.
- D8 Diagnostics ring buffer + download, no persistent storage, no lyrics/file names/audio in the export.

Decided by the author at G1b (2026-11-10):
- D9 Shifter library: MPL-2.0 `@soundtouchjs/audio-worklet` behind the `PitchShifter` interface.
- D10 Key carries over between songs in a set and is shown on the intro card; tempo resets to 1.0.
- D11 Restart becomes a ⏮ icon at the left end of the seek row (≥ 44 px); Vocals takes its thumb-bar slot.
- D12 Grade screen in a set waits for a tap; primary button "Next: <title>", then "Sing again", then "End set".
