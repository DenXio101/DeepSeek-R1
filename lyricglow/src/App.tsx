import { useState, useRef, useEffect, useCallback } from "react";
import Karaoke from "./Karaoke";
import Logo from "./Logo";
import demoTrack from "./demoTrack";
import type { Track } from "./lyrics";
import "./styles.css";

type Theme = "dark" | "light";
type MediaType = "none" | "audio" | "video";

const DEMO_DURATION = 56;

export default function App() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [isPlaying, setIsPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(DEMO_DURATION);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [mediaType, setMediaType] = useState<MediaType>("none");
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [track] = useState<Track>(demoTrack);
  const [isLandscape, setIsLandscape] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const demoStartRef = useRef<number | null>(null);
  const demoTimeRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const fileUrlRef = useRef<string | null>(null);
  const playbackRateRef = useRef(playbackRate);
  const isPlayingRef = useRef(isPlaying);

  playbackRateRef.current = playbackRate;
  isPlayingRef.current = isPlaying;

  // Detect landscape
  useEffect(() => {
    const check = () => setIsLandscape(window.innerWidth > window.innerHeight);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  // Demo clock RAF loop
  const startDemoClock = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    const rate = playbackRateRef.current;
    const baseTime = demoTimeRef.current;
    demoStartRef.current = performance.now();

    const tick = () => {
      if (!isPlayingRef.current) return;
      if (demoStartRef.current === null) return;
      const elapsed = (performance.now() - demoStartRef.current) / 1000;
      const t = baseTime + elapsed * rate;
      const clamped = Math.min(t, DEMO_DURATION);
      setTime(clamped);
      if (clamped < DEMO_DURATION) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        isPlayingRef.current = false;
        setIsPlaying(false);
        demoTimeRef.current = 0;
        demoStartRef.current = null;
        setTime(0);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopDemoClock = useCallback((captureTime?: number) => {
    cancelAnimationFrame(rafRef.current);
    if (captureTime !== undefined) demoTimeRef.current = captureTime;
    demoStartRef.current = null;
  }, []);

  // Sync media element events
  useEffect(() => {
    if (mediaType === "none") return;
    const el = mediaType === "audio" ? audioRef.current : videoRef.current;
    if (!el) return;
    const onTimeUpdate = () => setTime(el.currentTime);
    const onDurationChange = () => setDuration(isFinite(el.duration) ? el.duration : DEMO_DURATION);
    const onEnded = () => setIsPlaying(false);
    el.addEventListener("timeupdate", onTimeUpdate);
    el.addEventListener("durationchange", onDurationChange);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTimeUpdate);
      el.removeEventListener("durationchange", onDurationChange);
      el.removeEventListener("ended", onEnded);
    };
  }, [mediaType]);

  // Playback rate sync to media element
  useEffect(() => {
    const el = audioRef.current ?? videoRef.current;
    if (el) el.playbackRate = playbackRate;
  }, [playbackRate]);

  const getMediaEl = useCallback((): HTMLMediaElement | null => {
    if (mediaType === "audio") return audioRef.current;
    if (mediaType === "video") return videoRef.current;
    return null;
  }, [mediaType]);

  const handlePlay = useCallback(() => {
    const el = getMediaEl();
    if (el) {
      el.play().catch(() => {});
    } else {
      startDemoClock();
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [getMediaEl, startDemoClock]);

  const handlePause = useCallback(() => {
    const el = getMediaEl();
    if (el) {
      el.pause();
    } else {
      stopDemoClock(demoTimeRef.current + (demoStartRef.current !== null ? (performance.now() - demoStartRef.current) / 1000 * playbackRateRef.current : 0));
    }
    setIsPlaying(false);
    isPlayingRef.current = false;
  }, [getMediaEl, stopDemoClock]);

  const handleRestart = useCallback(() => {
    const el = getMediaEl();
    if (el) {
      el.currentTime = 0;
      el.play().catch(() => {});
      setTime(0);
    } else {
      cancelAnimationFrame(rafRef.current);
      demoTimeRef.current = 0;
      demoStartRef.current = null;
      setTime(0);
      isPlayingRef.current = true;
      startDemoClock();
    }
    setIsPlaying(true);
    isPlayingRef.current = true;
  }, [getMediaEl, startDemoClock]);

  const handleSeek = useCallback(
    (value: number) => {
      const el = getMediaEl();
      if (el) {
        el.currentTime = value;
        setTime(value);
      } else {
        cancelAnimationFrame(rafRef.current);
        demoTimeRef.current = value / playbackRateRef.current;
        setTime(value);
        if (isPlayingRef.current) {
          startDemoClock();
        }
      }
    },
    [getMediaEl, startDemoClock]
  );

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      const url = URL.createObjectURL(file);
      fileUrlRef.current = url;
      setMediaUrl(url);
      const isVideo = file.type.startsWith("video/");
      setMediaType(isVideo ? "video" : "audio");
      setIsPlaying(false);
      isPlayingRef.current = false;
      setTime(0);
      demoTimeRef.current = 0;
      stopDemoClock(0);
    },
    [stopDemoClock]
  );

  useEffect(() => {
    return () => {
      if (fileUrlRef.current) URL.revokeObjectURL(fileUrlRef.current);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const activeSection = track.lines.find(
    (l) => time >= l.start - 0.5 && time <= l.end + 0.5
  )?.section;

  return (
    <div
      className={`app-root theme-${theme}`}
      data-theme={theme}
      data-landscape={String(isLandscape)}
      data-testid="app-root"
    >
      {/* Stage background */}
      <div className="stage-bg" aria-hidden="true">
        <div className="stage-grain" />
        <div className="stage-vignette" />
        <div className="stage-spotlight stage-spotlight--left" />
        <div className="stage-spotlight stage-spotlight--right" />
        <div className="stage-spotlight stage-spotlight--center" />
      </div>

      {/* Video fullscreen background */}
      {mediaType === "video" && mediaUrl && (
        <video
          ref={videoRef}
          src={mediaUrl}
          className="stage-video"
          playsInline
          data-testid="video-element"
        />
      )}
      {mediaType === "audio" && mediaUrl && (
        <audio ref={audioRef} src={mediaUrl} data-testid="audio-element" />
      )}

      {/* Lyric overlay */}
      <div className="lyric-overlay">
        <Karaoke
          lines={track.lines}
          time={time}
          playbackRate={playbackRate}
          isLandscape={isLandscape}
        />
      </div>

      {/* Header */}
      <header className="app-header" data-testid="app-header">
        <div className="app-brand">
          <Logo />
          <span className="app-name">LyricGlow</span>
        </div>
        <div className="header-meta">
          {activeSection && (
            <span className="header-section-badge" data-testid="header-section-badge">
              {activeSection}
            </span>
          )}
          <div className="track-info">
            <span className="track-title" data-testid="track-title">
              {track.title}
            </span>
            <span className="track-artist" data-testid="track-artist">
              {track.artist}
            </span>
          </div>
        </div>
        <button
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
          aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          data-testid="theme-toggle"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>

      {/* Controls dock */}
      <div className="controls-dock" data-testid="controls-dock">
        <div className="progress-row">
          <span className="time-label" data-testid="time-current">
            {formatTime(time)}
          </span>
          <input
            type="range"
            className="seek-bar"
            min={0}
            max={duration}
            step={0.1}
            value={time}
            onChange={(e) => handleSeek(Number(e.target.value))}
            aria-label="Seek position"
            data-testid="seek-bar"
          />
          <span className="time-label" data-testid="time-duration">
            {formatTime(duration)}
          </span>
        </div>

        <div className="transport-row">
          <button
            className="transport-btn"
            onClick={handleRestart}
            aria-label="Restart"
            data-testid="btn-restart"
          >
            ⏮
          </button>

          {isPlaying ? (
            <button
              className="transport-btn transport-btn--primary"
              onClick={handlePause}
              aria-label="Pause"
              data-testid="btn-pause"
            >
              ⏸
            </button>
          ) : (
            <button
              className="transport-btn transport-btn--primary"
              onClick={handlePlay}
              aria-label="Play"
              data-testid="btn-play"
            >
              ▶
            </button>
          )}

          <div className="tempo-control" data-testid="tempo-control">
            <label htmlFor="tempo-slider" className="tempo-label">
              {playbackRate.toFixed(2)}×
            </label>
            <input
              id="tempo-slider"
              type="range"
              className="tempo-slider"
              min={0.5}
              max={2.0}
              step={0.05}
              value={playbackRate}
              onChange={(e) => setPlaybackRate(Number(e.target.value))}
              aria-label="Playback speed"
              data-testid="tempo-slider"
            />
          </div>

          <label className="upload-btn" data-testid="upload-label">
            <input
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileUpload}
              className="sr-only"
              aria-label="Upload media file"
              data-testid="file-input"
            />
            ⬆ Upload
          </label>
        </div>
      </div>
    </div>
  );
}
