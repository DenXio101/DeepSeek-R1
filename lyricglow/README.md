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
| **Playback** | Local MP3/MP4 via `URL.createObjectURL` (video becomes the full‑stage background). The built‑in demo plays a **synthesized melody + beat** (Web Audio, generated from each syllable's note) on a virtual clock, so ▶ is never silent; switch it off under **More → Singing**. Play / pause / restart / seek on the thumb bar; tempo 0.5–2× under **More → Speed**. |
| **Karaoke animation** | Syllable‑level data; words render joined ("Softly", not "Soft ly"). Each syllable reveals left→right over its own duration (slow syllables slowly, fast ones fast). The cue ball arcs to the next syllable `0.32 s / rate` ahead of the voice and bounces once per syllable. Finished words drop and leave a translucent ghost behind; the last word of each line gets a bounce/stretch/shake peak. Lines glide between slots. |
| **Find a song** | **Find song** opens a sheet: search synced lyrics on [LRCLIB](https://lrclib.net) (free, community, no key; several query shapes are tried and merged) and load them with one tap; plain-text results jump into Sync Studio. Add a backing track from a file or from **YouTube** — with a `VITE_YT_API_KEY` set, the app searches YouTube in place and auto-suggests videos for the chosen song; without one it opens YouTube pre-searched and you paste the link. The video becomes the stage and the karaoke syncs to its clock. Picking a video **auto-matches its lyrics** (title/artist cleaned from the video, LRCLIB version chosen by closest length); a banner warns whenever the demo lyrics are still showing over a real song; lyric results flag the version that "matches length" of your backing track. **Tap to sync** (More → Lyrics timing, or the "Different version?" hint) shows the next line and sets the lyric offset from one tap when the singer starts it; ±0.5 s chips and <kbd>[</kbd>/<kbd>]</kbd> fine-tune. |
| **Voice level** | For your own MP3/MP4: a **Voice** slider (default 35 %) uses centre-channel reduction to turn the original singer into a faint guide while keeping the band and the bass. Auto-bypasses on mono files. Not possible for YouTube (browsers hide its audio). |
| **Song sync** | Import `.lrc` (standard `[mm:ss.xx]` and enhanced `<mm:ss.xx>` word timing, Walaoke `M:`/`F:`/`D:` prefixes, `[v:]` tags, `[Chorus]`‑style section markers, `[offset:]`) or LyricGlow `.json`. Plain‑timed lines get syllable timing from a built‑in English syllable estimator. Export enhanced LRC or lossless JSON. |
| **Sync Studio** | Paste lyrics, pick voices per line, play the song and tap <kbd>Space</kbd> on every syllable (<kbd>Enter</kbd> ends a line, <kbd>Backspace</kbd> undoes, <kbd>Esc</kbd> play/pause, <kbd>,</kbd>/<kbd>.</kbd> adjust tap latency). Review with ±10/±50 ms nudge, re‑tap from any line, download, or use it in the player. The stage previews your timing live. |
| **Mic & scoring** | Web Audio pitch detection (McLeod Pitch Method, hand‑written). Pitch lane under the lyric with target bars per syllable, folded to one octave so your register doesn't matter. Per‑syllable pitch + timing scoring (timing‑only when a syllable has no note), combo multiplier, line ratings, S–E grade with a "Partial" flag. Easy/Normal/Hard tolerances and a mic‑latency slider. Nothing from the mic is routed to the speakers. |
| **Stage** | Audio‑reactive footlights and bass‑pulsing spotlights/vignette (from an analyser on your media, or a BPM‑synced pulse for the demo), 3‑2‑1 count‑in before lines after a gap, section title cards with a light sweep, ember bursts on peak words, a golden finale, fullscreen performance mode that hides the chrome after 3 s idle. Dark/light themes; lyrics sit in the upper half of the screen with the controls on a bottom **thumb bar** (Song · Restart · Play · oblong mic switch · More), so a phone held in one hand works in portrait and landscape. Honors `prefers-reduced-motion` plus an in‑app toggle. |

### YouTube search key (optional, 5 minutes)

1. Enable the API: <https://console.cloud.google.com/apis/library/youtube.googleapis.com> (create a project if asked).
2. Create a key: <https://console.cloud.google.com/apis/credentials> → *Create credentials → API key*.
3. Restrict it: *Websites* → your domain (e.g. `https://lyricglow.vercel.app/*`); *API restrictions* → YouTube Data API v3.
4. Set `VITE_YT_API_KEY=<key>` in Vercel (Project → Settings → Environment Variables) or in a local `.env.local`, then rebuild. The free quota is ~100 searches/day; the manual paste flow keeps working when the quota is spent.

### Typical flow for a real song

1. **Find song** → either search the lyrics first (type title + artist → **Use**), or go straight to step 2 and pick a YouTube video — the lyrics are matched automatically.
2. Backing track: **Audio / video file** from your device (then set **Voice** to taste), *or* tap a suggested YouTube video (with a key) / **Find on YouTube ↗** → paste the link → **Load**.
3. ▶ Play. If the words run early/late, **More → Tap to sync** and tap when the singer starts the shown line. Slide the mic switch on, sing.

YouTube notes: the player must stay visible (YouTube terms), the stage lights follow the song's BPM rather than the audio (browsers don't expose YouTube's sound), tempo snaps to YouTube's rates (0.5/0.75/1/1.25/1.5/2), and videos whose uploader disabled embedding show an error — try another upload.

### Keyboard (player)

<kbd>Space</kbd>/<kbd>K</kbd> play‑pause · <kbd>←</kbd>/<kbd>→</kbd> seek 5 s · <kbd>[</kbd>/<kbd>]</kbd> lyrics 0.1 s earlier/later · <kbd>F</kbd> performance mode · <kbd>M</kbd> microphone · <kbd>R</kbd> restart

### Tips for singing

- Wear headphones, otherwise the backing track gets scored instead of you.
- If your notes look early or late on the lane, adjust **Mic latency** under More → Singing (60 ms default).
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
  engine/      PlaybackEngine (single rAF clock; Transport = <audio>/<video> or YouTube; snapshots via useSyncExternalStore)
               Transport.ts (media adapter) · youtube.ts (IFrame API loader, URL parser, transport)
               KaraokeSession (active line, count‑ins, sections, scoring) · AudioGraph · PitchTracker
               pitch.ts (MPM) · scoring.ts (pure) · beat.ts
  model/       lyrics types/helpers · normalize · timeline · syllables · lrc · trackIO · lrclib (search client) · songMatch · sync (tap-to-sync)
  components/  Karaoke (imperative per‑frame DOM writes, rect cache) · CueBall math · PitchLane
               SpectrumCanvas · ParticleLayer · CountIn · SectionCard · ScoreHud · GradeScreen
               Header · ThumbBar (seek · Song · Restart · Play · MicSwitch · More) · MoreSheet · SyncControl/SyncCard
               ProgressRow · MediaElement · YouTubeStage · SongPanel · VocalControl
               SyncStudio/ (pure reducer + UI)
  hooks/       useOrientation · useReducedMotion · useFullscreen · useIdleHide · useHotkeys
```

The engine and session are framework‑free TypeScript that publish immutable snapshots — the equivalent of a ViewModel exposing `StateFlow`. Components are renderers of those snapshots; anything that changes every frame (reveal, cue ball, canvases, progress bar) is written to the DOM imperatively from one frame callback, so React renders only on coarse changes such as the active line.

Every interactive control and key display carries a `data-testid`; `scripts/` holds the fixture checks and the headless Playwright flows used during development live outside the repo.
