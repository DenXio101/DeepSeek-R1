import type { PlaybackEngine, PlaybackSnapshot } from "../engine/PlaybackEngine";
import { MAX_RATE, MIN_RATE } from "../engine/PlaybackEngine";
import ProgressRow from "./ProgressRow";
import { IconPause, IconPlay, IconRestart, IconUpload } from "./Icons";

interface Props {
  engine: PlaybackEngine;
  playback: PlaybackSnapshot;
  onFileUpload: (file: File) => void;
  /** extra controls appended to the transport row */
  children?: React.ReactNode;
}

export default function ControlsDock({ engine, playback, onFileUpload, children }: Props) {
  return (
    <div className="controls-dock" data-testid="controls-dock">
      <ProgressRow engine={engine} duration={playback.duration} />

      <div className="transport-row">
        <button
          type="button"
          className="transport-btn"
          onClick={() => engine.restart()}
          aria-label="Restart"
          data-testid="btn-restart"
        >
          <IconRestart />
        </button>

        {playback.playing ? (
          <button
            type="button"
            className="transport-btn transport-btn--primary"
            onClick={() => engine.pause()}
            aria-label="Pause"
            data-testid="btn-pause"
          >
            <IconPause />
          </button>
        ) : (
          <button
            type="button"
            className="transport-btn transport-btn--primary"
            onClick={() => engine.play()}
            aria-label={playback.ended ? "Play again" : "Play"}
            data-testid="btn-play"
          >
            <IconPlay />
          </button>
        )}

        <div className="tempo-control" data-testid="tempo-control">
          <label htmlFor="tempo-slider" className="tempo-label" data-testid="tempo-value">
            {playback.rate.toFixed(2)}×
          </label>
          <input
            id="tempo-slider"
            type="range"
            className="tempo-slider"
            min={MIN_RATE}
            max={MAX_RATE}
            step={0.05}
            value={playback.rate}
            onChange={(e) => engine.setRate(Number(e.target.value))}
            aria-label="Playback speed"
            data-testid="tempo-slider"
          />
        </div>

        <label className="upload-btn" data-testid="upload-label">
          <input
            type="file"
            accept="audio/*,video/*,.mp3,.mp4,.m4a,.wav,.ogg,.webm"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileUpload(file);
              e.target.value = "";
            }}
            className="sr-only"
            aria-label="Upload media file"
            data-testid="file-input"
          />
          <IconUpload /> Media
        </label>

        {children}
      </div>
    </div>
  );
}
