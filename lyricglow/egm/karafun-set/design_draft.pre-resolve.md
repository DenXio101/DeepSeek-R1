# Finish the KaraFun set — key change, Vocals switch, intro card and song queue

*   **Author:** Dennis Valencia (repo owner; drafted by the session agent)
*   **Status:** Draft
*   **Date:** 2026-11-10
*   **Source of truth:** `concepts_brief.md` in this folder (decisions D1–D12), `feature_concept.md`, and the code under `lyricglow/src` at commit `c6c0951`.

--------------------------------------------------------------------------------

## Overview

LyricGlow is a browser karaoke stage (React 19, TypeScript, Vite, plain CSS; also an installable PWA and Capacitor shells). It already shows lyrics the KaraFun way. This design adds the "player" half of a karaoke machine for songs loaded as local files:

1. a **Vocals switch** on the thumb bar that mutes or restores the original singer with one tap,
2. a **key change** in semitones that transposes the backing track without changing tempo, and keeps the scoring, guide hum and demo melody in the same key,
3. a **song queue** with an **intro card** (title, artist, countdown) before each song and a "Next" button on the result screen.

The engine clock is never changed by any of these, so lyric sync is unaffected by construction. Everything ships in slices behind build-time flags so each slice can be reverted by a redeploy.

Plain-language glossary used below: *engine clock* = the single time source every lyric consumer reads (`PlaybackEngine.frame.time`); *vocal chain* = the existing centre-channel reducer in `AudioGraph`; *worklet* = a small audio program that runs on the browser's audio thread; *object URL* = a temporary browser address for a local file.

## The Problem

Users play a song from a local MP3/MP4 and want what a KaraFun machine gives them: the singer's voice off, the key lowered to fit their range, and a few songs lined up with a title card between them. Today the voice level is a slider buried under More, there is no key control at all, and the app knows one song at a time: `source` and `track` are separate React states in `App.tsx`, changed by eight different handlers, and the result screen only offers "Sing again" and "Close".

Proposed solution: add one new audio stage (a SoundTouch pitch-shifting worklet, present only when key ≠ 0), one new state owner (`SongQueue`, a plain TypeScript module with a thin hook, in the pattern of `KaraokeSession`) that holds songs, per-song settings and file lifetimes, one explicit session flow state machine (idle → intro → playing → finished → grade → advancing), and three small UI changes (Vocals switch, Restart moved into the seek row, Key stepper next to Speed).

## Goals

*   G1 Vocals: one tap on the thumb bar sets the original-vocal level to 0; a second tap restores the last non-zero level (default 0.35). The Voice slider under More edits the same value. On mono files the switch is disabled with the existing "mono file" note. Hidden for YouTube, Listen and the demo. Thumb bar keeps five targets ≥ 44 px at 320 px wide (verified by the existing layout script).
*   G2 Key: a stepper under More → "Key & speed" changes the key of a local file from −6 to +6 semitones. Tempo is unchanged by a key change. Lyric time stays within **30 ms** of the audible position at any key and at speeds 0.5×, 1× and 2× (measured as: the shifter's reported latency is a constant that is subtracted from the lyric clock only while key ≠ 0). Scoring, the pitch lane, the demo melody and the guide hum apply the same semitone offset. A key badge is visible on the stage whenever key ≠ 0.
*   G3 Queue: up to 8 songs (file + lyrics + per-song settings). Add flow: pick file → pick lyrics → queued. List with move-up, move-down, remove (44 px buttons). The result screen in a set shows "Next: <title>" as the primary button, then "Sing again", then "End set"; it waits for a tap. Key carries over between songs; tempo resets to 1×. The queue is lost on reload (no storage allowed) and the app says so.
*   G4 Intro: before each file-backed song, a card with title, artist, key (if ≠ 0) and a 3-beat countdown using the existing count-in dots; it replaces the first line's own count-in when the song starts at 0; one tap skips it; audio starts at the end of the countdown with the clock at 0. YouTube and Listen sources show the card with no countdown and no delay.
*   G5 Safety: key 0 is a true bypass (the worklet is not in the graph); worklet load failure or an unsupported browser hides the Key control and leaves audio exactly as today. With `VITE_FEATURE_QUEUE` off, every existing flow behaves exactly as today (same result screen, same object-URL handling).
*   G6 Verification: pure logic (queue operations, flow transitions, semitone ratio, transposition) has fixtures in `scripts/check-model.ts`; a browser flow "three songs, advance, key −2, vocals off" lives **in the repo** under `scripts/flows/` and runs against the dev server.

## Non-Goals

*   Key, tempo or vocal changes for YouTube or Listen sources (no audio access).
*   Auto-matching lyrics for queued files from the file name; queue entries allow an empty track ("no lyrics yet" state) so this can be added later as an enrichment.
*   Drag-to-reorder, persistence across reloads, shared/party queues, more than 8 entries, auto-advance timers.
*   Replacing the Voice slider or the Speed slider.
*   A hand-written DSP shifter (the `PitchShifter` interface allows one later).
*   Transposing a YouTube video's audio.

## Open Questions

*   **Q1 (device test)**: CPU headroom of the SoundTouch worklet on a mid-range Android phone (e.g. a 2022 A-series) with the vocal chain active. Design assumes it fits; Phase 5 includes a device run that measures worklet underruns via the diagnostics counter before the flag defaults on in production.
*   **Q2 (iOS autoplay)**: whether `media.play()` called from the queue's `advance()` (no fresh gesture) is allowed on iOS Safari and in the Capacitor WKWebView when the same `<audio>` element and a running AudioContext are reused. Design assumes yes (continuation of an already-started element is allowed); Phase 4 includes a device check, and the fallback is that the intro card's countdown waits for a tap on iOS.
*   **Q3 (latency value)**: the shifter's group delay. The SoundTouch worklet does not report latency. Phase 5 measures it with a click test (impulse through the chain vs. bypass, cross-correlated in a fixture run in a headless browser) and stores it as `SHIFTER_LATENCY_S`; expected 20–60 ms.

## Critical User Journeys (CUJs)

### CUJ 1: Vocals off with one tap

*   **Given**: a stereo MP3 is loaded as the backing track (source kind `file`), lyrics are loaded, `VITE_FEATURE_VOCALS_SWITCH` is on.
*   **When**: the user taps the Vocals switch on the thumb bar.
*   **Then**: the vocal level becomes 0 within one frame, the switch shows "Off" (text + knob position, not colour only), the Voice slider under More reads 0 %, and the stage lights keep following the music. A second tap restores 35 % (or the last slider value). On a mono file the switch is disabled with the note "Mono file — can't separate vocals".

### CUJ 2: Lower the key by two semitones

*   **Given**: a local file is playing at 1×, key 0, mic on, `VITE_FEATURE_KEY` on, the browser supports AudioWorklet.
*   **When**: the user opens More → Key & speed and taps "−" twice.
*   **Then**: the audio is two semitones lower at the same tempo; a "Key −2" badge appears on the stage; the pitch lane's target bars and the scoring targets are two semitones lower; the guide hum sounds two semitones lower; the lyric highlight stays within 30 ms of the audio. Tapping "Reset" returns to key 0 and removes the shifter from the graph.

### CUJ 3: A three-song set

*   **Given**: `VITE_FEATURE_QUEUE` on; the user has three MP3s and knows the song names.
*   **When**: the user opens Find song → Queue, taps "Add song", picks a file, picks the lyrics from the search results, repeats twice, then taps "Start set".
*   **Then**: an intro card shows "Song 1 of 3 · <title> — <artist>" with three countdown dots; the music starts when the dots run out (or earlier on a tap); at the end the result screen shows the grade with "Next: <title 2>"; tapping it shows the second intro card with "Key −2" if the user changed the key during song 1; after song 3 the result screen offers "Sing again" and "End set". Nothing is stored; a reload empties the queue and the Queue tab says so.

### CUJ 4: Worklet unavailable

*   **Given**: an older browser without AudioWorklet, or the worklet module fails to load.
*   **When**: the user opens More.
*   **Then**: the Key row shows "Key change is not available in this browser" and no stepper; audio plays exactly as today; the diagnostics log records the failure reason.

## Technical Plan (Architecture)

### Audio graph (local files)

```text
<audio>/<video> ──► MediaElementSource ──► VocalChain ──► [PitchShifter] ──► AnalyserTap ──► destination
                                             │ (L−R side + low bass;        (SoundTouchNode,
                                             │  mono detector reads here)    present only when key ≠ 0)
```

*   The element → source → vocal chain binding stays exactly as `AudioGraph.sourceFor()` builds it today (one source per element for the life of the document).
*   `AudioGraph` gains a named stage list per element: `chain.output → stages.shifter? → stages.analyserTap → destination`. A new method `setKey(el, semitones)` inserts the shifter on the first non-zero value (`chain.output.disconnect(destination); chain.output.connect(shifter); shifter.connect(tapInput)`) with a 30 ms gain crossfade, and removes it again at 0. The analyser tap is moved to after the shifter so lights follow what is heard.
*   `PitchShifter` is an interface in `src/engine/PitchShifter.ts`: `{ status, node, setSemitones(n), latencySeconds, dispose() }`. The only implementation in this release is `SoundTouchShifter` using `@soundtouchjs/audio-worklet` (MPL-2.0, 296 KB unpacked, ~60 KB processor file): `SoundTouchNode.register(ctx, processorUrl)` once, then `node.pitchSemitones.value = n`, `node.playbackRate.value = el.playbackRate` mirrored on every rate change, and `el.preservesPitch = false` **only while the shifter is in the graph** (restored to `true` on removal). The processor is imported with Vite's `?url` suffix so it is emitted under `/assets/` (the SPA rewrite in `vercel.json` excludes `/assets/`, and the service-worker precache glob already matches `**/*.js`).
*   Why `preservesPitch = false` while shifting: the SoundTouch processor expects the raw rate-changed signal and corrects pitch itself; with the browser's own correction on top the result would be double-corrected. At key 0 the node is absent and the browser's pitch-preserving rate change is used as today, so the default path is unchanged.
*   Tempo stays `engine.setRate()` → `el.playbackRate`. The shifter never changes the element's rate; it only mirrors it.
*   Latency: `SHIFTER_LATENCY_S` (measured in Phase 5, Q3) is exposed through `AudioGraph.outputLatencyFor(el)` = `SHIFTER_LATENCY_S` when the shifter is present, else 0. `KaraokeSession.onFrame` subtracts it from `t` (alongside `track.offset`) so the lyric highlight matches what is heard. The engine clock itself is untouched.

### Key offset for everything that reads MIDI notes

A single number `keyOffset` (semitones) lives on the current `SongEntry`. Consumers add it where they read a syllable's `note`:

*   `scoring.ts` → `scoreSyllable(syl, …, keyOffset)` compares `s.midi` to `syl.note + keyOffset`.
*   `PitchLane.tsx` draws target bars at `note + keyOffset`.
*   `DemoSynth.playNote` and `GuideSynth.playHum` use `midiToHz(note + keyOffset)`.
*   The demo track (no file) accepts a key change too (synthesized melody only); the Key stepper is enabled for the demo and local files, disabled with a reason for YouTube/Listen.

### Session flow state machine

`src/engine/SongFlow.ts` — a pure reducer with phases `idle | intro | playing | finished | grade | advancing` and events `start | skipIntro | countdownDone | mediaEnded | gradeShown | next | singAgain | endSet | sourceChanged | pause | seek`. The legal-transition table is the single source of truth (fixture-tested). `KaraokeSession` keeps publishing `finished`; `App` feeds `SongFlow` and renders the intro card while `phase === "intro"`. During `intro`, Play/Pause/Seek/Restart cancel the countdown (`skipIntro`) rather than fighting it.

The intro delay is implemented with the engine's existing before-play hook extended to a **play gate**: `PlaybackEngine.setPlayGate(fn: () => Promise<void> | void)`. `play()` still runs `onBeforePlay` synchronously (AudioContext resume inside the gesture), then awaits the gate, then starts the transport. The gate resolves when the countdown ends or the user taps the card. For YouTube and Listen sources the gate is not installed (card without countdown).

### Song queue

`src/engine/SongQueue.ts` — plain class with a snapshot for `useSyncExternalStore`, in the `KaraokeSession` pattern:

```ts
interface SongEntry { id: string; file: File | null; track: Track | null; settings: { key: number; rate: number; vocalLevel: number }; status: "queued" | "current" | "done" | "error"; error?: string }
class SongQueue { add(entry), remove(id), move(id, dir), start(), advance(), singAgain(), endSet(), setCurrentSettings(patch), snapshot }
```

*   Owns the File handles and the **one** live object URL: created in `start()`/`advance()` for the new current entry, revoked for the previous one in the same transition. No revocation in React effect cleanups once the flag is on. With the flag off, `App.tsx` keeps today's single-URL effect.
*   Cap: 8 entries; `add` beyond the cap returns `{ ok: false, reason }` and the UI shows "Queue is full (8 songs)".
*   `advance()` seeds the next entry's `key` from the current entry (D10) and sets `rate` to 1.0; `vocalLevel` carries over.
*   One transition `setCurrentSong(entry)` in `App` is the only code path that sets `source` and `track` together; `handleFileUpload`, `pickSynced`, `handleImportFile` and `applyStudioTrack` become callers of it (behaviour unchanged with the flag off: they produce a one-entry "queue").
*   Memory: one `<audio>/<video>` element is reused across the set (`MediaElement` keyed by a stable id, `src` swapped), so there is exactly one `MediaElementSource` and one vocal chain for the whole set. `preload="auto"` only for the current entry.

### UI

*   `ThumbBar`: slot 2 becomes `VocalsSwitch` (same markup pattern as `MicSwitch`: `role="switch"`, oblong, knob + "ON/OFF" text, caption "Vocals"/"Vocals off"); Restart becomes a 44 px ⏮ button at the start of `ProgressRow` (`btn-restart` keeps its testid). When Vocals does not apply (YouTube, Listen, none) the slot shows Restart again so nothing shifts.
*   `MoreSheet`: the "Speed" section becomes "Key & speed": a stepper row (`key-minus`, `key-value` "0" / "+2" / "−3", `key-plus`, `key-reset`, each ≥ 44 px, `aria-live` readout "Key plus 2 semitones") above the existing Speed slider; a one-line reason text when disabled.
*   Stage: `KeyBadge` in the toast stack ("Key −2", `key-badge`) when key ≠ 0.
*   `SongPanel`: a new top-level step "Queue" (only with the flag) listing entries with ⬆ ⬇ ✕ and "Add song" (file picker → lyrics search → add), "Start set", "Song N of M", a "lost on reload" note.
*   `IntroCard` in the cue slot (SectionCard styling): title, artist, "Song N of M", "Key −2" when ≠ 0, the count-in dots (`CountIn variant="dots"` reused with a synthetic 3-beat state driven by `SongFlow`), tap anywhere to skip; accessible name "Up next: <title>".
*   `GradeScreen`: `onNext?`, `onEndSet?`, `nextTitle?` props; primary becomes "Next: <title>" (auto-focused via the existing `useModalFocus`), then "Sing again", then "End set".
*   Diagnostics: `src/engine/Diagnostics.ts` ring buffer (200 events) with `log(kind, data)`; `AudioGraph`, `SongQueue`, `SongFlow` and the shifter log into it; More → Files & tools → "Download diagnostics" writes a JSON file (commit hash from `import.meta.env.VITE_COMMIT`, user agent, context sampleRate/state/latencies, shifter status, queue events, last errors; no lyrics, file names or audio).

### Feature flags

Build-time constants read once in `src/featureFlags.ts`: `VITE_FEATURE_VOCALS_SWITCH`, `VITE_FEATURE_KEY`, `VITE_FEATURE_QUEUE` (strings "1"/"0"; default "1" on the web build, `KEY` default "0" in `build:native` until Q1/Q2 are answered on devices). A URL parameter `?feature=key` overrides for testing in dev builds only (same mechanism as the existing `?listenEvery`).

## Alternatives Considered

### Alternative A: `preservesPitch = false` + `playbackRate = 2^(k/12)` for the key

*   **Pros**: no dependency, no worklet, zero CPU.
*   **Cons**: tempo moves with the key; the engine rate would differ from the user's tempo; fights the rate glide in `PlaybackEngine`.
*   **Reason for Rejection**: Rejected by author: violates the rule that the clock never learns about key (brief D2).

### Alternative B: Hand-written WSOLA/granular worklet

*   **Pros**: no dependency; smaller download; tunable for small shifts.
*   **Cons**: largest DSP work in the app's history with no quality baseline; two algorithms to maintain if a heavy one is added for big shifts.
*   **Reason for Rejection**: Rejected by author for this release; the `PitchShifter` interface keeps it possible later (brief D9).

### Alternative C: Disable scoring, demo and guide while key ≠ 0

*   **Pros**: no changes to scoring or synths.
*   **Cons**: a correct singer at key −2 is scored two semitones off, or loses scoring entirely.
*   **Reason for Rejection**: Rejected by author: transposition is an integer add on MIDI notes (brief D3).

### Alternative D: Queue as a list of object URLs with one element per song

*   **Pros**: simplest to write.
*   **Cons**: several live URLs and decoded buffers on a phone; one `MediaElementSource` + vocal chain per element leaks until GC; per-element state (key, level) drifts across songs.
*   **Reason for Rejection**: Rejected by author: File handles are lazy and one shared element keeps a single graph (brief D5).

### Alternative E: Intro as a separate overlay + timer system

*   **Pros**: no change to the session.
*   **Cons**: duplicates `CountIn` and `SectionCard`; produces two countdowns; cannot be cancelled by Pause/Seek cleanly.
*   **Reason for Rejection**: Rejected by author: a pre-roll phase in `SongFlow` reuses both and has a transition table (brief D6).

### Alternative F: Sixth thumb-bar target

*   **Reason for Rejection**: Rejected by author: fails the verified 320 px / 44 px layout (brief D4, D11).

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Performance**: no audio underruns for 10 minutes on the Q1 device with key −2, vocals off, mic on; the worklet reports its process-time EMA via its port at ~1 Hz into the diagnostics; if the EMA exceeds 70 % of the 128-frame quantum budget, the shifter auto-bypasses with a notice "Key change paused — this device can't keep up". Bundle growth ≤ 80 KB gzipped (SoundTouch worklet + node), loaded lazily on the first non-zero key.
*   **Latency**: shifter latency compensated as a constant (G2 tolerance 30 ms).
*   **Memory**: one media element for the whole set; ≤ 8 entries; File handles only.
*   **Security & privacy**: no persistent storage; diagnostics export contains no lyrics, file names or audio; the worklet is first-party hosted under `/assets/`.
*   **Rollout & rollback**: each slice behind its flag; rollback = flip the flag and redeploy (Vercel instant rollback also works); native shells keep `KEY` off until device-tested. `registerType: 'autoUpdate'` means the web picks up the change on next load.

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Worklet CPU overrun on low-end phones (Q1) | Medium | Audible glitches | Lazy insert only at key ≠ 0; process-time counter with auto-bypass + notice; `KEY` flag off in native shells until measured |
| Shifter latency mis-measured → lyrics early/late at key ≠ 0 (Q3) | Medium | Sync off by 20–60 ms | Measured constant + fixture; Tap to sync still available; key 0 path unchanged |
| `preservesPitch` toggling double-shifts or is unsupported (old Safari uses `webkitPreservesPitch`) | Low | Wrong pitch at key ≠ 0 | Set both properties; capability check hides Key when the worklet cannot register; browser matrix in Phase 5 |
| Vocal leaks when the shifter runs before the chain | — | — | Not possible: order fixed chain → shifter; residual-vocal fixture at key 0 and −2 |
| iOS blocks `play()` on advance without a gesture (Q2) | Medium | Set stalls after song 1 on iPhone | Same element + running context; device check in Phase 4; fallback: countdown waits for a tap on iOS |
| Stale File handle (user deleted the file) | Low | Song fails to load | `media_error` → entry `status: "error"` with a note; queue advances on "Next" |
| Worklet file not served (rewrite/precache) | Low | Key silently unavailable | `?url` import under `/assets/`; build check that `dist/assets/soundtouch-processor-*.js` exists and is in the precache manifest |
| `App.tsx` grows past 1000 lines | High without refactor | Maintainability | `SongQueue`, `SongFlow`, `Diagnostics` are engine modules; App must be net-neutral or shorter (checked in Phase 2 gate) |
| Playwright flows outside the repo rot | High | No regression gate | Phase 0 moves the needed flows into `scripts/flows/` |

### Tolerances

| Quantity | Tolerance | How checked |
|---|---|---|
| Lyric time vs audible position at key ≠ 0 | ≤ 30 ms | fixture using `SHIFTER_LATENCY_S`; flow test asserts highlight vs analyser onset |
| Lyric time at key 0 | unchanged (0 ms added) | shifter absent; existing verify flows |
| Key 0 analyser levels vs today | ≤ 0.5 dB | flow test compares `--energy` before/after the change |
| Residual vocal after chain at key −2 vs key 0 | ≤ 3 dB difference | fixture on a synthetic centre tone |
| Semitone ratio | 2^(n/12) ± 1e-9 | fixture |
| Thumb-bar targets | ≥ 44 px, five targets at 320 px | existing `verify-layout` flow |
| Worklet process time | ≤ 70 % of quantum (auto-bypass above) | diagnostics counter |
| Intro countdown | 3 beats of the track's BPM (fallback 90 bpm), skippable ≤ 100 ms after tap | flow test |
| Queue size | ≤ 8 entries | fixture |

--------------------------------------------------------------------------------

### Additional Resources

*   `concepts_brief.md`, `feature_concept.md`, `lenses/*.md` (this folder)
*   `lyricglow/docs/qa-audit-2026-10-18.md` (layout and target-size baseline)
*   `@soundtouchjs/audio-worklet` README (register, `pitchSemitones`, `playbackRate` mirror, `preservesPitch = false`)

### Future Improvements

*   **Lyrics auto-match for queued files**: fill `SongEntry.track` from LRCLIB using the file name as a background enrichment.
*   **Hand-written shifter**: replace `SoundTouchShifter` behind `PitchShifter` for smaller downloads.
*   **Apply key to all**: one tap in the queue list.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Conventions: repo root for paths is `lyricglow/`. Every phase ends with the gate `npx tsc -b && npx eslint . && npm run build && npm run check:model && node scripts/flows/<flow>.mjs` (flows run against `VITE_YT_API_KEY=testkey-ABC123 npx vite --port 5173 --strictPort`). Commit after each green phase. No file outside the lists below is modified in that phase.

### Step −1: Confirm the newest source
*   `git fetch origin claude/lyricglow-karaoke-app-ugIUj && git status` → HEAD must be `c6c0951` or a descendant with a clean tree; `npm ci`; run the full gate once to record the baseline.

### Step 0: Baseline and backup
*   `git branch backup/pre-karafun-set` at HEAD.
*   Copy the scratchpad flows `verify-layout.mjs`, `verify-karafun.mjs`, `verify-phase2.mjs`, `verify-vocal-yt.mjs`, `verify-mic.mjs`, `verify-guide.mjs`, `probe-clock.mjs` into `scripts/flows/` (paths rewritten to `scripts/flows/fixtures/` for `beat.wav`, `stereo.wav`, `mic220.wav`, which are copied too). Add `npm run flows` that runs them in sequence. Record their output as `scripts/flows/BASELINE.md`.
*   Add `scripts/flows/README.md` (how to start the dev server, flags used).

### Phase 1 — Vocals switch + Restart to the seek row (flag `VITE_FEATURE_VOCALS_SWITCH`)

#### 1. `src/featureFlags.ts` (Create)
*   **Type / Scope**: TypeScript module.
*   **Proposed Changes**: `export const FLAGS = { vocalsSwitch: read("VITE_FEATURE_VOCALS_SWITCH", true), key: read("VITE_FEATURE_KEY", true), queue: read("VITE_FEATURE_QUEUE", true) }` where `read(name, def)` returns `import.meta.env[name] === "0" ? false : import.meta.env[name] === "1" ? true : def`, and in `import.meta.env.DEV` a `?feature=key,queue` / `?nofeature=…` query overrides.

#### 2. `src/components/VocalsSwitch.tsx` (Create)
*   **Proposed Changes**: props `{ on: boolean; disabledReason: string | null; onToggle(): void }`. Markup mirrors `MicSwitch` (`role="switch"`, `aria-checked`, knob with an `IconVoice` (new icon in `Icons.tsx`: a head/singer glyph), "ON/OFF" text, caption "Vocals" / "Vocals off"; when `disabledReason` is set: `disabled`, `aria-disabled`, caption shows the reason). `data-testid="vocals-toggle"`, state readout `data-testid="vocals-state"` with values `on | off | unavailable`.

#### 3. `src/components/ThumbBar.tsx` (Modify)
*   **Proposed Changes**: new props `vocals: { on: boolean; disabledReason: string | null } | null`, `onToggleVocals`. When `vocals` is non-null render `VocalsSwitch` in slot 2; otherwise render the Restart item as today. Pass `showRestart={vocals !== null}` to `ProgressRow`.

#### 4. `src/components/ProgressRow.tsx` (Modify)
*   **Proposed Changes**: prop `showRestart?: boolean`; when true render `<button className="seek-restart" data-testid="btn-restart" aria-label="Restart" onClick={() => engine.restart()}><IconRestart/></button>` before the current-time label. The testid `btn-restart` therefore exists in exactly one place at a time.

#### 5. `src/App.tsx` (Modify)
*   **Proposed Changes**: replace `const [vocalLevel, setVocalLevel] = useState(0.35)` with `const [vocalLevel, setVocalLevel] = useState(0.35); const lastVocalLevel = useRef(0.35);` and `const toggleVocals = () => setVocalLevel(v => { if (v > 0) { lastVocalLevel.current = v; return 0; } return lastVocalLevel.current || 0.35; })`; `setVocalLevel` from the slider also updates `lastVocalLevel` when > 0. Compute `vocals = FLAGS.vocalsSwitch && media && playback.sourceKind === "media" ? { on: vocalLevel > 0, disabledReason: vocalMono ? "Mono file" : null } : null`. Add hotkey `v` → `toggleVocals` when `vocals` is non-null.

#### 6. `src/styles.css` (Modify)
*   **Proposed Changes**: `.vocals-switch*` rules cloned from `.mic-switch*` with the gold accent (`--gold`, `--gold-glow`) for the on state; `.seek-restart { width: 44px; height: 44px; border-radius: 50%; … }` inside `.progress-row`; landscape (`max-height: 520px`) keeps the row within 56 px.

#### 7. `scripts/flows/verify-vocals.mjs` (Create)
*   **Proposed Changes**: stereo file → `vocals-state` on, tap → off and `vocal-level` reads 0, tap → on reads 35; slider to 60 then toggle off/on → 60; mono file → `unavailable` with the caption "Mono file"; YouTube mock → slot shows `btn-restart`, no `vocals-toggle`; five thumb targets ≥ 44 px at 320 px; `btn-restart` in the seek row works (seek value resets to 0).

#### 8. `README.md` (Modify) — Vocals row.

**Gate**: full gate + `verify-vocals.mjs` + `verify-layout.mjs` + `verify-mic.mjs`.

### Phase 2 — SongEntry / SongQueue / SongFlow refactor with no visible change (no flag; behaviour-preserving)

#### 9. `src/engine/SongQueue.ts` (Create)
*   **Proposed Changes**: as in the architecture section. Pure methods take and return snapshots; `createObjectURL`/`revokeObjectURL` go through an injected `urlFactory` so fixtures can count calls. Snapshot: `{ entries: SongEntry[]; currentId: string | null; cap: 8 }`. Exports pure helpers `addEntry`, `removeEntry`, `moveEntry`, `advanceIndex`, `seedSettings(prev, next)` for fixtures.

#### 10. `src/engine/SongFlow.ts` (Create)
*   **Proposed Changes**: `type Phase = "idle" | "intro" | "playing" | "finished" | "grade" | "advancing"`; `reduce(state, event): state` with the transition table:
    idle —start→ intro (file source with queue) | playing (otherwise); intro —skipIntro|countdownDone→ playing; intro —pause|seek|sourceChanged→ idle; playing —mediaEnded→ finished; finished —gradeShown→ grade; grade —next→ advancing; grade —singAgain→ playing; grade —endSet→ idle; advancing —start→ intro; any —sourceChanged→ idle. Illegal events are ignored (state unchanged) and logged to diagnostics.

#### 11. `src/engine/Diagnostics.ts` (Create)
*   **Proposed Changes**: `log(kind: string, data?: Record<string, unknown>)` into a 200-entry ring; `snapshot()`; `exportJson(meta)`.

#### 12. `src/engine/PlaybackEngine.ts` (Modify)
*   **Proposed Changes**: add `setPlayGate(fn: (() => Promise<void> | void) | null)`; `play()` becomes: `if (ended) seek(0); onBeforePlay?.(); const gate = this.playGate; if (gate) { this.pendingPlay = ++this.playToken; void Promise.resolve(gate()).then(() => { if (this.pendingPlay === token) this.startTransport(); }); } else this.startTransport();` where `startTransport()` is today's body after `onBeforePlay`. `pause()`/`seek()` bump `playToken` so a cancelled gate does not start playback. Snapshot gains `gated: boolean`.

#### 13. `src/hooks/useSongQueue.ts` (Create)
*   **Proposed Changes**: `useSyncExternalStore` over a `SongQueue` instance; returns `{ queue, snapshot, current }`.

#### 14. `src/App.tsx` (Modify)
*   **Proposed Changes**: introduce `setCurrentSong(entry)`; `handleFileUpload`, `pickSynced`, `handleImportFile`, `applyStudioTrack`, `clearSource` call it (a file upload creates a one-entry queue with `status: "current"`; a lyrics load updates `current.track`). The object-URL effect is deleted; `SongQueue` owns the URL. `MediaElement` is rendered with `key="backing"` and `src={current.url}` so the element is reused. Net line count of `App.tsx` must not exceed 719.

#### 15. `src/components/MediaElement.tsx` (Modify)
*   **Proposed Changes**: when `src` changes on the same element: `el.src = src; el.load()`; `engine.attachMedia(el)` only once per element.

#### 16. `scripts/check-model.ts` (Modify)
*   **Proposed Changes**: fixtures: `addEntry` respects the cap (9th returns `{ok:false}`); `removeEntry` of current advances; `moveEntry` bounds; `advanceIndex` + `seedSettings` carries key, resets rate to 1, carries vocalLevel; every `SongFlow` transition in the table and three illegal ones; `PlaybackEngine` play gate: play with a pending gate does not start the transport until resolved, and pause before resolution cancels it.

**Gate**: full gate + all Phase 0 flows unchanged (compare with `BASELINE.md`).

### Phase 3 — Intro card and flow (flag `VITE_FEATURE_QUEUE` gates the card for single songs too)

#### 17. `src/components/IntroCard.tsx` (Create)
*   **Proposed Changes**: props `{ title, artist, index, total, keyOffset, beats: number, onSkip }`; renders in the cue slot with `SectionCard` styling + `CountIn variant="dots"` fed from a local 3-beat countdown driven by `setInterval(60/bpm)`; `role="status"`, `aria-label="Up next: <title>"`, `data-testid="intro-card"`, `intro-countdown` readout; a full-stage transparent button `intro-skip` ("Skip intro").

#### 18. `src/App.tsx` (Modify)
*   **Proposed Changes**: `SongFlow` state via `useReducer`; install `engine.setPlayGate` while `phase === "intro"` and the source is a file (gate resolves on `countdownDone` or `skipIntro`); render `IntroCard` in `.cue-slot` during `intro`; suppress `CountIn` while the intro is shown (the first line's count-in is replaced, per D6); YouTube/Listen: card without countdown and no gate.

#### 19. `scripts/flows/verify-intro.mjs` (Create)
*   **Proposed Changes**: file + lyrics → Play → `intro-card` visible, audio element still paused, seek bar at 0 → after 3 beats audio plays and `intro-card` gone; Play again → tap `intro-skip` → plays within 100 ms; Pause during intro cancels (no play after the countdown); YouTube mock → card shown, player started immediately.

**Gate**: full gate + `verify-intro.mjs` + Phase 0 flows.

### Phase 4 — Queue UI and set flow (flag `VITE_FEATURE_QUEUE`)

#### 20. `src/components/QueuePanel.tsx` (Create)
*   **Proposed Changes**: rendered as the first section of `SongPanel` when the flag is on: list (`queue-item-i`, `queue-up-i`, `queue-down-i`, `queue-remove-i`), "Add song" (`queue-add`: opens the file picker, then focuses the lyrics search with a "for: <file name>" caption; the next `Use` adds the entry), "Start set" (`queue-start`), "Song N of M" (`queue-position`), a note "Your queue lives in this tab only — reloading clears it", a full-queue message.

#### 21. `src/components/GradeScreen.tsx` (Modify)
*   **Proposed Changes**: props `nextTitle?: string; onNext?: () => void; onEndSet?: () => void`; buttons: `btn-next` (primary, auto-focus) when `nextTitle`, `btn-sing-again`, `btn-end-set`.

#### 22. `src/App.tsx` (Modify)
*   **Proposed Changes**: wire `queue.advance()` → `setCurrentSong(next)` → `flow start` (intro); `singAgain` → `queue.singAgain()`; `endSet` → `queue.endSet()` (keeps the last song loaded). Media `error` event → `entry.status = "error"` + notice.

#### 23. `scripts/flows/verify-queue.mjs` (Create)
*   **Proposed Changes**: add three songs (mocked LRCLIB) → positions, move/remove, cap at 8 (message), Start set → intro 1 → simulate end (seek to end) → `btn-next` reads "Next: <title 2>" → tap → intro 2 shows "Key −2" after setting key −2 on song 1 (Phase 5 flag on) → … → after song 3 `btn-end-set`; only one `<audio>` element exists throughout; `URL.revokeObjectURL` called exactly once per advance (stubbed).

**Gate**: full gate + `verify-queue.mjs` + `verify-intro.mjs` + Phase 0 flows. **Device check (Q2)** on an iPhone (PWA) before the flag defaults on in `build:native`.

### Phase 5 — Key change (flag `VITE_FEATURE_KEY`)

#### 24. `package.json` (Modify) — add `@soundtouchjs/audio-worklet@^2.1.1` (MPL-2.0; add a `THIRD_PARTY.md` note).

#### 25. `src/engine/PitchShifter.ts` (Create)
*   **Proposed Changes**: interface `{ status: "idle"|"loading"|"active"|"bypassed"|"failed"; reason?: string; node: AudioNode | null; setSemitones(n: number): void; setRate(r: number): void; latencySeconds: number; dispose(): void }`; `SoundTouchShifter` implementing it with `import processorUrl from "@soundtouchjs/audio-worklet/processor?url"`, `SoundTouchNode.register(ctx, processorUrl)` once per context (cached promise), `node.pitchSemitones.value`, `node.playbackRate.value`; process-time EMA read from the node's port message if provided, else measured via `ctx.currentTime` drift; `latencySeconds = SHIFTER_LATENCY_S`.

#### 26. `src/engine/AudioGraph.ts` (Modify)
*   **Proposed Changes**: per-element `stages` record; `setKey(el, semitones): Promise<void>` inserts/removes the shifter with a 30 ms crossfade and moves the analyser tap after it; sets `el.preservesPitch = el.webkitPreservesPitch = false` while present, `true` on removal; `mirrorRate(el, r)` called from `App` on every rate change; `outputLatencyFor(el)`; `keyStatus(el)`; every catch logs to `Diagnostics`.

#### 27. `src/engine/KaraokeSession.ts` (Modify) — `setLatency(s)`; `onFrame` uses `t = f.time + offset − latency`.
#### 28. `src/engine/scoring.ts` (Modify) — `scoreSyllable(..., keyOffset = 0)`; `pitchClassDistance(s.midi, syl.note + keyOffset)`; fixture.
#### 29. `src/components/PitchLane.tsx`, `src/engine/DemoSynth.ts`, `src/engine/GuideSynth.ts` (Modify) — `keyOffset` prop/setter; `note + keyOffset`.
#### 30. `src/components/MoreSheet.tsx` (Modify) — "Key & speed" section with the stepper (`key-minus`, `key-value`, `key-plus`, `key-reset`), disabled reason text; `src/components/KeyBadge.tsx` (Create) in the toast stack.
#### 31. `src/App.tsx` (Modify) — `keyOffset` from `current.settings.key`; `graph.setKey(el, key)` + `graph.mirrorRate` on rate change; `session.setLatency(graph.outputLatencyFor(el))`; hotkeys `-`/`=` for key.
#### 32. `scripts/check-model.ts` (Modify) — `semitoneRatio(n) = 2^(n/12)`; transposition in `scoreSyllable`; latency subtraction in a synthetic session frame.
#### 33. `scripts/flows/verify-key.mjs` (Create)
*   **Proposed Changes**: stereo file → key −2 → `key-value` "−2", `key-badge` visible, `audio.preservesPitch === false`, a SoundTouch worklet node exists in the graph (exposed via `window.__lg.keyStatus` in dev), analyser `--energy` still > 0, pitch lane bars shifted (DOM attribute `data-note` on bars), guide hum notes two semitones lower (`data-guide-hz` readout); key 0 → node removed, `preservesPitch === true`, `--energy` within 0.5 dB of the Phase 0 baseline; rate 2× with key −2 → lyric highlight vs `audio.currentTime` drift ≤ 30 ms over 10 s; worklet registration forced to fail (route the processor URL to 404) → Key row shows the reason, audio plays.
#### 34. `scripts/measure-latency.mjs` (Create) — headless Chromium: plays a synthetic click through chain+shifter and chain only, cross-correlates the analyser time-domain output, prints the delay; the result is pasted into `SHIFTER_LATENCY_S` with a comment.
#### 35. `vite.config.ts` (Modify) — assert in a small plugin that the emitted processor chunk is under `assets/`; `README.md`, `docs/mobile-apps.md` — Key row, flag notes, device-test checklist.

**Gate**: full gate + `verify-key.mjs` + `verify-queue.mjs` + Phase 0 flows; `measure-latency.mjs` run once; **device check (Q1)** on the target phone before `VITE_FEATURE_KEY` defaults on in `build:native`.

### Verification Plan

*   **Compilation/Build**: `npx tsc -b && npm run build` (plus `npm run build:native` in Phase 5 to confirm the worklet chunk is present).
*   **Unit/fixtures**: `npm run check:model` (new sections: song queue, song flow, play gate, semitone/transposition, latency subtraction).
*   **Static analysis**: `npx eslint .`.
*   **E2E**: `npm run flows` (Phase 0 baseline flows + `verify-vocals`, `verify-intro`, `verify-queue`, `verify-key`) against the dev server; all mocks local.
*   **Manual device checks**: Q1 (Android mid-range, 10 min at key −2), Q2 (iPhone PWA advance without gesture); results recorded in `docs/mobile-apps.md`.
*   **Production**: deploy to Vercel production only after the owner's go-ahead; confirm `lyricglow.vercel.app` serves the new bundle and `/assets/soundtouch-processor-*.js` returns JavaScript.

--------------------------------------------------------------------------------

*Drafted with EGM*
