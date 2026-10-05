import { useEffect } from "react";
import type { PlaybackEngine, PlaybackSnapshot } from "../engine/PlaybackEngine";
import { MAX_RATE, MIN_RATE } from "../engine/PlaybackEngine";
import { DIFFICULTIES, type Difficulty } from "../engine/scoring";
import type { EffectsLevel } from "../hooks/useReducedMotion";
import type { Track } from "../lyrics";
import { downloadTextFile, exportLrc, safeFileStem, trackToJson } from "../model/trackIO";
import type { Theme } from "./Header";
import { IconDownload, IconImport, IconSparkle, IconStudio, IconUpload } from "./Icons";
import { SyncControl } from "./SyncControl";
import VocalControl from "./VocalControl";

interface Props {
  open: boolean;
  onClose: () => void;
  engine: PlaybackEngine;
  playback: PlaybackSnapshot;
  track: Track;
  onNudge: (delta: number) => void;
  onStartTapSync: () => void;
  /** a local file is loaded and routed through Web Audio */
  showVocal: boolean;
  vocalLevel: number;
  vocalMono: boolean;
  onVocalLevel: (v: number) => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  micLatencyMs: number;
  onMicLatency: (ms: number) => void;
  demoSound: boolean;
  onDemoSound: (on: boolean) => void;
  theme: Theme;
  onToggleTheme: () => void;
  visualizer: boolean;
  onToggleVisualizer: () => void;
  effects: EffectsLevel;
  onToggleEffects: () => void;
  onMediaFile: (file: File) => void;
  onLyricsFile: (file: File) => void;
  onOpenStudio: () => void;
}

/** Everything that isn't needed mid-song: timing, speed, voice, singing settings, display, files. */
export default function MoreSheet(p: Props) {
  const { open, onClose } = p;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const stem = safeFileStem(p.track.title);
  const rate = p.playback.rate;

  return (
    <div className="sheet-backdrop" onClick={onClose} data-testid="more-sheet-backdrop">
      <section className="sheet sheet--more" role="dialog" aria-modal="true" aria-label="More options" onClick={(e) => e.stopPropagation()} data-testid="more-sheet">
        <header className="sheet-head">
          <h2 className="sheet-title">More</h2>
          <button type="button" className="dock-btn" onClick={onClose} aria-label="Close" data-testid="more-close">
            Done
          </button>
        </header>

        <div className="sheet-section">
          <span className="sheet-label">Lyrics timing</span>
          <SyncControl track={p.track} onNudge={p.onNudge} onStartTap={p.onStartTapSync} />
        </div>

        <div className="sheet-section">
          <span className="sheet-label">Speed</span>
          <div className="more-row">
            <label htmlFor="tempo-slider" className="tempo-label" data-testid="tempo-value">
              {rate.toFixed(2)}×
            </label>
            <input
              id="tempo-slider"
              type="range"
              className="tempo-slider"
              min={MIN_RATE}
              max={MAX_RATE}
              step={0.05}
              value={rate}
              onChange={(e) => p.engine.setRate(Number(e.target.value))}
              aria-label="Playback speed"
              data-testid="tempo-slider"
            />
            <button type="button" className="sync-chip" onClick={() => p.engine.setRate(1)} disabled={rate === 1} data-testid="tempo-reset">
              1×
            </button>
          </div>
        </div>

        {p.showVocal && (
          <div className="sheet-section">
            <span className="sheet-label">Original singer's voice</span>
            <VocalControl level={p.vocalLevel} mono={p.vocalMono} onLevel={p.onVocalLevel} />
          </div>
        )}

        <div className="sheet-section">
          <span className="sheet-label">Singing</span>
          <div className="more-grid settings-body settings-body--inline">
            <label>
              Difficulty
              <select value={p.difficulty} onChange={(e) => p.onDifficulty(e.target.value as Difficulty)} aria-label="Difficulty" data-testid="difficulty-select">
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d[0].toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Mic latency {p.micLatencyMs} ms
              <input
                type="range"
                min={0}
                max={300}
                step={10}
                value={p.micLatencyMs}
                onChange={(e) => p.onMicLatency(Number(e.target.value))}
                aria-label="Microphone latency compensation"
                data-testid="mic-latency"
              />
            </label>
            <label className="settings-check">
              <input type="checkbox" checked={p.demoSound} onChange={(e) => p.onDemoSound(e.target.checked)} data-testid="demo-sound-toggle" />
              Demo melody when no backing track is loaded
            </label>
          </div>
          <p className="settings-hint">Use headphones so the backing track isn't scored instead of you. On iPhone the mic may lower media volume.</p>
        </div>

        <div className="sheet-section">
          <span className="sheet-label">Display</span>
          <div className="more-grid">
            <button type="button" className="dock-btn" onClick={p.onToggleTheme} aria-label={`Switch to ${p.theme === "dark" ? "light" : "dark"} theme`} data-testid="theme-toggle">
              {p.theme === "dark" ? "☀ Light theme" : "☾ Dark theme"}
            </button>
            <button type="button" className="dock-btn" onClick={p.onToggleVisualizer} aria-pressed={p.visualizer} data-testid="visualizer-toggle">
              <IconSparkle /> Stage lights {p.visualizer ? "on" : "off"}
            </button>
            <button type="button" className="dock-btn" onClick={p.onToggleEffects} aria-pressed={p.effects === "reduced"} data-testid="effects-toggle">
              ≈ {p.effects === "reduced" ? "Reduced motion" : "Full motion"}
            </button>
          </div>
        </div>

        <div className="sheet-section">
          <span className="sheet-label">Files &amp; tools</span>
          <div className="more-grid">
            <label className="dock-btn" data-testid="upload-label">
              <input
                type="file"
                accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.ogg,.webm"
                className="sr-only"
                aria-label="Upload media file"
                data-testid="file-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) p.onMediaFile(f);
                  e.target.value = "";
                }}
              />
              <IconUpload /> Open MP3 / MP4
            </label>
            <label className="dock-btn" data-testid="import-label" title="Import .lrc or LyricGlow .json lyrics">
              <input
                type="file"
                accept=".lrc,.json,.txt,text/plain,application/json"
                className="sr-only"
                aria-label="Import lyrics file"
                data-testid="import-input"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) p.onLyricsFile(f);
                  e.target.value = "";
                }}
              />
              <IconImport /> Open lyrics file
            </label>
            <button type="button" className="dock-btn" onClick={p.onOpenStudio} data-testid="btn-studio">
              <IconStudio /> Sync Studio
            </button>
            <button
              type="button"
              className="dock-btn"
              onClick={() => downloadTextFile(`${stem}.lrc`, exportLrc(p.track), "text/plain")}
              aria-label="Export lyrics as enhanced LRC"
              data-testid="btn-export-lrc"
            >
              <IconDownload /> Save LRC
            </button>
            <button
              type="button"
              className="dock-btn"
              onClick={() => downloadTextFile(`${stem}.lyricglow.json`, trackToJson(p.track), "application/json")}
              aria-label="Export lyrics as LyricGlow JSON"
              data-testid="btn-export-json"
            >
              <IconDownload /> Save JSON
            </button>
          </div>
        </div>

        <div className="sheet-section">
          <span className="sheet-label">Keyboard</span>
          <dl className="shortcuts" aria-label="Keyboard shortcuts">
            <dt><kbd>Space</kbd></dt><dd>play / pause</dd>
            <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>seek 5 s</dd>
            <dt><kbd>[</kbd> <kbd>]</kbd></dt><dd>lyrics 0.1 s earlier / later</dd>
            <dt><kbd>F</kbd></dt><dd>performance mode</dd>
            <dt><kbd>M</kbd></dt><dd>microphone</dd>
            <dt><kbd>R</kbd></dt><dd>restart</dd>
          </dl>
        </div>
      </section>
    </div>
  );
}
