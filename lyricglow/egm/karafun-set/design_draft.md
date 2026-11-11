# Finish the KaraFun set — Vocals switch, key change, song set with intro card

*   **Author:** Dennis Valencia (repo owner; drafted by the session agent)
*   **Status:** Approved for build (resolved after Goldfish review, 2026-11-11)
*   **Date:** 2026-11-11
*   **Source of truth:** this document. `concepts_brief.md` and `feature_concept.md` in this folder are background; the decisions they record are restated here. Code references are to `lyricglow/src` at commit `c6c0951`.

--------------------------------------------------------------------------------

## Overview

LyricGlow is a browser karaoke stage (React 19, TypeScript, Vite, plain CSS; also an installable PWA and Capacitor shells). It already shows lyrics the KaraFun way. This design adds the "player" half of a karaoke machine for songs loaded as local files, in three independent slices that ship in this order:

1. a **Vocals switch** on the thumb bar that mutes or restores the original singer with one tap;
2. a **key change** in semitones that transposes the backing track without changing tempo, keeping the scoring, guide hum and demo melody in the same key — behind a single build flag and gated by a spike with a stated exit;
3. a **song set**: up to eight local files lined up with their lyrics, an **intro card** (title, artist, countdown) before each, and a "Next" button on the result screen.

The engine clock is never changed by any of these. The one place the compensated lyric time is computed (`lyricTime`) is shared by every reader, so a key change moves every consumer together.

Glossary: *engine clock* = the single time source every lyric consumer reads (`PlaybackEngine.frame.time`); *vocal chain* = the existing centre-channel reducer in `AudioGraph`; *worklet* = a small audio program that runs on the browser's audio thread; *object URL* = a temporary browser address for a local file; *thumb bar* = the bottom control row (`ThumbBar.tsx`: seek row above five targets); *cue slot* = the area above the lyrics where `CountIn` and `SectionCard` render; *toast stack* = the stacked notices at the top of the stage; *source kind* = `BackingSource.kind` in `App.tsx`: `none` (demo), `file`, `youtube`, `listen`; *set* = the queue of songs for one session.

## The Problem

Users play a song from a local MP3/MP4 and want what a KaraFun machine gives them: the singer's voice off, the key lowered to fit their range, and a few songs lined up with a title card between them. Today the voice level is a slider under More, there is no key control at all, and the app knows one song at a time: `source` and `track` are separate React states in `App.tsx` (lines 90 and 70), the result screen only offers "Sing again" and "Close".

Proposed solution, smallest shape that works:

*   **Vocals**: a switch that writes 0 or the last non-zero value into the existing `vocalLevel` state. Restart moves into the seek row so the thumb bar keeps five targets.
*   **Key**: one new audio stage, the SoundTouch pitch-shifting worklet, inserted after the vocal chain only while key ≠ 0. The key lives in App state beside `vocalLevel`. The shifter's fixed delay is written into the engine frame and subtracted by one shared helper. Transposition is a settable offset on the timeline that every note reader calls.
*   **Set + intro**: one hook (`useSongSet`) that owns the entries, the current index and the one live object URL; one boolean (`introActive`) in App for the intro card; the card calls the existing `engine.play()` when its countdown ends.

## Goals

*   **G1 Vocals**: one tap on the thumb bar sets the original-vocal level to 0; a second tap restores the last non-zero level (default 0.35). The Voice slider under More edits the same value. The switch is enabled for local stereo files; disabled with the one string "Mono file — can't separate vocals" when the mono verdict is positive; disabled with "Local files only" for YouTube, Listen and the demo. The thumb bar keeps five targets ≥ 44 px at 320 px wide (checked by the layout flow).
*   **G2 Key**: a stepper under More changes the key of a local file from −6 to +6 semitones with tempo unchanged. The lyric highlight stays within **30 ms** of the audible position at any key and at speeds 0.5×, 1× and 2× (the residual after the measured shifter delay is subtracted; unconfirmed until Q3 is measured). Scoring, the pitch lane, the demo melody and the guide hum read the same semitone offset through one accessor. A small "Key −2" pill is visible whenever key ≠ 0. The demo track accepts a key change (synth only, no worklet).
*   **G3 Set**: up to 8 songs (local file + lyrics). Add flow: pick file → pick lyrics → added. List with remove (44 px). The result screen in a set shows "Next: <title>" as the primary button, then "Sing again", then "End set"; it waits for a tap. Key and vocal level carry over between songs (they are session state); tempo resets to 1×. The set is lost on reload (no storage allowed) and the panel says so.
*   **G4 Intro**: when a set is started or advanced, a card with title, artist, "Song N of M", the key if ≠ 0, and a three-beat countdown using the existing count-in dots; audio starts at the end of the countdown with the clock at 0; one tap skips it; the first line's own count-in is suppressed for that start so there is never a double countdown. A single file played outside a set never shows the card.
*   **G5 Safety**: with `VITE_FEATURE_KEY` off (the default on web and native until Q1 and Q3 are measured) the audio path — graph topology, `preservesPitch`, the clock — is identical to today. With the flag on, key 0 is a true bypass (the worklet is not in the graph); worklet load failure or an unsupported browser shows a reason in the Key row and leaves audio exactly as today.
*   **G6 Verification**: pure logic (set operations, transposition accessor, `lyricTime`, semitone ratio) has fixtures in `scripts/check-model.ts`; the browser flows live **in the repo** under `scripts/flows/` and run against the dev server; a three-song set flow and a key flow are added.

## Non-Goals

*   Key or vocal changes for YouTube or Listen sources (no audio access), and YouTube or Listen entries in a set (sets are local files only).
*   Auto-matching lyrics for set entries from the file name; entries allow an empty track ("no lyrics yet") so this can be added later.
*   Drag-to-reorder, move-up/move-down buttons (remove and re-add covers 8 entries), persistence across reloads, shared/party sets, more than 8 entries, auto-advance timers.
*   Replacing the Voice slider or the Speed slider.
*   A hand-written DSP shifter, an abstract shifter interface, in-worklet CPU auto-bypass, a diagnostics module or export, new hotkeys.

## Open Questions

*   **Q1 (device CPU)**: CPU headroom of the SoundTouch worklet on the owner's Android phone with the vocal chain active. The owner has the phone; the check is 10 minutes at key −2, vocals off, mic on, listening for dropouts. Until it passes, `VITE_FEATURE_KEY` stays off in production and in `build:native`.
*   **Q2 (iOS autoplay on advance)**: whether `play()` from the intro card's timer is allowed on iOS Safari and in the Capacitor WKWebView after the element was primed inside the "Start set"/"Next" tap. The owner has an iPhone; the check is in Phase 4. Fallback if `play()` rejects: the card switches to "Tap to start" and waits.
*   **Q3 (latency value)**: the shifter's group delay. The worklet does not report latency. The Phase 2 spike measures it with a click test at 0.5×, 1× and 2×; if the spread across rates exceeds 10 ms the value is stored per rate, otherwise as one constant. The owner accepted the 30 ms tolerance pending this measurement.

## Critical User Journeys (CUJs)

### CUJ 1: Vocals off with one tap

*   **Given**: a stereo MP3 is loaded as the backing track (source kind `file`) and lyrics are loaded.
*   **When**: the user taps the Vocals switch on the thumb bar.
*   **Then**: the vocal level becomes 0 within one frame, the switch shows "OFF" (text + knob position, not colour only), the Voice slider under More reads 0 %, the stage lights keep following the music. A second tap restores 35 % (or the last slider value). On a mono file the switch is disabled with "Mono file — can't separate vocals".

### CUJ 2: Lower the key by two semitones

*   **Given**: a local file is playing at 1×, key 0, mic on, the build has `VITE_FEATURE_KEY=1`, the browser supports AudioWorklet.
*   **When**: the user opens More → Key and taps "−" twice.
*   **Then**: the audio is two semitones lower at the same tempo; the Key row reads "−2 · on"; a "Key −2" pill shows on the stage; the pitch lane's target bars, the scoring targets and the guide hum are two semitones lower; the lyric highlight stays within 30 ms of the audio. Tapping "0" returns to key 0 and removes the shifter from the graph.

### CUJ 3: A three-song set

*   **Given**: the user has three MP3s and knows the song names.
*   **When**: the user opens Find song → Set, taps "Add song", picks a file, picks the lyrics from the search results, repeats twice, then taps "Start set".
*   **Then**: an intro card shows "Song 1 of 3 · <title> — <artist>" with three countdown dots; the music starts when the dots run out (or earlier on a tap); at the end the result screen shows the grade with "Next: <title 2>" focused; tapping it shows the second intro card with "Key −2" if the key was changed during song 1; after song 3 the result screen offers "Sing again" and "End set". A reload empties the set and the Set section says so.

### CUJ 4: Worklet unavailable

*   **Given**: the flag is on but the browser has no AudioWorklet, or the processor file fails to load.
*   **When**: the user opens More.
*   **Then**: the Key row reads "Key change isn't available in this browser" and the stepper is disabled; audio plays exactly as today.

## Technical Plan (Architecture)

### Audio graph (local files)

Today (`AudioGraph.sourceFor`, `attachMedia`, `useSource`):

```text
<audio>/<video> ─► MediaElementSource ─► VocalChain ─► chain.output ─► destination
                                                           └─► analyser (side branch, lights only)
```

With `VITE_FEATURE_KEY=1` and key ≠ 0 (`AudioGraph.setKey(el, n)`):

```text
<audio>/<video> ─► MediaElementSource ─► VocalChain ─► chain.output ─► SoundTouchNode ─► destination
                                                                              └─► analyser (side branch)
```

*   Insert: `chain.output.disconnect(destination)`; `chain.output.connect(shifter)`; `shifter.connect(destination)`; the analyser's input is re-pointed to the shifter so the lights follow what is heard. Remove at key 0: the reverse, then the node is kept for reuse (no re-registration). The element → source → vocal chain binding stays exactly as built today (one source per element for the life of the document; the mono detector keeps reading the raw source).
*   Library: `@soundtouchjs/audio-worklet` 2.1.1 (MPL-2.0; checked on the registry 2026-11-11: node 5.8 KB, processor 72.9 KB raw / 16.9 KB gzipped; depends on `@soundtouchjs/core`). Its README documents exactly this topology: a `MediaElementSource` connected to a `SoundTouchNode`, `el.preservesPitch = false`, `el.playbackRate` mirrored into `node.playbackRate.value` ("the processor automatically compensates pitch"), `node.pitchSemitones.value` for the key.
*   `src/engine/SoundTouchShifter.ts` (concrete class, no interface): `load(ctx)` lazily `import()`s the node module and registers the processor once per context (the processor is imported with Vite's `?url` suffix so it is emitted under `/assets/`; the SPA rewrite excludes `/assets/`; the PWA precache glob `**/*.js` includes it, which is the decision: 17 KB once at install so Key works offline); `status: "idle" | "loading" | "on" | "unavailable"` with a reason; `setSemitones(n)`; `setRate(r)` (mirror); `node`.
*   `el.preservesPitch` (and `webkitPreservesPitch` on older Safari) is `false` only while the shifter is in the graph and is restored to `true` on removal; at key 0 the browser's own pitch-preserving rate change is used as today.
*   Tempo stays `engine.setRate()` → `el.playbackRate`; App mirrors every rate change into the shifter. The shifter never changes the element's rate.
*   Graph changes are made with a 30 ms gain crossfade on `chain.output` to avoid clicks.

### Latency compensation (one place)

*   `PlaybackEngine.setOutputLatency(seconds)` stores the shifter delay (wall seconds; 0 when the shifter is absent). Each frame the engine writes `frame.lead = latency × frame.rate` (song seconds).
*   `model/timeline.ts` exports `lyricTime(frame, track) = frame.time − frame.lead + (track.offset ?? 0)`. Every reader that computes `f.time + offset` today uses it: `Karaoke.tsx:225`, `SpectrumCanvas.tsx:53`, `PitchLane.tsx:55`, `GuideSynth.ts:134`, `DemoSynth.ts:131`, `KaraokeSession.ts:222`, `model/sync.ts:9` (tap-to-sync, receives the frame), and `PitchTracker.ts:56` (gets `setLead` beside its existing `setOffset`). `ProgressRow` shows media time and is unchanged.
*   `SHIFTER_LATENCY_S` lives in `SoundTouchShifter.ts` with the measurement date and the rates it was measured at (Q3). Per-rate table only if the spike shows > 10 ms spread.

### Transposition (one accessor)

*   `keyOffset` is App state (`useState(0)`) beside `vocalLevel`. It carries over between songs because nothing resets it.
*   `effectiveKey` = `keyOffset` when the source is the demo (synth only) or when the shifter status is `on`; otherwise 0 (YouTube, Listen, flag off, worklet loading or unavailable). This is the only value ever handed to the timeline, so the lane and the scoring never move before the audio does.
*   `TrackTimeline` gains `setKeyOffset(n)` and `noteOf(syl): number | undefined` (= `syl.note + keyOffset`, or `undefined` when the syllable has no note). This is a mutable field on the memoized timeline, like `session.setScoring`, so a key tap does not rebuild the timeline (which would recreate `KaraokeSession`, `GuideSynth` and `DemoSynth` — `App.tsx:109,112,198,215`). Readers: `PitchLane.tsx:63,105,110`, `GuideSynth.ts:166`, `DemoSynth.ts:143,167`, and `scoring.ts:76,113` via the note passed by `KaraokeSession`. The `pitchClassDistance` comparison makes an integer add sufficient.

### Session state ownership

| Value | Owner | Set by | Per song or session |
|---|---|---|---|
| `vocalLevel` | App state (exists) | Voice slider, Vocals switch | session |
| `keyOffset` | App state (new) | Key stepper | session |
| rate | `engine.setRate` (exists) | Speed slider; `useSongSet.next()` resets to 1 | song |
| `track.offset` | `track` (exists) | Lyrics timing, tap-to-sync | song |
| `source`, `track` (single song) | App state (exist) | `handleFileUpload`, `handleYouTube`, `startListen`, `clearSource`, `pickSynced`, `pickPlain`, `handleImportFile`, `applyStudioTrack`, `loadTrack` — **unchanged** | — |
| set entries, index, current object URL | `useSongSet` (new) | Set panel, grade screen | — |
| `introActive` | App state (new) | `startSet`/`nextSong` set it; card `onDone`/`onSkip`, Pause, Seek, Restart clear it | — |

When a set is active, App derives the backing source from `set.current` (`{ kind: "file", url, mediaKind, name }`) and the track from `set.current.track ?? emptyTrack`; the single-song states are cleared when a set starts. No new App state beyond `keyOffset`, `introActive` and the hook.

### Song set hook

`src/hooks/useSongSet.ts`:

```ts
interface SetEntry { id: string; file: File; title: string; artist: string; track: Track | null }
// state: { entries: SetEntry[]; index: number }   (index −1 = not started)
// actions: add(file, track) → { ok } (cap 8), remove(id), start(), next(), end()
// derived: current: { entry, url, mediaKind } | null, position: "Song N of M", hasNext
```

*   Owns the **one** live object URL: `start()`/`next()` create the URL for the new current entry and revoke the previous one in the same call; `end()` and unmount revoke. The existing single-file URL effect in App is untouched for non-set uploads.
*   `next()` calls `engine.setRate(1)`; nothing else is reset.
*   Pure helpers `addEntry`, `removeEntry`, `nextIndex` are exported for fixtures.

### Media element reuse

*   `<MediaElement key={media.mediaKind} …>`: same-kind songs (the common case) swap `src` on one element, so the `MediaElementSource` and vocal chain are reused and the element keeps its iOS activation. A mixed-kind set remounts (as today) and relies on the "Tap to start" fallback on iOS.
*   `MediaElement` calls `engine.mediaSourceChanged()` in an effect on `src`; the engine clears `ended` and `lastMediaTime`, bumps `generation` and re-applies the rate, because `attachMedia` returns early on the same element (`PlaybackEngine.ts:215`).

### Intro card and the iOS prime

*   `introActive` is set by `startSet()`/`nextSong()` in App. While true, `IntroCard` renders in the cue slot and `Karaoke` does not render `CountIn`. The card runs its own countdown: three beats of `timeline.beat` (already derived from `track.bpm` with a 100 bpm fallback), rendered with `CountIn variant="dots"`; on the last beat it calls `onDone` → App sets `introActive = false`, records `skipCountInGeneration = engine.frame.generation`, and calls `engine.play()`. `Karaoke` skips line 0's count-in while `generation === skipCountInGeneration`.
*   iOS prime, inside the "Start set"/"Next" tap handler, before React re-renders: through the element ref, `el.src = url; el.load(); el.muted = true; await el.play(); el.pause(); el.muted = false; el.currentTime = 0`. The later render sees the same `src`. If `engine.play()` from the card's timer rejects (`mediaTransport.play` reports it through the engine's `error` path), the card shows "Tap to start" (`intro-tap`) and waits.
*   Pause, Seek, Restart and a source change clear `introActive` and cancel the countdown.

### UI

*   `ThumbBar`: slot 2 is `VocalsSwitch` for every source (same markup pattern as `MicSwitch`: `role="switch"`, oblong, knob + "ON/OFF", caption "Vocals" / "Vocals off" / the disabled reason). Restart is removed from the thumb bar and becomes a 44 px ⏮ button at the left end of `ProgressRow` for every source (`btn-restart` keeps its testid and exists in exactly one place).
*   `MoreSheet`: a "Key" row above the Speed slider: `key-minus`, `key-value` ("0", "+2", "−3"), `key-plus`, `key-zero`; a status line `key-status` ("on" / "loading…" / "not available: <reason>" / "Local files and the demo only"); `aria-live` readout "Key minus 2 semitones". Rendered only when `VITE_FEATURE_KEY=1`.
*   Stage: `KeyPill` in the toast stack ("Key −2", `key-pill`) when `effectiveKey ≠ 0`.
*   `SongPanel`: a "Set" section listing entries (`set-item-i`, `set-remove-i`), "Add song" (`set-add`: file picker → the lyrics search is focused with a "for: <file name>" caption → the next `Use` adds the entry), "Start set" (`set-start`), `set-position` ("Song N of M"), the note "Your set lives in this tab only — reloading clears it", and the full message "Set is full (8 songs)".
*   `IntroCard` in the cue slot (SectionCard styling): title, artist, "Song N of M", "Key −2" when ≠ 0, dots; `role="status"`, accessible name "Up next: <title>", `data-testid="intro-card"`, `intro-countdown` readout, a full-stage transparent button `intro-skip` ("Skip intro"), and `intro-tap` in the fallback state.
*   `GradeScreen`: props `nextTitle?`, `onNext?`, `onEndSet?`. Buttons in DOM (= focus) order: in a set with a next song `btn-next` ("Next: <title>", primary, first focus) · `btn-sing-again` · `btn-end-set`; last song of a set `btn-sing-again` (first focus) · `btn-end-set`; no set: `btn-sing-again` (first focus) · `btn-close-grade`, as today. `useModalFocus` receives the first-focus selector.

### Feature flag

`src/featureFlags.ts`: `export const KEY_ENABLED = import.meta.env.VITE_FEATURE_KEY === "1"`. Default off everywhere (no `.env` default, no URL override). Turning it on in production is a Vercel environment variable plus a redeploy; in native shells it is a store release, so native stays off until Q1 passes. Vocals and the set ship without flags and are guarded by the baseline flows.

## Alternatives Considered

### Alternative A: `preservesPitch = false` + `playbackRate = 2^(k/12)` for the key

*   **Pros**: no dependency, no worklet, zero CPU.
*   **Cons**: tempo moves with the key (−2 semitones = 11 % slower); the element's rate would differ from the user's chosen tempo, and `PlaybackEngine.setRate` (the single tempo authority, with its glide against fresh media reports) would be fighting a second writer.
*   **Reason for Rejection**: Rejected by author: the feature is "key without tempo change"; this alternative is "tempo change".

### Alternative B: Hand-written WSOLA/granular worklet

*   **Pros**: no dependency; ~5 KB; tunable for small shifts.
*   **Cons**: the largest piece of DSP in the app with no quality baseline; polyphonic music (a full backing track) is where granular shifters sound worst; weeks of tuning.
*   **Reason for Rejection**: Rejected by author for this release; SoundTouch is a 20-year-old algorithm with a maintained worklet port and a documented `MediaElementSource` path.

### Alternative C: Other libraries (Rubber Band WASM, Tone.js `PitchShift`, legacy `soundtouchjs` 0.3.0)

*   **Pros**: Rubber Band has the best quality; Tone.js is widely used; legacy soundtouchjs is the same algorithm.
*   **Cons**: Rubber Band is GPL (or a commercial licence) and ~400 KB WASM; Tone.js `PitchShift` is a granular effect with audible warble on music and pulls in the whole library; legacy `soundtouchjs` is LGPL-2.1, 1.8 MB unpacked, ScriptProcessor-based (deprecated, main-thread audio).
*   **Reason for Rejection**: Rejected by author: licence (Rubber Band, legacy soundtouchjs for store builds), quality on music (Tone.js), deprecated API (legacy).

### Alternative D: Disable scoring, demo and guide while key ≠ 0

*   **Pros**: no changes to scoring or synths.
*   **Cons**: a correct singer at key −2 is scored two semitones off, or loses scoring entirely.
*   **Reason for Rejection**: Rejected by author: transposition is an integer add on MIDI notes behind one accessor; the alternative punishes correct singers.

### Alternative E: One persistent `<video>` element for every file

*   **Pros**: one element for the whole set regardless of kind; one chain forever.
*   **Cons**: changes the default path for every MP3 user (a `<video>` element with hidden surface); the stated memory benefit is weak since `mediaSources` is a `WeakMap`.
*   **Reason for Rejection**: Rejected by author: the real need is iOS element activation across advances, which keying the element by kind already gives for same-kind sets; mixed-kind sets take the tap fallback.

### Alternative F: A play gate inside `PlaybackEngine`

*   **Pros**: the intro delay lives next to `onBeforePlay`.
*   **Cons**: adds `playToken`/`pendingPlay`/`gated` to the one component every consumer depends on; every reader of `playingFlag` (toggle, Space, `k`, ThumbBar) breaks while gated; the engine learns about sets.
*   **Reason for Rejection**: Rejected by author: one App boolean plus the existing `engine.play()` does the same with no engine change.

### Alternative G: Sixth thumb-bar target or stacked half-height switches

*   **Pros**: Restart stays where it is.
*   **Cons**: six targets at 320 px are < 44 px each; half-height switches fail the same check.
*   **Reason for Rejection**: Rejected by author: fails the 320 px / 44 px layout verified in the QA audit; Restart is seek-to-zero and belongs in the seek row.

--------------------------------------------------------------------------------

## Non-Functional Requirements

*   **Performance**: no audible dropouts for 10 minutes on the owner's Android at key −2, vocals off, mic on (Q1, manual). Bundle growth ≤ 25 KB gzipped on the main chunk (the node module) and one 17 KB gzipped processor file, both loaded lazily on the first non-zero key.
*   **Latency**: shifter delay compensated through `frame.lead`; G2 tolerance 30 ms (owner-accepted, unconfirmed until Q3).
*   **Memory**: one object URL at a time; ≤ 8 `File` handles; one media element per kind.
*   **Security & privacy & licensing**: no persistent storage; the worklet is first-party hosted under `/assets/`; MPL-2.0 is file-level copyleft and compatible with store distribution — `THIRD_PARTY.md` carries the notice and the README's "no runtime dependencies beyond React" line becomes "beyond React and, for the key change, the SoundTouch audio worklet (MPL-2.0), loaded only when you change the key".
*   **Rollout & rollback**: Vocals and the set ship on the web with the next deploy and roll back by redeploying the previous commit (Vercel keeps every deployment). Key is off until `VITE_FEATURE_KEY=1` is set in Vercel and the spike plus Q1 pass; native shells ship Key only in a later store release.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Worklet CPU overrun on the phone (Q1) | Medium | Audible glitches | Shifter inserted only at key ≠ 0; flag off until the device run passes; manual "0" resets the key |
| Shifter latency mis-measured or rate-dependent (Q3) | Medium | Lyrics early/late by 10–60 ms at key ≠ 0 | Click test at three rates in the spike; per-rate table if the spread > 10 ms; Tap to sync still available; key 0 path unchanged |
| `preservesPitch` unsupported or double-corrected | Low | Wrong pitch at key ≠ 0 | Spike measures pitch error in cents at three rates; set both property names; status `unavailable` hides the control |
| iOS blocks `play()` from the card's timer (Q2) | Medium | Set stalls after the first song on iPhone | Prime inside the tap; "Tap to start" fallback on rejection; device check in Phase 4 |
| Stale `File` handle (file deleted) | Low | Song fails to load | Media `error` → notice "Couldn't open <title>" with Next/End set still available |
| Processor file not served or not precached | Low | Key unavailable | `?url` import under `/assets/`; build check that `dist/assets/soundtouch-processor-*.js` exists and is in the precache manifest |
| `App.tsx` keeps growing | Medium | Maintainability | Rule: no new App state beyond `keyOffset`, `introActive` and the hook; set and intro logic in `useSongSet.ts` and `IntroCard.tsx` |
| Browser flows live outside the repo | Certain today | No regression gate | Step 0 commits them under `scripts/flows/` with fixtures and a runner |
| Supply chain: new npm dependency | Low | Compromised processor runs on the audio thread | Exact version pin (`2.1.1`, no caret), lockfile, `THIRD_PARTY.md`, no network access from the worklet |

## Tolerances

| Quantity | Tolerance | How checked |
|---|---|---|
| Lyric time vs audible position at key ≠ 0 | ≤ 30 ms at 0.5×, 1×, 2× | spike click test; `lyricTime` fixture with `frame.lead` |
| Lyric time at key 0 | unchanged (lead = 0) | existing flows unchanged against `BASELINE.md` |
| Pitch error after shifting (spike) | ≤ 15 cents at −2 and +2, at 0.5×, 1×, 2× | FFT peak of an A440 fixture in headless Chromium |
| Key 0 analyser levels vs today | ≤ 0.5 dB | flow compares `--energy` on `beat.wav` at 2 s before/after |
| Residual vocal after chain at key −2 vs key 0 | ≤ 3 dB difference | synthetic centre-tone fixture through chain+shifter |
| Semitone ratio | 2^(n/12) ± 1e-9 | fixture |
| Thumb-bar targets | 5 targets ≥ 44 px at 320 px | `verify-layout` flow |
| Intro countdown | 3 × `timeline.beat`; skip reacts ≤ 100 ms | `verify-set` flow |
| Set size | ≤ 8 entries | fixture |

--------------------------------------------------------------------------------

### Additional Resources

*   `concepts_brief.md`, `feature_concept.md`, `lenses/*.md`, `reviews/*.md`, `consolidated_review_report.md`, `goldfish_review_report.md` (this folder)
*   `lyricglow/docs/qa-audit-2026-10-18.md` (layout and target-size baseline)
*   `@soundtouchjs/audio-worklet` 2.1.1 README ("With an HTML audio element" section)

### Future Improvements

*   **Lyrics auto-match for set entries**: fill `SetEntry.track` from LRCLIB using the file name.
*   **Per-rate latency table** if Q3 shows the delay depends on rate.
*   **Apply key to all**: one tap in the set list.

--------------------------------------------------------------------------------

## Detailed Implementation Plan

Conventions: paths are relative to `lyricglow/`. The gate after every phase is `npx tsc -b && npx eslint . && npm run build && npm run check:model && npm run flows` (flows start `VITE_YT_API_KEY=testkey-ABC123 npx vite --port 5173 --strictPort` themselves and mock LRCLIB, YouTube and `/api/recognize` locally). Commit after each green phase. A phase modifies only the files it lists.

### Step −1: Confirm the newest source
*   `git status` clean on `claude/lyricglow-karaoke-app-ugIUj`, HEAD a descendant of `c6c0951`; `npm ci`.

### Step 0: Flows into the repo (Create)
*   `package.json`: add `playwright` as a dev dependency (the sandbox's `/opt/node22/lib/node_modules/playwright` is used locally; the dependency makes `npm run flows` work elsewhere), scripts `"flows": "node scripts/flows/run.mjs"`.
*   `scripts/flows/run.mjs`: starts the dev server, runs every `verify-*.mjs` in sequence, prints pass/fail, exits non-zero on failure.
*   `scripts/flows/lib.mjs`: shared helpers (launch, mocks for LRCLIB/YouTube/recognize, `--energy` reader, upload helper).
*   `scripts/flows/verify-layout.mjs`, `verify-karafun.mjs`, `verify-phase2.mjs`, `verify-vocal-yt.mjs`, `verify-mic.mjs`, `verify-guide.mjs`: rewritten from the session scratchpad with their current assertions; fixtures `scripts/flows/fixtures/beat.wav`, `stereo.wav`, `mic220.wav`.
*   `scripts/flows/BASELINE.md`: the recorded output at Step 0 (energy values, target sizes). Rule: later phases compare against it; a changed number needs a sentence in the phase's commit message.
*   `scripts/flows/README.md`: how to run, what is mocked.
*   **Gate**: full gate green; this is the baseline.

### Phase 1 — Vocals switch, Restart to the seek row

#### 1. `src/components/VocalsSwitch.tsx` (Create)
*   props `{ on: boolean; disabledReason: string | null; onToggle(): void }`; markup mirrors `MicSwitch` (`role="switch"`, `aria-checked`, knob, "ON/OFF", caption "Vocals" / "Vocals off" / `disabledReason`), `disabled` + `aria-disabled` when a reason is set; `data-testid="vocals-toggle"`, `vocals-state` readout `on | off | unavailable`. New `IconVoice` glyph in `Icons.tsx`.
#### 2. `src/components/ThumbBar.tsx` (Modify) — slot 2 renders `VocalsSwitch`; the Restart item is removed; new props `vocals: { on, disabledReason }`, `onToggleVocals`.
#### 3. `src/components/ProgressRow.tsx` (Modify) — `<button className="seek-restart" data-testid="btn-restart" aria-label="Restart">` (44 px) before the current-time label, calling `engine.restart()`.
#### 4. `src/App.tsx` (Modify) — `lastVocalLevel` ref; `toggleVocals`; the slider's setter updates the ref when > 0; `vocals = { on: vocalLevel > 0, disabledReason }` where the reason is "Mono file — can't separate vocals" when `vocalMono === true`, "Local files only" when the source is not a file, else `null` (a `null` verdict counts as stereo).
#### 5. `src/styles.css` (Modify) — `.vocals-switch*` from `.mic-switch*` with the gold accent for ON; `.seek-restart` 44 px round inside `.progress-row`; landscape keeps the row ≤ 56 px.
#### 6. `scripts/flows/verify-vocals.mjs` (Create) — stereo file → `on`; tap → `off`, `vocal-level` 0; tap → 35; slider 60, toggle off/on → 60; mono fixture → `unavailable` with the mono string; demo → "Local files only"; YouTube mock → "Local files only"; five thumb targets ≥ 44 px at 320 px; `btn-restart` in the seek row resets the seek value to 0.
#### 7. `README.md` (Modify) — Vocals row in the controls table.
*   **Gate**: full gate; `verify-layout` and `verify-mic` unchanged vs `BASELINE.md`.

### Phase 2 — Key change (flag `VITE_FEATURE_KEY`)

#### 2a. Spike (go/no-go)
#### 8. `package.json` (Modify) — `"@soundtouchjs/audio-worklet": "2.1.1"` (exact); `THIRD_PARTY.md` (Create) with the MPL-2.0 notice; `README.md` dependency sentence.
#### 9. `scripts/spike/key-spike.html` + `scripts/spike/key-spike.mjs` (Create)
*   Headless Chromium page: `fixtures/a440.wav` (2 s sine at 440 Hz) through `MediaElementSource → SoundTouchNode → analyser`, `preservesPitch = false`, rate ∈ {0.5, 1, 2} mirrored, `pitchSemitones` ∈ {−2, 0, +2}; FFT peak → error in cents. `fixtures/click.wav` (single impulse) through the chain with and without the node; cross-correlate analyser time-domain captures → delay in ms per rate. Prints a table. Also run once in Firefox (Playwright) for the pitch part.
*   **Exit criteria**: pitch error ≤ 15 cents in all nine cells; delay spread across rates ≤ 10 ms (else per-rate table); no dropouts in a 60 s desktop run. **If it fails**: remove the dependency, ship Key for the demo track only (steps 12–15 without 10–11), record the result in `goldfish_review_report.md`, and continue with Phase 3. Vocals and the set ship regardless.
#### 2b. Implementation (only if 2a passes)
#### 10. `src/engine/SoundTouchShifter.ts` (Create) — as in the architecture section; `SHIFTER_LATENCY_S` (or the per-rate table) with the spike's numbers and date.
#### 11. `src/engine/AudioGraph.ts` (Modify) — `setKey(el, n): Promise<void>` (insert/remove with crossfade, analyser re-point, `preservesPitch` handling); `mirrorRate(el, r)`; `keyStatus(el)`; `outputLatency(el)`.
#### 12. `src/engine/PlaybackEngine.ts` (Modify) — `setOutputLatency(s)`; `frame.lead` computed each frame (`Frame` gains `lead: number`, 0 by default).
#### 13. `src/model/timeline.ts` (Modify) — `lyricTime(frame, track)`; `setKeyOffset`, `noteOf` on `TrackTimeline`. Readers switched: `Karaoke.tsx`, `SpectrumCanvas.tsx`, `PitchLane.tsx`, `GuideSynth.ts`, `DemoSynth.ts`, `KaraokeSession.ts`, `PitchTracker.ts` (`setLead`), `model/sync.ts` (signature takes the frame), `scoring.ts` (note passed in).
#### 14. `src/components/MoreSheet.tsx` (Modify) — Key row; `src/components/KeyPill.tsx` (Create); `src/featureFlags.ts` (Create).
#### 15. `src/App.tsx` (Modify) — `keyOffset` state; `effectiveKey`; `graph.setKey` + `graph.mirrorRate` effects; `engine.setOutputLatency(graph.outputLatency(el))`; `timeline.setKeyOffset(effectiveKey)`; `tracker.setLead`.
#### 16. `scripts/check-model.ts` (Modify) — `semitoneRatio`; `noteOf` with and without a note; `lyricTime` with lead at three rates; `scoreSyllable` with a transposed note.
#### 17. `scripts/flows/verify-key.mjs` (Create) — build served with `VITE_FEATURE_KEY=1`: stereo file → "−" twice → `key-value` "−2", `key-status` "on", `key-pill` visible, `audio.preservesPitch === false`, `--energy` > 0; "0" → status "off", `preservesPitch === true`, energy within 0.5 dB of baseline; rate 2× with key −2 → highlight vs `audio.currentTime − lead` drift ≤ 30 ms over 10 s; processor route 404 → status "not available", audio still plays; YouTube mock → "Local files and the demo only".
#### 18. `vite.config.ts` (Modify) — small plugin asserting the processor chunk is emitted under `assets/`; `docs/mobile-apps.md` — Key flag note and the Q1 checklist.
*   **Gate**: full gate with the flag off (baseline unchanged) and on (`verify-key`); the spike table pasted into `goldfish_review_report.md`. Q1 device run is manual and recorded there before the flag is turned on in Vercel.

### Phase 3 — Song set hook and element reuse (no visible change)

#### 19. `src/hooks/useSongSet.ts` (Create) — as in the architecture section, with the pure helpers.
#### 20. `src/components/MediaElement.tsx` (Modify) — `src` effect → `engine.mediaSourceChanged()`; `src/engine/PlaybackEngine.ts` (Modify) — `mediaSourceChanged()`.
#### 21. `src/App.tsx` (Modify) — `<MediaElement key={media.mediaKind}>`; derive source/track from `set.current` when a set is active.
#### 22. `scripts/check-model.ts` (Modify) — `addEntry` cap (9th → `{ ok: false }`), `removeEntry` of the current entry, `nextIndex` at the end.
*   **Gate**: full gate; all Step 0 flows unchanged vs `BASELINE.md`; a fixture asserts `revokeObjectURL` is called once per `next()` (injected URL factory).

### Phase 4 — Intro card

#### 23. `src/components/IntroCard.tsx` (Create) — as in the UI section; countdown = 3 × `timeline.beat` via `setTimeout` per beat.
#### 24. `src/App.tsx` (Modify) — `introActive`; `startSet`/`nextSong` with the iOS prime; `skipCountInGeneration`; Pause/Seek/Restart clear the card; `Karaoke.tsx` (Modify) — `suppressFirstCountIn` prop.
#### 25. `scripts/flows/verify-intro.mjs` (Create) — set of one → Start set → `intro-card` visible, audio paused, seek 0 → after 3 beats audio plays and the card is gone and no line-0 dots appear; Start again → `intro-skip` → plays ≤ 100 ms; Pause during the intro cancels; single-file Play (no set) → no card.
*   **Gate**: full gate + `verify-intro`. **Q2 device check** on the owner's iPhone (PWA): two-song set, song 2 starts without a tap; if not, the fallback card appears.

### Phase 5 — Set UI and grade screen

#### 26. `src/components/SongPanel.tsx` (Modify) — the Set section.
#### 27. `src/components/GradeScreen.tsx` (Modify) — `nextTitle`, `onNext`, `onEndSet`; button order and first focus as specified; `src/hooks/useModalFocus.ts` (Modify) — first-focus selector parameter.
#### 28. `src/App.tsx` (Modify) — `nextSong` → `set.next()` → `introActive`; `singAgain` unchanged; `endSet` → `set.end()` keeps the last song loaded; media `error` → notice with the entry title.
#### 29. `src/styles.css` (Modify) — set list, intro card, key pill.
#### 30. `scripts/flows/verify-set.mjs` (Create) — add three songs (mocked LRCLIB) → `set-position`, remove one and re-add, cap message at 9; Start set → intro 1 → seek to the end → `btn-next` reads "Next: <title 2>" and has focus → tap → intro 2 shows "Key −2" after setting key −2 during song 1 (flag on) → … → after song 3 `btn-sing-again` focused and `btn-end-set` present; exactly one `audio-element` throughout; `revokeObjectURL` stub called once per advance.
#### 31. `README.md`, `docs/mobile-apps.md` (Modify) — Set and Intro rows; Q2 checklist.
*   **Gate**: full gate + `verify-set` + `verify-intro` + Step 0 flows.

### Verification Plan

*   **Compilation/Build**: `npx tsc -b && npm run build`; `npm run build:native` once after Phase 2 to confirm the processor chunk is present.
*   **Unit/fixtures**: `npm run check:model` (new sections: set helpers, `noteOf`, `lyricTime`, semitone ratio, transposed scoring).
*   **Static analysis**: `npx eslint .`.
*   **E2E**: `npm run flows` (Step 0 flows + `verify-vocals`, `verify-key`, `verify-intro`, `verify-set`) against the dev server; all mocks are local request routes in `lib.mjs`.
*   **Spike**: `node scripts/spike/key-spike.mjs` prints the pitch/latency table; pasted into `goldfish_review_report.md`.
*   **Manual device checks**: Q1 (owner's Android, 10 min at key −2), Q2 (owner's iPhone, two-song set); results recorded in `docs/mobile-apps.md`.
*   **Production**: deploy only after the owner's go-ahead (G3); then `curl -sI https://lyricglow.vercel.app/assets/soundtouch-processor-<hash>.js` returns `content-type: text/javascript` and the app serves the new commit hash.

--------------------------------------------------------------------------------

*Drafted with EGM*
