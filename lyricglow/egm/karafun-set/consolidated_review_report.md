# Consolidated review report — design_draft.md (karafun-set)

Target: `design_draft.md` at commit `5a49acf` (361 lines; FeatureRange 1–228, DetailedRange 229–361). Preset: uninterrupted. Goldfish context: the `lyricglow/src` tree at `c6c0951` (stage 6 had none).

## Reviewers run

| Stage | Persona | Result |
|---|---|---|
| 5 | zoom_out | ran, 10 findings |
| 5 | inventive_catalyst | ran, 10 findings |
| 6 | comprehension (document only) | ran, 10 findings |
| 7 | design_critic | ran, 10 findings |
| 7 | structural | ran, 10 findings |
| 7 | style | ran, 10 findings |
| 9 | implementation_readiness | ran, 10 findings |
| 9 | codebase_details | ran, 10 findings |
| 9 | style | ran, 10 findings |
| 8 | zoom_out (on this report) | see the Stage 8 section |

Failed: none. Raw reports: `reviews/s*.md`.

## Counts (after de-duplication)

| Severity | Count |
|---|---|
| Blocker | 7 |
| Major | 14 |
| Nit | 8 |

## Blockers

| # | Finding | Raised by |
|---|---|---|
| B1 | **Latency compensation is applied in one place but the lyric clock is computed in eight.** `f.time + track.offset` is evaluated independently in Karaoke.tsx:225, SpectrumCanvas.tsx:53, PitchLane.tsx:55, PitchTracker.ts:56 (feeds scoring), GuideSynth.ts:134, DemoSynth.ts:131, KaraokeSession.ts:222 and ProgressRow. Patching only `KaraokeSession.onFrame` leaves the visible highlight and the scoring windows out of step; the 30 ms goal is unreachable as written, and "unaffected by construction" is false. The latency is in wall seconds while the clock is in song seconds (2× error at 2×), it varies with pitch/tempo ratio, and inserting/removing the shifter makes the position jump. Fix: one shared `lyricTime(frame)` helper (offset + latency × rate) used by every consumer; a measured table per rate (and sample rate) rather than one scalar; ramp the latency term over the 30 ms crossfade with a `DelayNode` in the dry path; state the goal as the residual after compensation and mark it unconfirmed until Q3. | design_critic #1, codebase_details #3, comprehension #3, style(7) #4/#6, zoom_out #5, inventive #3, implementation_readiness (impl.) #7 |
| B2 | **The play gate as designed is broken and sits in the wrong place.** Snippet uses an undeclared `token`; `pendingPlay`/`playToken`/`startTransport` don't exist; `toggle()`, Space and `k` read `playingFlag` (false while gated) so a second tap installs a second gate; ThumbBar shows Play while gated; `restart()` and `startTapSync` would enter the intro; `gated` needs `buildSnapshot`/`publish` edits; who creates the promise and who fires `countdownDone` is unstated. Deferring `transport.play()` ~2 s after the tap also risks iOS autoplay for song 1, and `mediaTransport.play` swallows the rejection so the intro would hang. Fix: keep the gate out of the engine — the intro is a pre-roll state; the card calls `engine.play()` when the countdown ends or on tap; Pause/Seek/Restart dismiss the card; prime the element inside the tap (muted play → pause → seek 0) on iOS; move the iOS check to Phase 3. | codebase_details #1, impl.readiness #2/#3, style(9) #4, design_critic #4/#8, zoom_out #6, inventive #5 |
| B3 | **SongFlow contradicts the prose and duplicates existing state.** `grade —singAgain→ playing` skips the intro; `intro —pause|seek→ idle` vs "pause/seek skipIntro"; `Restart` named but no event; `start`/`gradeShown`/`endSet` have no firer; `finished/grade/advancing` restate `session.finished`, `gradeReadyKey`, `gradeDismissed`; no mechanism suppresses the first line's count-in. Fix: collapse to `idle | intro | playing | grade` (or a single `introActive` flag beside the queue), one table (phase, event, next, side effect) with a wiring row per UI/engine event, one countdown owner, and an explicit count-in suppression on the intro→play handoff. | comprehension #2, impl.readiness #3, zoom_out #1, inventive #7, design_critic #8 |
| B4 | **"One reused media element" is false for mixed sets and for the current code.** `<MediaElement key={media.url}>` remounts per song; the tag switches between `<audio>` and `<video>` by kind, so an MP3+MP4 set creates a new `MediaElementSource` and vocal chain per switch (the leak Alternative D rejects); `attachMedia` early-returns on the same element so a `src` swap would not bump generation/ended/lastMediaTime; the `el.src`/`load()` step is redundant. Fix: one persistent `<video playsInline>` for every file (hidden for audio), constant key, explicit engine reset on source swap, MP3→MP4→MP3 fixture, update `audio-element` testid consumers. | inventive #2, design_critic #3, codebase_details #6 |
| B5 | **The CPU auto-bypass cannot be built as written.** `performance.now` is unavailable inside `AudioWorkletGlobalScope`, the processor is third-party, and "EMA via port else `ctx.currentTime` drift" is an undecided branch. Fix: drop the auto-bypass for this release (Q1 device run decides), or detect overload on the main thread (`AudioContext.renderCapacity` where supported, else analyser glitch detection) with a manual "Key off" fallback on Safari/Firefox; derive a single `effectiveKey` (0 when bypassed/failed) that scoring, lane, guide and demo read, so a bypass never leaves them in the wrong key. | design_critic #2, inventive #4, impl.readiness #6, style(9) #5, zoom_out #4 |
| B6 | **Phase 0 and the verification plan depend on infrastructure that does not exist.** The flow scripts (`verify-*.mjs`, `.wav` fixtures) are not in the repo or on the target machine and no source path is given; no Playwright dependency; `check:model` runs under Node and cannot test a worklet; the click-test audio fixture is undesigned; `npm run flows`, `BASELINE.md`, `fixtures/*` are not Create entries. Fix: Step 0 writes the flows as new files with their assertions (or names the exact source directory), adds `playwright` as a dev dependency, defines `npm run flows` and the BASELINE comparison rule, and states which tolerances are device-only. | impl.readiness #1, codebase_details #9, design_critic #9, style(7) #2, style(9) #2/#3 |
| B7 | **Alternatives fail the standard and the document is not self-contained.** Every rejection is "Rejected by author" + an unlinked brief decision; F has no Pros/Cons; missing options (Rubber Band WASM, Tone.js PitchShift, non-worklet soundtouchjs, `OfflineAudioContext` pre-render, native-only key); no numbers; no MPL-2.0 note for store builds; D1–D12 and "the clock never learns about key" are cited without local statement. Fix: state the technical reason in each entry, add the missing options with a one-line trade-off, inline a D1–D12 table. | structural #1/#2, style(7) #1, design_critic #6, comprehension #1, zoom_out #10 |

## Majors

| # | Finding | Raised by |
|---|---|---|
| M1 | Flags: Phase 2 is ungated yet G5 promises "flag off = exactly today"; three build-time flags + `?feature=` = 2³ paths; web `KEY` defaults "1" while Q1 says "before it defaults on"; native rollback is a store release, not a redeploy; "Vercel instant rollback" is unverified. Fix: one flag `VITE_FEATURE_KEY` (off on web and native until Q1–Q3), Vocals and Queue ungated; drop the override; state native rollback. | zoom_out #3, inventive #1/#6, design_critic #7, style(9) #1, comprehension #6 |
| M2 | `keyOffset` is threaded into four consumers; apply once in `buildTimeline(track, keyOffset)` (pitch-class comparison makes it safe). Flow hooks it relies on (`data-note` — PitchLane is a canvas, `data-guide-hz`, `window.__lg`, `key-badge`) are never created. | zoom_out #2, codebase_details #4, impl.readiness #7, style(9) #8 |
| M3 | SoundTouch integration unproven: `preservesPitch = false` + rate mirror after a `MediaElementSource`; live toggling glitches; mirror lags the rate glide; start-up silence; `webkitPreservesPitch` typing; `?url` module declaration; crossfade node and connect order; `keyStatus` union + UI text. Fix: a Phase 0 spike on Chrome/Firefox/iOS/Android with a pitch-accuracy test in cents at 0.5/1/2×; exact graph ops. | design_critic #5, impl.readiness #6, inventive #3 |
| M4 | Dependency vs README ("no runtime dependencies beyond React"); lazy-load claim needs `import()` and the precache glob fetches the processor anyway; sizes/licence unsourced; 80 KB cap vs ~60 KB processor. Fix: decision paragraph + README edit; `import()`; measured gzipped sizes with version; precache decision. | inventive #8, style(7) #5, design_critic #10 |
| M5 | SongQueue/App ownership: `setCurrentSong` has no signature; `SongEntry` lacks `source`/`url`; the setter list is wrong (`pickSynced`, `handleImportFile`, `applyStudioTrack` never touch `source`; `handleYouTube`, `startListen` do and are missing; `nudgeLyrics`/`applyTapSync` use `setTrack`); `track` is shared with demo/studio preview; who owns key/rate/vocalLevel; `done`/`endSet` semantics appear only in Phase 4. Fix: minimal SongQueue (entries, current index, one URL); non-queue flows keep `setSource`/`setTrack`; a per-call-site table; one owner per setting. | codebase_details #5, impl.readiness #5, comprehension #6, zoom_out #7 |
| M6 | App.tsx line cap (≤ 719) unsatisfiable and contradicts the 1000 figure. Fix: "no new state in App" gate + named extraction (`useSongSession.ts`), or per-phase caps recorded after Phase 1. | impl.readiness #4, codebase_details #2, zoom_out #7, design_critic #10 |
| M7 | Intro lifecycle gaps: countdown needs BPM but entries may have no lyrics (`setInterval(60/bpm)` is also seconds not ms and `bpm` is not a prop); "replaces the first count-in when the song starts at 0" vs always suppressing CountIn; YouTube/Listen enter `intro` with no gate; "Song 1 of 1"; null track; iOS tap branch absent. Fix: lifecycle per source kind incl. empty lyrics; `bpm = track.bpm ?? 100`; `setInterval(…, 60000/bpm)`. | comprehension #7, style(9) #7, impl.readiness #8 |
| M8 | Vocals/Restart: "hidden" vs "slot shows Restart" vs disabled-on-mono; the two Restarts never coexist (say so); `sourceKind === "media"` vs "file"; two mono captions; slider-moved-while-muted; mono verdict is `null` before signal; Restart's position depends on source. Fix: Restart always in the seek row; slot 2 = Vocals or disabled Vocals with reason; one vocabulary; one mono string "Mono file — can't separate vocals"; define the pre-verdict state. | comprehension #8, inventive #9, impl.readiness #8, design_critic #10 |
| M9 | GradeScreen: focus selector hard-coded to `btn-sing-again`; `btn-close-grade` unaddressed (four buttons, no order); `gradeShown` source; `singAgain` re-enters the intro under the gate. | codebase_details #7 |
| M10 | Diagnostics module, download UI, `window.__lg` and `PitchShifter` interface are beyond the goals (the interface contradicts the non-goal). Fix: concrete `SoundTouchShifter`; console counters + dev-only export. | zoom_out #4, inventive #7 |
| M11 | Audio-graph description claims the analyser is in series; in code it is a side branch off `chain.output` and `chain.output → destination` is direct. Fix: describe today's topology and the key≠0 rewiring (disconnect from destination, route through shifter, re-point the analyser source). | style(7) #3, zoom_out #8, inventive #10 |
| M12 | Structure vs the standard: Risks/Tolerances/Resources/Future nested under NFR; headings not matching ("Problem Statement", "Proposed Architecture"); phases cited in the feature range but undefined there; row 192 is an invariant not a risk; no security/supply-chain or scale rows; Diagnostics and the play gate buried. | structural #3–#8 |
| M13 | File boundary incomplete: `Icons.tsx`, `styles.css` (Ph 3–4), `SongPanel.tsx`, `PitchLane.tsx`, `THIRD_PARTY.md`, `package.json` (Step 0), `package-lock.json`, docs text; CSS "…"; `IconVoice` undefined; test mechanics (residual-vocal fixture, `--energy` 0.5 dB procedure, LRCLIB mock, "seek to end", revoke stub); Phase 4 asserts key −2 before Phase 5. | impl.readiness #9/#10, style(9) #3/#6, codebase_details #8/#10 |
| M14 | Calibration wording: "Design assumes…" (Q1/Q2), "High without refactor", 70 % and 80 KB caps without basis, "eight handlers" vs four named; `SHIFTER_LATENCY_S` file/acceptance/spread; `outputLatencyFor` formula. | style(7) #7/#8, style(9) #9, comprehension #9 |

## Nits

| # | Finding | Raised by |
|---|---|---|
| N1 | ~20 internal names undefined; glossary lacks thumb bar, cue slot, toast stack, Listen, source kind; "719 lines" without context. | comprehension #5, style(7) #9 |
| N2 | Demo-accepts-key vs "local files"; source-kind × control table needed. | comprehension #4, zoom_out #9 |
| N3 | Term drift (Key stepper/row/control; vocal level/Voice slider/Vocals switch; Next vs Next: <title>); L44 duplicates L39. | style(7) #10 |
| N4 | Step −1/Step 0/Phase 0 naming; `<flow>` placeholder; "scratchpad" undefined; `?feature=` syntax drift. | comprehension #10, style(9) #2 |
| N5 | Hotkeys `v`, `-`, `=`, KeyBadge, key-reset are extras beyond the goals. | zoom_out #9 |
| N6 | Code-level detail in the plan (`read()`, `toggleVocals`, `play()` bodies). | zoom_out #10, inventive #10 |
| N7 | Caret version pin; no real links; horizontal rules; Open Questions placement; author line ownership. | structural #9/#10, style(9) #10, design_critic #10 |
| N8 | Production check has no command ("serves the new bundle"); "all mocks local" is a claim. | style(9) #10 |

## Traceability matrix (reviewer finding → consolidated item)

| Reviewer | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| zoom_out (5) | B3 | M2 | M1 | B5 | B1 | B2 | M5/M6 | M11 | N2/N5 | B7/N6 |
| inventive (5) | M1 | B4 | B1 | B5 | B2 | M1 | B3/M10 | M4 | M8 | N6/M11 |
| comprehension (6) | B7 | B3 | B1 | N2 | N1 | M5 | M7 | M8 | M14 | N4 |
| design_critic (7) | B1 | B5 | B4 | B2 | M3 | B7 | M1 | B3 | B6 | M4/M6/M8 |
| structural (7) | B7 | B7 | M12 | M12 | M12 | M12 | M12 | M12 | N7 | N7 |
| style (7) | B7 | B6 | M11 | B1 | M4 | B1 | M14 | M14 | N1 | N3 |
| impl.readiness (9) | B6 | B2 | B2/B3 | M6 | M5 | B5/M3 | M2 | M7/M8 | M13 | M13 |
| codebase_details (9) | B2 | M6 | B1 | M2 | M5 | B4 | M9 | M13 | B6 | M13 |
| style (9) | M1 | B6/N4 | M13 | B2 | B5 | M13 | M7 | M2 | M14 | N8 |

## Stage 8 — intermediate zoom-out on this report

Reviewer: zoom_out (sonnet, read-only; read this report as data and the Goldfish source tree). Raw report: `reviews/s8-zoom-out.md`. Verdict: "Not yet" — the design solves the root problem but chains three features of very different risk into one dependency, and four of the consolidated fixes collide. After the resolutions below the reviewer judged the design "the simplest workable shape".

### New findings (not raised by stages 5–9)

| # | Finding | Severity |
|---|---|---|
| S8-1 | **Key is made dependent on the queue refactor.** `SongEntry.settings {key, rate, vocalLevel}` and Phase 5 behind Phases 2–4 mean the riskiest feature cannot ship until the largest refactor lands. Per D10 key and vocal level carry over and rate resets, so nothing differs per song: they are session state like `vocalLevel` today (`App.tsx:83`). Fix: `keyOffset` in App beside `vocalLevel`; drop `SongEntry.settings`; `advance()` only resets rate; build order Vocals → Key (with spike) → Queue + Intro. | Blocker |
| S8-7 | **The Key slice has no go/no-go gate and no fallback.** Three unproven assumptions (`preservesPitch = false` + rate mirror behind a `MediaElementSource`; stable group delay; CPU on a phone) are only measured at the end of Phase 5. Fix: spike first (Chrome, Firefox, iOS, Android; pitch error in cents at 0.5×/1×/2×; latency click test); stated exit: if it fails, Key ships demo-only (synth) or is dropped, Vocals and Queue ship regardless. Drop the in-worklet auto-bypass (no `performance.now` in the worklet scope); one manual "Key off" path. | Major |
| S8-8 | **`SongQueue` class + `SongFlow` reducer is the wrong altitude.** `source`/`track` are plain App states; the design adds a class, snapshot, hook, reducer and `setCurrentSong`. Fix: a minimal `useSongSet` hook `{ entries: {file, track, title}[], index }` owning the one object URL and the cap; non-queue flows keep `setSource`/`setTrack` with a per-call-site table; `SongFlow` collapses to the `introActive` flag; replace the 719-line cap with "no new App state beyond the hook". | Major |
| S8-9 | **Scope beyond goals after the fixes.** Cut: Diagnostics module/export UI, `window.__lg`, the `PitchShifter` interface (contradicts the Non-Goal), `v`/`-`/`=` hotkeys, `?feature=`, move-up/down buttons (remove + re-add covers 8 entries), code bodies in the plan. Keep: the latency click-test script and the three small UI changes. Also: the intro must appear only when a set is started, never on every single-file Play (line 298 would make every Play wait ~2 s with no flag after M1). | Major |

### Conflicts between consolidated fixes, resolved

| Conflict | Resolution |
|---|---|
| **B2 (gate out of the engine) vs the design's `setPlayGate`** | B2 wins. The gate adds the most engine state to the one component every consumer depends on, breaks every `playingFlag` reader, and teaches the engine about queues. Refinements: (a) the pre-roll is App state, one `introActive` boolean plus the card's timer; the card calls the existing `engine.play()`; (b) the iOS prime happens inside the user's tap (muted `play()` → pause → seek 0) and the iOS check moves to the intro phase; (c) Pause/Seek/Restart dismiss the card; (d) delete the `gated` snapshot field and the engine fixture. |
| **M2 (apply `keyOffset` in `buildTimeline`) vs B5 (`effectiveKey`)** | Keep the single `effectiveKey`; M2's mechanism is wrong. `timeline` is a `useMemo` and `KaraokeSession`, `GuideSynth` and `DemoSynth` are rebuilt on it (`App.tsx:109,112,198,215`), so rebuilding on each key tap would reset the score and tear down both synths mid-song; `PitchLane` reads raw `lines[].syllables`, not `timeline.flat`. Fix: a settable `keyOffset` on the timeline with a `noteOf(syl)` accessor (the `session.setScoring` pattern); PitchLane, GuideSynth, DemoSynth and scoring call it. `effectiveKey` is 0 for YouTube/Listen, when the worklet failed/bypassed, or before `setKey` resolves; equals the user's key for the demo (synth only). |
| **M1 (one flag) vs G5 (every flag off = today)** | Narrow G5 and ungate Vocals and Queue. G5 becomes "with `VITE_FEATURE_KEY` off, the audio path (graph topology, `preservesPitch`, clock) is identical to today". Vocals and Queue are guarded by the baseline flows, not flags. `VITE_FEATURE_KEY` defaults off on web and native until Q1 and Q3 are measured; delete `?feature=`; state that native rollback is a store release. |
| **B4 (one persistent `<video>`) vs the `audio-element` testid flows** | B4's fix loses; its diagnosis is half right. `mediaSources` is a `WeakMap`, so the "leak" is weak; the real reason is iOS element activation (Q2). Switching MP3 users to a `<video>` changes the default path. Fix: keep the audio/video split and key the element by **kind** instead of URL, so same-kind songs swap `src` on one element and keep one chain; a mixed-kind switch accepts the planned "tap to play" fallback on iOS; rewrite Alternative D's reason to iOS activation. Either way the engine needs an explicit reset on `src` swap because `attachMedia` returns early on the same element. |
| **B1 (latency) — where the fix lives** | In the engine frame, not the graph: `engine.setOutputLatency(seconds)` written into `Frame` in song seconds (rate scaling handled once); one shared `lyricTime(frame, track)` helper in `model/timeline.ts` for all eight readers plus ProgressRow; the tracker gets the same setter. Drop "unaffected by construction"; treat 30 ms as unconfirmed until Q3; measure at 0.5×, 1× and 2×. |
| **B5 `effectiveKey` and M2** | Agree once the `noteOf` mechanism is used. |
| **B6 (flows do not exist) and S8-7** | Write the flows from the assertions already listed in the plan before relying on "baseline unchanged" gates. |

### Simplicity verdict

Vocals: yes (a bar toggle on an existing value). Key: yes if the spike passes; there is no simpler way to keep tempo while changing pitch (Alternative A moves tempo). Queue and Intro: simple once reduced to one hook, one boolean, `engine.play()` at countdown end and an element keyed by kind. Remaining cost: the new runtime dependency contradicts README line 5 ("no runtime dependencies beyond React") and needs an explicit decision paragraph, a README edit, a lazy `import()` and a precache decision.

### Updated counts

| Severity | Count |
|---|---|
| Blocker | 8 (B1–B7 + S8-1) |
| Major | 17 (M1–M14 + S8-7, S8-8, S8-9) |
| Nit | 8 |
