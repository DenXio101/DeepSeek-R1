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
import ControlsDock from "./components/ControlsDock";
import MediaElement, { type MediaKind } from "./components/MediaElement";
import YouTubeStage from "./components/YouTubeStage";
import SongPanel, { type BackingSource } from "./components/SongPanel";
import { studioTextFromHit, trackFromHit, type LyricsSearchHit } from "./model/lrclib";
import { IconSearch } from "./components/Icons";
import LibraryButtons from "./components/LibraryButtons";
import SyncStudio from "./components/SyncStudio/SyncStudio";
import { initStudio, studioReducer } from "./components/SyncStudio/studioReducer";
import { IconSparkle, IconStudio } from "./components/Icons";
import SpectrumCanvas from "./components/SpectrumCanvas";
import { useAudioGraph } from "./engine/useAudioGraph";
import { isIOS, useReducedMotion, type EffectsLevel } from "./hooks/useReducedMotion";
import { PitchTracker } from "./engine/PitchTracker";
import { DemoSynth } from "./engine/DemoSynth";
import type { Difficulty } from "./engine/scoring";
import PitchLane from "./components/PitchLane";
import ScoreHud from "./components/ScoreHud";
import GradeScreen from "./components/GradeScreen";
import MicControls from "./components/MicControls";
import ParticleLayer, { type StageFx } from "./components/ParticleLayer";
import CountIn from "./components/CountIn";
import SectionCard from "./components/SectionCard";
import { useFullscreen } from "./hooks/useFullscreen";
import { useIdleHide } from "./hooks/useIdleHide";
import { useHotkeys } from "./hooks/useHotkeys";
import { IconExitFullscreen, IconFullscreen } from "./components/Icons";
import type { Point } from "./components/CueBall";
import type { Voice } from "./lyrics";
import { importLyricsText } from "./model/trackIO";
import "./styles.css";


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
  const iosHintShown = useRef(false);
  const [gradeDismissed, setGradeDismissed] = useState(-1);
  const fxRef = useRef<StageFx | null>(null);
  const onPeak = useCallback((p: Point, voice: Voice) => fxRef.current?.emit(p, voice), []);
  const fullscreen = useFullscreen();
  const shownTrack = mode === "studio" && previewTrack ? previewTrack : track;
  const [source, setSource] = useState<BackingSource>({ kind: "none" });
  const [songOpen, setSongOpen] = useState(false);
  const media = source.kind === "file" ? source : null;
  const isLandscape = useIsLandscape();

  const timeline = useMemo(() => buildTimeline(shownTrack), [shownTrack]);
  const { engine, playback } = usePlaybackEngine();
  const { graph, mic } = useAudioGraph();
  const { session: sessionObj, state: session } = useKaraokeSession(engine, timeline);
  const tracker = useMemo(() => new PitchTracker(graph), [graph]);
  const micOn = mic.status === "on";

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
  const chromeHidden = useIdleHide(fullscreen.active && playback.playing && mode === "perform", 3000);

  useHotkeys(
    {
      Space: () => engine.toggle(),
      k: () => engine.toggle(),
      f: () => fullscreen.toggle(),
      ArrowLeft: () => engine.seek(engine.frame.time - 5),
      ArrowRight: () => engine.seek(engine.frame.time + 5),
      m: () => toggleMic(),
      r: () => engine.restart(),
    },
    mode === "perform" && !songOpen,
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
    // create the context inside the gesture that chose the file
    if (visualizer) graph.ensureContext();
    const url = URL.createObjectURL(file);
    const kind: MediaKind = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name) ? "video" : "audio";
    setSource({ kind: "file", url, mediaKind: kind, name: file.name });
    setSongOpen(false);
  }, [graph, visualizer]);

  const handleYouTube = useCallback((videoId: string) => {
    setSource({ kind: "youtube", videoId });
    setSongOpen(false);
    setNotice({ kind: "info", text: "Loading YouTube video… press ▶ when it appears." });
  }, []);

  const clearSource = useCallback(() => {
    setSource({ kind: "none" });
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

  const nudgeLyrics = useCallback((delta: number) => {
    setTrack((t) => ({ ...t, offset: Math.round(((t.offset ?? 0) + delta) * 100) / 100 }));
  }, []);

  const handleImportFile = useCallback(
    (file: File) => {
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
      data-testid="app-root"
    >
      <div className="stage-bg" aria-hidden="true">
        <div className="stage-grain" />
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
          onError={(m) => setNotice({ kind: "error", text: m })}
          onReady={() => setNotice({ kind: "info", text: "YouTube ready — press ▶ to sing." })}
        />
      )}

      <SpectrumCanvas engine={engine} graph={graph} timeline={timeline} visible={visualizer} reducedMotion={reducedMotion} theme={theme} />

      <div className="lyric-overlay">
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
        <ParticleLayer enabled={!reducedMotion} theme={theme} fxRef={fxRef} />
        <CountIn countIn={session.countIn} />
        <SectionCard event={session.sectionEvent} />
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
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      >
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            const next = !visualizer;
            setVisualizer(next);
            if (next) {
              graph.ensureContext();
              graph.resume();
            }
          }}
          aria-pressed={visualizer}
          aria-label={visualizer ? "Turn stage lights off" : "Turn stage lights on"}
          title="Audio-reactive stage lights"
          data-testid="visualizer-toggle"
        >
          <IconSparkle />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={fullscreen.toggle}
          aria-pressed={fullscreen.active}
          aria-label={fullscreen.active ? "Exit performance mode" : "Enter performance mode (fullscreen)"}
          title="Performance mode (F)"
          data-testid="btn-fullscreen"
        >
          {fullscreen.active ? <IconExitFullscreen /> : <IconFullscreen />}
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setEffects((e) => (e === "reduced" ? "auto" : "reduced"))}
          aria-pressed={effects === "reduced"}
          aria-label={effects === "reduced" ? "Enable full motion" : "Reduce motion"}
          title="Reduce motion"
          data-testid="effects-toggle"
        >
          ≈
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setMode((m) => (m === "studio" ? "perform" : "studio"))}
          aria-pressed={mode === "studio"}
          aria-label={mode === "studio" ? "Close Sync Studio" : "Open Sync Studio"}
          title="Sync Studio — time your own lyrics"
          data-testid="btn-studio"
        >
          <IconStudio />
        </button>
      </Header>

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
      />

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
        <ControlsDock engine={engine} playback={playback} onFileUpload={handleFileUpload}>
          <button type="button" className="dock-btn dock-btn--accent" onClick={() => setSongOpen(true)} aria-label="Find a song" data-testid="btn-find-song">
            <IconSearch /> Find song
          </button>
          <LibraryButtons track={track} onImportFile={handleImportFile} />
          <MicControls
            mic={mic}
            onToggleMic={toggleMic}
            difficulty={difficulty}
            onDifficulty={setDifficulty}
            micLatencyMs={micLatencyMs}
            onMicLatency={setMicLatencyMs}
            demoSound={demoSound}
            onDemoSound={setDemoSound}
          />
        </ControlsDock>
      )}
    </div>
  );
}
