# LyricGlow

A personal stage karaoke player. Drop in an MP3 or MP4, load (or tap out) word‑timed lyrics, turn on the mic, and sing — with a conductor cue ball that leads every syllable, lyrics that light up with the tune, a SingStar‑style pitch lane, live scoring and an end‑of‑song grade, all on a lacquered stage that pulses with the music.

Built with React 19, TypeScript and Vite, plain CSS, **no runtime dependencies** beyond React, and nothing persisted in the browser (no localStorage / IndexedDB / cookies — files you export are downloaded to you).

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build
npm run lint         # eslint (react-hooks v7 + react-refresh)
npm run check:model  # fixture checks: syllables, LRC, round-trips, pitch, scoring
```

## What it does

| Area | Details |
|---|---|
| **Playback** | Local MP3/MP4 via `URL.createObjectURL` (video becomes the full‑stage background). A virtual clock plays the demo without any media. Play / pause / restart / seek / tempo 0.5–2×. |
| **Karaoke animation** | Syllable‑level data; words render joined ("Softly", not "Soft ly"). Each syllable reveals left→right over its own duration (slow syllables slowly, fast ones fast). The cue ball arcs to the next syllable `0.32 s / rate` ahead of the voice and bounces once per syllable. Finished words drop and leave a translucent ghost behind; the last word of each line gets a bounce/stretch/shake peak. Lines glide between slots. |
| **Song sync** | Import `.lrc` (standard `[mm:ss.xx]` and enhanced `<mm:ss.xx>` word timing, Walaoke `M:`/`F:`/`D:` prefixes, `[v:]` tags, `[Chorus]`‑style section markers, `[offset:]`) or LyricGlow `.json`. Plain‑timed lines get syllable timing from a built‑in English syllable estimator. Export enhanced LRC or lossless JSON. |
| **Sync Studio** | Paste lyrics, pick voices per line, play the song and tap <kbd>Space</kbd> on every syllable (<kbd>Enter</kbd> ends a line, <kbd>Backspace</kbd> undoes, <kbd>Esc</kbd> play/pause, <kbd>,</kbd>/<kbd>.</kbd> adjust tap latency). Review with ±10/±50 ms nudge, re‑tap from any line, download, or use it in the player. The stage previews your timing live. |
| **Mic & scoring** | Web Audio pitch detection (McLeod Pitch Method, hand‑written). Pitch lane under the lyric with target bars per syllable, folded to one octave so your register doesn't matter. Per‑syllable pitch + timing scoring (timing‑only when a syllable has no note), combo multiplier, line ratings, S–E grade with a "Partial" flag. Easy/Normal/Hard tolerances and a mic‑latency slider. Nothing from the mic is routed to the speakers. |
| **Stage** | Audio‑reactive footlights and bass‑pulsing spotlights/vignette (from an analyser on your media, or a BPM‑synced pulse for the demo), 3‑2‑1 count‑in before lines after a gap, section title cards with a light sweep, ember bursts on peak words, a golden finale, fullscreen performance mode that hides the chrome after 3 s idle. Dark/light themes; landscape is the primary performance layout, portrait stays usable. Honors `prefers-reduced-motion` plus an in‑app toggle. |

### Keyboard (player)

<kbd>Space</kbd>/<kbd>K</kbd> play‑pause · <kbd>←</kbd>/<kbd>→</kbd> seek 5 s · <kbd>F</kbd> performance mode · <kbd>M</kbd> microphone · <kbd>R</kbd> restart

### Tips for singing

- Wear headphones, otherwise the backing track gets scored instead of you.
- If your notes look early or late on the lane, adjust **Mic latency** in ⚙ (60 ms default).
- On iPhone, routing media through Web Audio is irreversible and follows the ringer switch, so the stage lights default off there; turn them on from the header.

## Lyric formats

**Enhanced LRC** (what *Export LRC* writes, readable by other players):

```
[ti:Embers & Light]
[ar:LyricGlow Demo]
[bpm:78]
[offset:+0]
[lg-section:00:02.00|Intro]
[00:02.00]D: <00:02.00>Soft<00:02.50>ly<00:03.00> <00:03.20>now <00:03.90>the <00:04.30>light <00:05.00>fades<00:05.50>
```

- A token without trailing whitespace continues the same word (`Soft` + `ly`).
- An empty `<time>` tag closes the previous syllable early (inter‑word gaps) or the line (last tag).
- `[lg-section:time|Name]` carries sections; other players ignore it.

**LyricGlow JSON** (`format: "lyricglow-track"`, version 1) is the `Track` type below plus the format header. It is the only format that keeps the melody (`note`).

```ts
type Voice = "male" | "female" | "duet";
interface Syllable { text; start; end; wordEnd; wordIndex; emphasis?; note?: number /* MIDI */ }
interface Line { id; voice; section; syllables; start; end }
interface Track { title; artist; bpm; lines; offset?; duration?; beatOffset?; sections?; source? }
```

## Architecture (Compose‑friendly)

```
src/
  engine/      PlaybackEngine (single rAF clock for demo + media, snapshots via useSyncExternalStore)
               KaraokeSession (active line, count‑ins, sections, scoring) · AudioGraph · PitchTracker
               pitch.ts (MPM) · scoring.ts (pure) · beat.ts
  model/       lyrics types/helpers · normalize · timeline · syllables · lrc · trackIO
  components/  Karaoke (imperative per‑frame DOM writes, rect cache) · CueBall math · PitchLane
               SpectrumCanvas · ParticleLayer · CountIn · SectionCard · ScoreHud · GradeScreen
               Header · ControlsDock · ProgressRow · MediaElement · LibraryButtons · MicControls
               SyncStudio/ (pure reducer + UI)
  hooks/       useOrientation · useReducedMotion · useFullscreen · useIdleHide · useHotkeys
```

The engine and session are framework‑free TypeScript that publish immutable snapshots — the equivalent of a ViewModel exposing `StateFlow`. Components are renderers of those snapshots; anything that changes every frame (reveal, cue ball, canvases, progress bar) is written to the DOM imperatively from one frame callback, so React renders only on coarse changes such as the active line.

Every interactive control and key display carries a `data-testid`; `scripts/` holds the fixture checks and the headless Playwright flows used during development live outside the repo.
