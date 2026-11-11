# Feature concept — "Finish the KaraFun set" for LyricGlow

* **Author:** Dennis Valencia (repo owner)
* **Date:** 2026-11-10
* **App:** LyricGlow, a browser karaoke stage (React 19 + TypeScript + Vite, plain CSS), live at https://lyricglow.vercel.app, also an installable PWA with Capacitor shells. Source: `lyricglow/` in this repo, branch `claude/lyricglow-karaoke-app-ugIUj`, HEAD `c6c0951`.

## Anchored hypothesis

LyricGlow already shows lyrics the way KaraFun does (three white lines, colour wipe per word, sung lines slide out). The user wants the remaining KaraFun "player" features so a session feels like a karaoke machine rather than a lyrics viewer:

1. **Key change** in semitone steps and **tempo change** without the chipmunk effect, for songs loaded as local audio/video files.
2. A **song intro card** (title, artist, countdown) before the music starts, and a **queue** so several songs play one after another in a session.
3. A **Vocals on/off** button on the bottom thumb bar (KaraFun style) for local files, replacing or complementing the Voice slider that lives under More.

Success = a user with a few MP3s on the phone can line up three songs, start the set, get a title card and countdown before each, drop the key by two semitones on one of them, and switch the original vocal off with one tap, with the lyrics staying in sync throughout.

## Confirmed requirements (user's words / picks)

- The user picked "Finish the KaraFun set" from: finish the KaraFun set / harden what exists / song library and sessions / other.
- Earlier, picking which KaraFun parts to copy, the user chose only "Lyrics display" (now built). The three items above were the unpicked options from that same question, described as: *"Change key up/down by semitones and tempo without the chipmunk effect, like KaraFun's Key/Tempo buttons. Works on local files only; YouTube audio cannot be processed."* / *"Title card with artist and a 3-2-1 countdown before the music, fade in/out, and a queue so songs play one after another in the session."* / *"A single Vocals on/off switch on the thumb bar (KaraFun style) instead of the Voice slider in More. Local files only."*
- Standing rules from the project brief: **no localStorage, sessionStorage, IndexedDB or cookies** — all state lives in React; downloading files to the user is fine. Every control carries a `data-testid`. `tsc`, `eslint`, `vite build` and `npm run check:model` must stay clean. Mobile-first (thumb bar at the bottom, lyrics in the upper half).

## Facts about the existing system (verified in code)

**Audio path (local files)** — `src/engine/AudioGraph.ts`
- One `MediaElementAudioSourceNode` per `<audio>/<video>` element (WeakMap; the API allows only one per element ever). It feeds `createVocalChain()` → `ctx.destination`.
- The vocal chain is a centre-channel reducer: out = v·original + (1−v)·(L−R side + low-passed mono bass). `setVocalLevel(el, v)`; `vocalSourceIsMono(el)` detects mono files (reduction would mute them) and the UI bypasses.
- The stage analyser is tapped after the vocal chain. The mic path never reaches the destination.
- `useVocalLevel` hook in `src/hooks/useVocalLevel.ts` applies the level (default 0.35) and the mono verdict; `VocalControl.tsx` is the slider under More → "Original singer's voice".

**Clock & tempo** — `src/engine/PlaybackEngine.ts`, `src/engine/Transport.ts`
- One rAF loop. For files, time comes from `el.currentTime` with bounded extrapolation and a glide against fresh reports. `engine.setRate(r)` (0.5–2.0) sets `el.playbackRate`; browsers pitch-preserve by default (`preservesPitch` true) — so tempo via playbackRate already avoids the chipmunk effect for *tempo*, but there is **no pitch/key control at all** today.
- Lyric time = `frame.time + track.offset`; all consumers (Karaoke, PitchLane, DemoSynth, GuideSynth, scoring) read the engine clock, so tempo changes keep lyrics in sync automatically. A key change must not touch the clock.
- YouTube backing tracks run through the IFrame player; no audio access, so key/vocals cannot apply there (tempo snaps to YouTube's fixed rates).

**Session flow** — `src/App.tsx`, `src/engine/KaraokeSession.ts`
- `BackingSource` = none | file {url, mediaKind, name} | youtube {videoId} | listen. One `track` (lyrics) in React state; `source` separate. Loading lyrics: `loadTrack(t, note)` pauses + seeks 0. Loading a file: `handleFileUpload` creates an object URL and sets the source; object URLs are revoked on change.
- End of song: `session.finished` → embers → `GradeScreen` (Sing again / Close). No notion of "next song".
- Count-in: `timeline.countIns` (3-2-1 dots before lines after a gap) rendered by `CountIn` in the cue slot; `SectionCard` shows section names.
- Guide cue (`GuideSynth`) and demo melody (`DemoSynth`) schedule against the engine clock; the demo melody uses each syllable's MIDI note (so a key change should transpose it too, or be disabled on the demo).

**UI** — `src/components/ThumbBar.tsx` (seek row + Song · Restart · Play · Mic switch · More; five targets, 50 px, play 66 px; verified to fit 320 px wide), `MoreSheet.tsx` (Lyrics timing, Speed slider `tempo-slider`, Voice slider, Singing, Display incl. Lyrics style segmented control, Files & tools, Keyboard), `SongPanel.tsx` (Listen, lyrics search, backing track, timing). `MicSwitch.tsx` is an oblong switch with `role="switch"`.

**Tests** — `scripts/check-model.ts` fixtures (`npm run check:model`); headless Playwright flows kept outside the repo in the session scratchpad (`verify-*.mjs`), run against `vite --port 5173` with mocked LRCLIB/YouTube/recognition.

**Platform notes** — Web Audio only; no server-side audio. iOS Safari: AudioContext must be created in a user gesture (already handled in `engine.setBeforePlay`). Pitch shifting in Web Audio has no built-in node; options are (a) an `AudioWorklet` running a phase-vocoder / granular (OLA/WSOLA) shifter, (b) a `playbackRate` ratio + resampling trick (changes tempo too, so needs time-stretch to compensate), (c) a third-party JS library (e.g. SoundTouchJS, ~30 KB, LGPL) in a worklet.

## Open unknowns (for the lenses)

- U1 Which pitch-shift approach gives acceptable quality on a mid-range phone within CPU budget (a mono/stereo worklet at 48 kHz, 128-frame quanta) — and does it introduce latency that breaks lyric sync (needs a fixed, compensable delay)?
- U2 Where does the key shifter sit relative to the vocal chain, the analyser tap and the mono detector? Does shifting before the chain change the centre-cancel maths?
- U3 Should key/tempo persist per song in the queue, reset per song, or carry across the set?
- U4 Queue semantics: what is "a song" in the queue — lyrics + backing file together? Files are object URLs that we currently revoke on switch; a queue must hold several. Memory for several video files?
- U5 Intro card: how long, is it skippable, does it replace the first count-in, does it apply to YouTube/Listen sources (where we don't control the start)?
- U6 Vocals on/off vs. the existing slider: single toggle (0 % ↔ current level) or three-state (off / light / full)? What happens on mono files (today: bypass + note)?
- U7 Does the demo track get key/tempo too (its melody is synthesized, so transposition is trivial), and should the guide hum follow the key?
- U8 Thumb bar has five targets; adding Vocals makes six at 320 px. Replace Restart? Move Restart into the seek row?
- U9 Auto-match lyrics for queued files (file name → LRCLIB) — in scope or a later step?
