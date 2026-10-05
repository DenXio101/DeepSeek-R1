import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import Karaoke from "./Karaoke";
import demoTrack from "./demoTrack";
import type { Track } from "./lyrics";
import { normalizeTrack } from "./model/normalize";
import { buildTimeline } from "./model/timeline";
import { usePlaybackEngine } from "./engine/usePlaybackEngine";
import { useKaraokeSession } from "./engine/useKaraokeSession";
import { useIsLandscape } from "./hooks/useOrientation";
import Header, { type Theme } from "./components/Header";
import ThumbBar from "./components/ThumbBar";
import MoreSheet from "./components/MoreSheet";
import { SyncCard } from "./components/SyncControl";
import { formatOffset } from "./model/sync";
import MediaElement, { type MediaKind } from "./components/MediaElement";
import YouTubeStage from "./components/YouTubeStage";
import SongPanel, { type BackingSource, type YouTubeCandidate } from "./components/SongPanel";
import MosaicBackdrop from "./components/MosaicBackdrop";
import { searchLyrics, studioTextFromHit, trackFromHit, type LyricsSearchHit } from "./model/lrclib";
import { cleanVideoTitle, pickLyricsForVideo, trackMatchesVideo, type VideoMeta } from "./model/songMatch";
import { fetchVideoMeta, youtubeApiKey } from "./model/youtubeSearch";
import SyncStudio from "./components/SyncStudio/SyncStudio";
import { initStudio, studioReducer } from "./components/SyncStudio/studioReducer";
import SpectrumCanvas from "./components/SpectrumCanvas";
import { useAudioGraph } from "./engine/useAudioGraph";
import { isIOS, useReducedMotion, type EffectsLevel } from "./hooks/useReducedMotion";
import { PitchTracker } from "./engine/PitchTracker";
import { DemoSynth } from "./engine/DemoSynth";
import type { Difficulty } from "./engine/scoring";
import PitchLane from "./components/PitchLane";
import ScoreHud from "./components/ScoreHud";
import GradeScreen from "./components/GradeScreen";
import ParticleLayer, { type StageFx } from "./components/ParticleLayer";
import CountIn from "./components/CountIn";
import SectionCard from "./components/SectionCard";
import { useFullscreen } from "./hooks/useFullscreen";
import { useIdleHide } from "./hooks/useIdleHide";
import { useHotkeys } from "./hooks/useHotkeys";
import { useVocalLevel } from "./hooks/useVocalLevel";
import type { Point } from "./components/CueBall";
import type { Voice } from "./lyrics";
import { importLyricsText } from "./model/trackIO";
import "./styles.css";

/** lyrics and backing track lengths this far apart usually mean a different version → offer Tap to sync */
const VERSION_MISMATCH_S = 3;
/** how many embed-blocked official uploads to skip past automatically */
const MAX_HOPS = 3;


export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [track, setTrack] = useState<Track>(() => normalizeTrack(demoTrack));
  const [notice, setNotice] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [mode, setMode] = useState<"perform" | "studio">("perform");
  const [studio, dispatchStudio] = useReducer(studioReducer, undefined, initStudio);
  const [previewTrack, setPreviewTrack] = useState<Track | null>(null);
  const [visualizer, setVisualizer] = useState<boolean>(() => !isIOS());
  const [effects, setEffects] = useState<EffectsLevel>("auto");
  const reducedMotion = useReducedMotion(effects);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [micLatencyMs, setMicLatencyMs] = useState(60);
  const [demoSound, setDemoSound] = useState(true);
  const [vocalLevel, setVocalLevel] = useState(0.35);
  const iosHintShown = useRef(false);
  const [gradeDismissed, setGradeDismissed] = useState(-1);
  const fxRef = useRef<StageFx | null>(null);
  const onPeak = useCallback((p: Point, voice: Voice) => fxRef.current?.emit(p, voice), []);
  const fullscreen = useFullscreen();
  const shownTrack = mode === "studio" && previewTrack ? previewTrack : track;
  const [source, setSource] = useState<BackingSource>({ kind: "none" });
  const [songOpen, setSongOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hintDismissedFor, setHintDismissedFor] = useState("");
  const [songFocusLyrics, setSongFocusLyrics] = useState(0);
  const [backingMeta, setBackingMeta] = useState<VideoMeta | null>(null);
  const ytQueueRef = useRef<{ videoId: string; rest: YouTubeCandidate[]; hops: number } | null>(null);
  const autoMatchRef = useRef(0);
  // latest track for async callbacks
  const trackRef = useRef<Track | null>(null);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);
  const media = source.kind === "file" ? source : null;
  const isLandscape = useIsLandscape();

  const timeline = useMemo(() => buildTimeline(shownTrack), [shownTrack]);
  const { engine, playback } = usePlaybackEngine();
  const { graph, mic } = useAudioGraph();
  const { session: sessionObj, state: session } = useKaraokeSession(engine, timeline);
  const tracker = useMemo(() => new PitchTracker(graph), [graph]);
  const micOn = mic.status === "on";
  const vocalMono = useVocalLevel(engine, graph, media && playback.sourceKind === "media" ? media.url : null, vocalLevel);

  // mic → pitch tracker → session scoring
  useEffect(() => {
    if (!micOn) return;
    return tracker.attach(engine);
  }, [micOn, tracker, engine]);
  useEffect(() => {
    tracker.setOffset(shownTrack.offset ?? 0);
  }, [tracker, shownTrack]);
  useEffect(() => {
    sessionObj.setScoring(micOn ? tracker : null, { difficulty, micLatency: micLatencyMs / 1000 });
  }, [sessionObj, micOn, tracker, difficulty, micLatencyMs]);

  const toggleMic = useCallback(() => {
    if (mic.status === "on" || mic.status === "requesting") graph.disableMic();
    else {
      graph.ensureContext();
      graph.resume();
      void graph.enableMic();
    }
  }, [graph, mic.status]);

  // finale embers once per finish, then the grade card after a beat
  const finaleKey = session.finished ? session.generation : -1;
  const [gradeReadyKey, setGradeReadyKey] = useState(-1);
  useEffect(() => {
    if (finaleKey < 0) return;
    if (reducedMotion) {
      const id = window.setTimeout(() => setGradeReadyKey(finaleKey), 0);
      return () => window.clearTimeout(id);
    }
    fxRef.current?.finale();
    const id = window.setTimeout(() => setGradeReadyKey(finaleKey), 1700);
    return () => window.clearTimeout(id);
  }, [finaleKey, reducedMotion]);

  // performance mode: hide chrome after 3 s idle while playing fullscreen
  const chromeHidden = useIdleHide(fullscreen.active && playback.playing && mode === "perform" && !syncing, 3000);

  const nudgeLyrics = useCallback((delta: number) => {
    setTrack((t) => ({ ...t, offset: Math.round(((t.offset ?? 0) + delta) * 100) / 100 }));
  }, []);

  useHotkeys(
    {
      Space: () => engine.toggle(),
      k: () => engine.toggle(),
      f: () => fullscreen.toggle(),
      ArrowLeft: () => engine.seek(engine.frame.time - 5),
      ArrowRight: () => engine.seek(engine.frame.time + 5),
      m: () => toggleMic(),
      r: () => engine.restart(),
      "[": () => nudgeLyrics(-0.1),
      "]": () => nudgeLyrics(0.1),
      Escape: () => setSyncing(false),
    },
    mode === "perform" && !songOpen && !moreOpen,
  );

  const singAgain = useCallback(() => {
    sessionObj.resetScore();
    setGradeDismissed(-1);
    engine.restart();
  }, [sessionObj, engine]);

  // AudioContext must be created/resumed inside the user's Play gesture
  useEffect(() => {
    engine.setBeforePlay(() => {
      if (graph.ctx || engine.getSnapshot().sourceKind === "demo") graph.ensureContext();
      graph.resume();
    });
    return () => engine.setBeforePlay(null);
  }, [engine, graph]);

  // the demo sings: synthesized melody + beat while no backing track is loaded
  const isDemoSource = playback.sourceKind === "demo";
  useEffect(() => {
    if (!isDemoSource || !demoSound || mode === "studio") return;
    const synth = new DemoSynth(graph, timeline);
    return synth.attach(engine);
  }, [isDemoSource, demoSound, mode, graph, timeline, engine]);

  useEffect(() => {
    if (playback.playing && isDemoSource && demoSound && isIOS() && !iosHintShown.current) {
      iosHintShown.current = true;
      setNotice({ kind: "info", text: "Demo melody playing. Hear nothing on iPhone? Flip the silent switch off and turn the volume up." });
    }
  }, [playback.playing, isDemoSource, demoSound]);

  // route uploaded media through the analyser when the visualizer is on
  useEffect(() => {
    if (!visualizer || playback.sourceKind !== "media") return;
    const el = engine.mediaElement;
    if (el) graph.attachMedia(el);
  }, [visualizer, playback.sourceKind, engine, graph]);

  useEffect(() => {
    engine.setDemoDuration(timeline.duration);
  }, [engine, timeline]);

  // object URL lifecycle
  const fileUrl = media?.url;
  useEffect(() => () => {
    if (fileUrl) URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);

  const handleFileUpload = useCallback((file: File) => {
    // create the context inside the gesture that chose the file (analyser + vocal chain)
    graph.ensureContext();
    graph.resume();
    const url = URL.createObjectURL(file);
    const kind: MediaKind = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name) ? "video" : "audio";
    setSource({ kind: "file", url, mediaKind: kind, name: file.name });
    setBackingMeta(null);
    autoMatchRef.current++;
    setSongOpen(false);
    setMoreOpen(false);
  }, [graph]);

  const handleYouTube = useCallback(
    (videoId: string, meta?: VideoMeta, alternates?: YouTubeCandidate[]) => {
      setSource({ kind: "youtube", videoId });
      setSongOpen(false);
      setBackingMeta(meta ?? null);
      // remember the other official uploads so an embed-blocked pick can hop to the next one
      ytQueueRef.current = alternates ? { videoId, rest: alternates, hops: ytQueueRef.current?.videoId === videoId ? ytQueueRef.current.hops : 0 } : null;
      setNotice({ kind: "info", text: "Loading YouTube video… press ▶ when it appears." });

      // auto-match lyrics unless the loaded track already is this song
      const run = ++autoMatchRef.current;
      const key = youtubeApiKey();
      const resolveMeta: Promise<VideoMeta | null> = meta ? Promise.resolve(meta) : key ? fetchVideoMeta(videoId, key) : Promise.resolve(null);
      void resolveMeta.then(async (m) => {
        if (run !== autoMatchRef.current) return;
        if (!m) return;
        setBackingMeta(m);
        const current = trackRef.current;
        if (current && current.source !== "demo" && trackMatchesVideo(current.title, current.artist, m)) return;
        const { query, title } = cleanVideoTitle(m.title, m.channel);
        try {
          const hits = await searchLyrics(query || title);
          if (run !== autoMatchRef.current) return;
          const best = pickLyricsForVideo(hits, m);
          if (best) {
            const t = trackFromHit(best);
            setTrack(t);
            engine.seek(0);
            setNotice({ kind: "info", text: `Lyrics auto-matched: ${best.title} — ${best.artist}. Wrong song? Find song → step 1.` });
          } else {
            setNotice({ kind: "error", text: `No timed lyrics found for "${title}". Search them in Find song → step 1, or Time it in Sync Studio.` });
          }
        } catch {
          setNotice({ kind: "error", text: "Couldn't look up lyrics for this video — search them in Find song → step 1." });
        }
      });
    },
    [engine],
  );

  /** embed-blocked (101/150) or missing (100) official upload → try the next candidate, at most MAX_HOPS times */
  const handleYouTubeError = useCallback(
    (message: string, code?: number) => {
      const q = ytQueueRef.current;
      if ((code === 101 || code === 150 || code === 100) && q && q.rest.length && q.hops < MAX_HOPS) {
        const [next, ...rest] = q.rest;
        ytQueueRef.current = { videoId: next.videoId, rest, hops: q.hops + 1 };
        handleYouTube(next.videoId, next.meta, rest);
        setNotice({ kind: "info", text: `That upload can't be embedded — trying the next official video (${next.meta.title})…` });
        return;
      }
      setNotice({ kind: "error", text: message });
    },
    [handleYouTube],
  );

  const clearSource = useCallback(() => {
    setSource({ kind: "none" });
    setBackingMeta(null);
    ytQueueRef.current = null;
    autoMatchRef.current++;
  }, []);

  const openSongLyrics = useCallback(() => {
    setSongFocusLyrics((n) => n + 1);
    setSongOpen(true);
  }, []);

  const loadTrack = useCallback(
    (t: Track, note: string) => {
      setTrack(t);
      engine.pause();
      engine.seek(0);
      setNotice({ kind: "info", text: note });
    },
    [engine],
  );

  const pickSynced = useCallback(
    (hit: LyricsSearchHit) => {
      try {
        const t = trackFromHit(hit);
        loadTrack(t, `Loaded "${hit.title}" — ${t.lines.length} timed lines. Now add a backing track.`);
      } catch (err: unknown) {
        setNotice({ kind: "error", text: err instanceof Error ? err.message : "Couldn't use those lyrics." });
      }
    },
    [loadTrack],
  );

  const pickPlain = useCallback((hit: LyricsSearchHit) => {
    dispatchStudio({ type: "setText", text: studioTextFromHit(hit) });
    dispatchStudio({ type: "setMeta", title: hit.title, artist: hit.artist });
    dispatchStudio({ type: "parse" });
    setSongOpen(false);
    setMode("studio");
    setNotice({ kind: "info", text: `"${hit.title}" has no timing yet — add a backing track, then tap it out in Sync Studio.` });
  }, []);

  const sourceKey = source.kind === "file" ? source.url : source.kind === "youtube" ? source.videoId : "";
  const startTapSync = useCallback(() => {
    setMoreOpen(false);
    setHintDismissedFor(sourceKey);
    setSyncing(true);
    if (!engine.getSnapshot().playing) engine.play();
  }, [engine, sourceKey]);

  const applyTapSync = useCallback(
    (offset: number) => {
      setTrack((t) => ({ ...t, offset }));
      setSyncing(false);
      setNotice({ kind: "info", text: `Lyrics timing set to ${formatOffset(offset)}. Still off? More → Lyrics timing.` });
    },
    [],
  );

  const handleImportFile = useCallback(
    (file: File) => {
      setMoreOpen(false);
      file
        .text()
        .then((text) => {
          const r = importLyricsText(file.name, text);
          setTrack(r.track);
          engine.pause();
          engine.seek(0);
          const w = r.warnings.length ? ` · ${r.warnings.join(" ")}` : "";
          setNotice({ kind: "info", text: `Loaded ${r.track.lines.length} lines from ${file.name}${w}` });
        })
        .catch((err: unknown) => {
          setNotice({ kind: "error", text: err instanceof Error ? err.message : "Could not read that file." });
        });
    },
    [engine],
  );

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), notice.kind === "error" ? 9000 : 5000);
    return () => window.clearTimeout(id);
  }, [notice]);

  const applyStudioTrack = useCallback(
    (t: Track) => {
      setTrack(t);
      setPreviewTrack(null);
      setMode("perform");
      engine.pause();
      engine.seek(0);
      setNotice({ kind: "info", text: `Studio timing applied: ${t.lines.length} lines.` });
    },
    [engine],
  );

  const sectionIdx = session.activeIdx >= 0 ? session.activeIdx : Math.min(shownTrack.lines.length - 1, Math.max(0, session.cursorIdx - 1));
  const activeSection = session.activeIdx >= 0 || session.cursorIdx > 0 ? shownTrack.lines[sectionIdx]?.section ?? null : null;

  const backingDuration = backingMeta?.duration || (source.kind === "file" ? playback.duration : 0);
  const demoMismatch = mode === "perform" && source.kind !== "none" && track.source === "demo" && !songOpen;
  const versionMismatch =
    mode === "perform" &&
    !demoMismatch &&
    source.kind !== "none" &&
    backingDuration > 0 &&
    (track.duration ?? 0) > 0 &&
    Math.abs((track.duration ?? 0) - backingDuration) > VERSION_MISMATCH_S;
  const toggleVisualizer = () => {
    const next = !visualizer;
    setVisualizer(next);
    if (next) {
      graph.ensureContext();
      graph.resume();
    }
  };

  return (
    <div
      className={`app-root theme-${theme}`}
      data-theme={theme}
      data-landscape={String(isLandscape)}
      data-media={source.kind === "file" ? source.mediaKind : source.kind}
      data-mode={mode}
      data-motion={reducedMotion ? "reduced" : "full"}
      data-chrome={chromeHidden ? "hidden" : "visible"}
      data-fullscreen={String(fullscreen.active)}
      data-syncing={String(syncing && mode === "perform")}
      data-testid="app-root"
    >
      <div className="stage-bg" aria-hidden="true">
        <div className="stage-grain" />
        {source.kind === "none" || (source.kind === "file" && source.mediaKind === "audio") ? (
          <MosaicBackdrop engine={engine} theme={theme} reducedMotion={reducedMotion} />
        ) : null}
        <div className="stage-vignette" />
        <div className="stage-spotlight stage-spotlight--left" />
        <div className="stage-spotlight stage-spotlight--right" />
        <div className="stage-spotlight stage-spotlight--center" />
      </div>

      {media && <MediaElement key={media.url} engine={engine} kind={media.mediaKind} src={media.url} />}
      {source.kind === "youtube" && (
        <YouTubeStage
          key={source.videoId}
          engine={engine}
          videoId={source.videoId}
          onError={handleYouTubeError}
          onReady={() => setNotice((prev) => (prev && !prev.text.startsWith("Loading YouTube") ? prev : { kind: "info", text: "YouTube ready — press ▶ to sing." }))}
        />
      )}

      <SpectrumCanvas engine={engine} graph={graph} timeline={timeline} visible={visualizer} reducedMotion={reducedMotion} theme={theme} />

      <div className="lyric-overlay">
        <div className="stage-toasts" data-testid="stage-toasts">
          {demoMismatch && (
            <div className="lyrics-mismatch" role="status" data-testid="lyrics-mismatch">
              <span>
                Showing the <strong>demo lyrics</strong> — they won't match this song.
              </span>
              <button type="button" className="dock-btn dock-btn--accent" onClick={openSongLyrics} data-testid="lyrics-mismatch-fix">
                Find this song's lyrics →
              </button>
            </div>
          )}
          {versionMismatch && !syncing && hintDismissedFor !== sourceKey && (
            <button type="button" className="sync-hint" onClick={startTapSync} data-testid="sync-hint">
              Different version of the song? <strong>Tap to sync →</strong>
            </button>
          )}
          {mic.status === "error" && mic.message && mode === "perform" && (
            <div className="notice notice--error" role="alert" data-testid="mic-status">
              {mic.message}
            </div>
          )}
          {notice && (
            <div
              className={`notice notice--${notice.kind}`}
              role={notice.kind === "error" ? "alert" : "status"}
              data-testid={notice.kind === "error" ? "import-error" : "import-notice"}
            >
              {notice.text}
              <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss message" data-testid="notice-close">
                ×
              </button>
            </div>
          )}
        </div>

        <div className="cue-slot" data-testid="cue-slot">
          <CountIn countIn={session.countIn} />
          <SectionCard event={session.sectionEvent} />
        </div>
        {syncing && mode === "perform" && <SyncCard engine={engine} track={track} onApply={applyTapSync} onCancel={() => setSyncing(false)} />}

        <Karaoke
          engine={engine}
          timeline={timeline}
          activeIdx={session.activeIdx}
          cursorIdx={session.cursorIdx}
          generation={session.generation}
          isLandscape={isLandscape}
          reducedMotion={reducedMotion}
          onPeak={onPeak}
        />
        {micOn && (
          <PitchLane
            engine={engine}
            timeline={timeline}
            tracker={tracker}
            session={sessionObj}
            activeIdx={session.activeIdx}
            cursorIdx={session.cursorIdx}
            reducedMotion={reducedMotion}
            micLatency={micLatencyMs / 1000}
          />
        )}
      </div>
      <ParticleLayer enabled={!reducedMotion} theme={theme} fxRef={fxRef} />

      {session.score && mode === "perform" && <ScoreHud score={session.score} />}

      {session.finished && mode === "perform" && gradeReadyKey === session.generation && gradeDismissed !== session.generation && (
        <GradeScreen
          title={shownTrack.title}
          summary={session.summary}
          micOn={micOn}
          onSingAgain={singAgain}
          onClose={() => setGradeDismissed(session.generation)}
        />
      )}

      <Header
        title={shownTrack.title}
        artist={media ? `${shownTrack.artist || "—"} · ${media.name}` : source.kind === "youtube" ? `${shownTrack.artist || "—"} · YouTube` : shownTrack.artist}
        section={activeSection}
        fullscreen={fullscreen.active}
        onToggleFullscreen={fullscreen.toggle}
      />

      <SongPanel
        open={songOpen}
        onClose={() => setSongOpen(false)}
        track={track}
        source={source}
        onPickSynced={pickSynced}
        onPickPlain={pickPlain}
        onFile={handleFileUpload}
        onYouTube={handleYouTube}
        onClearSource={clearSource}
        onNudge={nudgeLyrics}
        backingDuration={backingDuration}
        backingMeta={backingMeta}
        focusLyrics={songFocusLyrics > 0}
      />

      <MoreSheet
        open={moreOpen && mode === "perform"}
        onClose={() => setMoreOpen(false)}
        engine={engine}
        playback={playback}
        track={track}
        onNudge={nudgeLyrics}
        onStartTapSync={startTapSync}
        showVocal={!!media && playback.sourceKind === "media" && graph.supported}
        vocalLevel={vocalLevel}
        vocalMono={vocalMono}
        onVocalLevel={setVocalLevel}
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        micLatencyMs={micLatencyMs}
        onMicLatency={setMicLatencyMs}
        demoSound={demoSound}
        onDemoSound={setDemoSound}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        visualizer={visualizer}
        onToggleVisualizer={toggleVisualizer}
        effects={effects}
        onToggleEffects={() => setEffects((e) => (e === "reduced" ? "auto" : "reduced"))}
        onMediaFile={handleFileUpload}
        onLyricsFile={handleImportFile}
        onOpenStudio={() => {
          setMoreOpen(false);
          setSyncing(false);
          setMode("studio");
        }}
      />

      {mode === "studio" ? (
        <SyncStudio
          engine={engine}
          playback={playback}
          state={studio}
          dispatch={dispatchStudio}
          onPreview={setPreviewTrack}
          onApply={applyStudioTrack}
          onClose={() => setMode("perform")}
        />
      ) : (
        <ThumbBar
          engine={engine}
          playback={playback}
          mic={mic}
          onToggleMic={toggleMic}
          onFindSong={() => setSongOpen(true)}
          onMore={() => setMoreOpen((o) => !o)}
          moreOpen={moreOpen}
        />
      )}
    </div>
  );
}
