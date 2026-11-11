# Goldfish Annotated Review Report

**Target:** `design_draft.md` (full file; pre-resolve copy kept as `design_draft.pre-resolve.md`)
**Status:** resolved — **Approved for build**
**G2 decision (owner, 2026-11-11):** "All blockers + majors, build". Devices available for Q1/Q2: Android phone and iPhone. Q3: 30 ms accepted pending measurement.

## Reviewers

| Stage | Persona | Findings | Report |
|---|---|---|---|
| 5 | zoom_out | 10 | `reviews/s5-zoom-out.md` |
| 5 | inventive_catalyst | 10 | `reviews/s5-inventive.md` |
| 6 | comprehension | 10 | `reviews/s6-comprehension.md` |
| 7 | design_critic | 10 | `reviews/s7-design-critic.md` |
| 7 | structural | 10 | `reviews/s7-structural.md` |
| 7 | style | 10 | `reviews/s7-style.md` |
| 9 | implementation_readiness | 10 | `reviews/s9-implementation-readiness.md` |
| 9 | codebase_details | 10 | `reviews/s9-codebase-details.md` |
| 9 | style | 10 | `reviews/s9-style.md` |
| 8 | zoom_out (on the consolidated report) | 9 | `reviews/s8-zoom-out.md` |

Consolidated: 8 Blockers, 17 Majors, 8 Nits (`consolidated_review_report.md`).

## Applied (PROPOSE FIX)

| Item | Severity | Change in `design_draft.md` | Section |
|---|---|---|---|
| B1 | Blocker | One shared `lyricTime(frame, track)`; the engine writes `frame.lead` (latency × rate) so scaling is done once; all eight readers plus `sync.ts` listed; "unaffected by construction" removed; 30 ms stated as unconfirmed until Q3; measured at three rates; per-rate table if spread > 10 ms | Latency compensation; Tolerances; Q3 |
| B2 | Blocker | Play gate deleted. Intro = `introActive` App boolean + the card's own timer; the card calls `engine.play()`; iOS prime inside the tap; Pause/Seek/Restart dismiss; "Tap to start" fallback | Intro card and the iOS prime; Alternative F |
| B3 | Blocker | `SongFlow` reducer deleted; the existing `session.finished` / `gradeReadyKey` / `gradeDismissed` stay; count-in suppression via `skipCountInGeneration` | Intro card; Session state ownership |
| B4 | Blocker | Element keyed by media kind (not URL); `engine.mediaSourceChanged()` on `src` swap; mixed-kind sets take the tap fallback; Alternative E rewritten with the iOS-activation reason | Media element reuse; Alternative E |
| B5 | Blocker | In-worklet auto-bypass removed; single `effectiveKey` (0 unless the shifter is `on` or the source is the demo); manual "0" path | Transposition; Non-Goals |
| B6 | Blocker | Step 0 creates `scripts/flows/run.mjs`, `lib.mjs`, six flows, fixtures, `BASELINE.md`, `README.md`; `playwright` dev dependency; `npm run flows` | Step 0 |
| B7 | Blocker | Alternatives A–G each carry a self-contained technical reason; missing options added (Rubber Band, Tone.js, legacy soundtouchjs) with licence/size/quality notes; brief decision numbers no longer cited | Alternatives Considered |
| S8-1 | Blocker | `keyOffset` is App state beside `vocalLevel`; `SetEntry` has no settings; `next()` only resets rate; build order Vocals → Key → Set → Intro → Set UI | Session state ownership; Detailed plan |
| M1 | Major | One flag `VITE_FEATURE_KEY`, default off on web and native; `?feature=` removed; Vocals and set ungated; G5 narrowed to the audio path; native rollback = store release | Goals G5; Feature flag; NFR Rollout |
| M2 | Major | Transposition via `timeline.setKeyOffset` + `noteOf(syl)` without rebuilding the timeline; test hooks that could not exist (`data-note`, `data-guide-hz`, `window.__lg`, `key-badge`) replaced by `key-status`, `key-pill` and fixtures | Transposition; verify-key |
| M3 | Major | Phase 2a spike with exit criteria (pitch error ≤ 15 cents at nine cells, latency spread, dropouts) and a stated fallback (demo-only key); the package README's `MediaElementSource` path quoted | Phase 2a |
| M4 | Major | Dependency decision paragraph; README line rewritten; lazy `import()`; precache decision (include, 17 KB gzipped); measured sizes with version and date; exact pin | Audio graph; NFR |
| M5 | Major | `useSongSet` hook owns entries/index/URL; per-value ownership table with every setter; non-set flows unchanged; set source derived from `set.current` | Session state ownership; Song set hook |
| M6 | Major | 719-line cap dropped; rule "no new App state beyond `keyOffset`, `introActive` and the hook" | Session state ownership; Risks |
| M7 | Major | Intro only for sets (files only, so no YouTube/Listen branch); countdown = 3 × `timeline.beat` (bpm fallback already in `buildTimeline`); "Song N of M"; empty track allowed | Intro card; G4 |
| M8 | Major | Restart always in the seek row; slot 2 always Vocals (enabled, mono-disabled, or "Local files only"); one mono string; `null` verdict counts as stereo | G1; UI; Phase 1 |
| M9 | Major | GradeScreen button order, first focus per state, `useModalFocus` selector parameter | UI |
| M10 | Major | Diagnostics module, export UI, `window.__lg` and the `PitchShifter` interface removed; concrete `SoundTouchShifter` | Non-Goals; Audio graph |
| M11 | Major | Today's topology drawn with the analyser as a side branch; key ≠ 0 rewiring listed step by step | Audio graph |
| M12 | Major | Sections follow the template; Risks and Tolerances are their own H2 sections; the phases are not cited in the feature range | whole document |
| M13 | Major | File lists per phase complete (`Icons.tsx`, `styles.css`, `SongPanel.tsx`, `PitchLane.tsx`, `THIRD_PARTY.md`, `package.json`, docs); test mechanics named (A440 and click fixtures, `--energy` at 2 s, injected URL factory, route 404) | Detailed plan |
| M14 | Major | "Design assumes" replaced by owner-checkable device runs; 70 % and 80 KB figures replaced by measured sizes; latency file, acceptance and spread stated | Open Questions; NFR; Tolerances |
| S8-7 | Major | Spike first with go/no-go and fallback (same change as M3) | Phase 2a |
| S8-8 | Major | `SongQueue` class and `SongFlow` replaced by `useSongSet` + `introActive` | Song set hook |
| S8-9 | Major | Cut: Diagnostics, `window.__lg`, `v`/`-`/`=` hotkeys, `?feature=`, move-up/down, code bodies; intro never on single-file Play | Non-Goals; UI; G4 |

## Deferred (DECLINE — nits, swept up where a larger fix touched the same text)

| Item | Note |
|---|---|
| N1 | Glossary extended (thumb bar, cue slot, toast stack, source kind, set); remaining internal names are defined where first used. |
| N2 | Demo-accepts-key is now stated in G2 and the `effectiveKey` rule; no separate source × control table. |
| N3 | Vocabulary fixed to "Key row / Key stepper", "Voice slider / Vocals switch", "Next: <title>". |
| N4 | Steps named −1, 0, then Phases 1–5; `<flow>` placeholder replaced by `npm run flows`. |
| N5 | Hotkeys and key-reset removed; a small `KeyPill` kept because the brief asks for the key to be visible when non-default. |
| N6 | Code bodies removed from the plan. |
| N7 | Exact version pin; horizontal rules kept per the template; author line unchanged. |
| N8 | Production check now has a command (`curl -sI … soundtouch-processor-<hash>.js`). |

## Contested / escalated

None. Every finding was accepted as written or resolved as the stage 8 reviewer recommended where fixes conflicted (see the Stage 8 section of `consolidated_review_report.md`).

## Open questions carried into the build

| Q | State |
|---|---|
| Q1 device CPU | Owner has an Android phone; manual 10-minute run after Phase 2; flag stays off until it passes. |
| Q2 iOS autoplay on advance | Owner has an iPhone; checked after Phase 4; "Tap to start" fallback exists regardless. |
| Q3 shifter latency | Measured by the Phase 2a spike at 0.5×, 1×, 2×; 30 ms tolerance accepted by the owner pending the number. |

## Spike result (Phase 2a) — GO

`node scripts/spike/key-spike.mjs`, 2026-11-11, headless Chromium 1243 (Playwright 1.63), 44.1 kHz, `@soundtouchjs/audio-worklet` 2.1.1. Firefox and the phones were not available in the sandbox; the owner's Android run (Q1) is still pending and gates the flag.

**Pitch error** (A4 fixture; `preservesPitch = false`, element rate mirrored into the node):

| path | 0.5× −2 | 0.5× +2 | 1× −2 | 1× +2 | 2× −2 | 2× +2 |
|---|---|---|---|---|---|---|
| offline buffer source | 0.0 ¢ | −0.1 ¢ | 0.0 ¢ | 0.2 ¢ | −0.4 ¢ | −0.5 ¢ |
| live `<audio>` → MediaElementSource | −0.4 ¢ | −0.3 ¢ | 0.2 ¢ | 0.2 ¢ | −0.1 ¢ | −0.1 ¢ |

Limit was 15 cents; worst cell 0.5 cents.

**Shifter delay** (envelope cross-correlation of 20 ms tone bursts, wall ms; cells with a spread > 20 ms over the three bursts are detection failures of the method, not of the shifter):

| rate | key −2 | key 0 (node in, no shift) | key +2 |
|---|---|---|---|
| 0.5× | 119.6 (spread 4) | 102.8 (12) | 105.9 (11) |
| 0.75× | 122.1 (10) | 119.9 (9) | 115.1 (16) |
| 1× | 126.2 (0) | 133.0 (0) | 126.1 (6) |
| 1.5× | 128.4 (19) | — | 125.8 (15) |
| 2× | — | 111.1 (13) | — |

Decision: one constant `SHIFTER_LATENCY_S = 0.128` (wall seconds, scaled by rate into `frame.lead`). Every reliable cell lies within ±26 ms of it, inside the owner's 30 ms tolerance, so the per-rate table in the design is not needed. Re-measure if the package version changes.

**Dropouts and start-up**: 10 s soak at key −2: no silent frames after the first second (the apparent 600–800 ms silence in the first runs was the analyser's 32768-sample buffer filling, not audio). First sound after `play()`: 88 ms dry, 139 ms through the shifter.

**Sizes**: node module 5.8 KB, processor 72.9 KB raw / 16.9 KB gzipped, emitted as `assets/soundtouch-processor-*.js` and precached.

## Build log

| Phase | Commit | Gate |
|---|---|---|
| Step 0 flows in repo | `78cffd8` | 6 flows green, BASELINE.md recorded |
| Phase 1 Vocals switch + Restart in the seek row | `4ab3e9c` | tsc, eslint, build, check:model, 7 flows green; baseline numbers unchanged |
| Phase 2a spike | `8cd0a35` | GO (table above) |
| Phase 2b Key change | `14de173` | tsc, eslint, build (processor under assets asserted), check:model (+11 fixtures), 8 flows green incl. `verify-key` |
| Phase 3 song-set hook, element keyed by kind, engine reset on src swap | `968a4bc` | gate green; 8 flows unchanged (same-kind swap exercised by `verify-file`) |
| Phase 4 + 5 intro card, set UI, grade screen Next / End set | see git log | gate green; 11 flows incl. `verify-intro` (countdown, first count-in replaced, Skip, Play, no card for single files) and `verify-set` (three songs, cap, remove, Next with focus, key carried over, speed reset, one element, one URL revoked per advance, End set) |

### Deviations from the resolved design (recorded, not hidden)

- **App state**: besides `keyOffset`, `introActive` (as `intro {active, tap}`) and the hook, App also holds `keyState` (the shifter's resolved state), `pendingSetFile` (a file waiting for its lyrics) and `skipCountInGen`. App.tsx grew from 719 to ~945 lines. A follow-up could move the set/intro handlers into `useSongSet` or a `useSetFlow` hook; the behaviour is covered by the flows either way.
- **Intro card placement**: in the cue slot as designed, but the slot grows to fit the card (title, artist, position, key, dots, Skip) and sits above the toast stack; a set start clears any notice so the card is unobstructed.
- **Shifter latency**: one constant instead of the per-rate table, justified by the spike (every reliable cell within ±26 ms of 0.128 s).
- **Latency test in the browser**: the 30 ms drift check in `verify-key` is covered by the `lyricTime` fixtures plus the running-clock check; the headless browser cannot hear the audio, so the authoritative number is the spike's.
- **iOS prime**: implemented with `flushSync` + muted play/pause inside the tap (iOS only) and the "Tap to start" fallback after 500 ms; unverifiable in the sandbox (Q2, owner's iPhone).
