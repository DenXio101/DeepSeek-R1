import type { MicState } from "../engine/AudioGraph";
import { DIFFICULTIES, type Difficulty } from "../engine/scoring";
import { IconMic } from "./Icons";

interface Props {
  mic: MicState;
  onToggleMic: () => void;
  difficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
  micLatencyMs: number;
  onMicLatency: (ms: number) => void;
}

export default function MicControls({ mic, onToggleMic, difficulty, onDifficulty, micLatencyMs, onMicLatency }: Props) {
  const on = mic.status === "on";
  return (
    <div className="mic-controls">
      <button
        type="button"
        className={`dock-btn mic-btn ${mic.status === "requesting" ? "mic-btn--busy" : ""}`}
        onClick={onToggleMic}
        aria-pressed={on}
        aria-label={on ? "Turn microphone off" : "Turn microphone on for scoring"}
        title="Sing into the mic to get scored (headphones recommended)"
        data-testid="mic-toggle"
      >
        <IconMic /> {on ? "Mic on" : mic.status === "requesting" ? "Mic…" : "Mic"}
      </button>
      {mic.status === "error" && mic.message && (
        <span className="mic-status mic-status--error" role="alert" data-testid="mic-status">
          {mic.message}
        </span>
      )}
      <details className="settings-pop">
        <summary className="dock-btn" aria-label="Singing settings" data-testid="settings-toggle">
          ⚙
        </summary>
        <div className="settings-body">
          <label>
            Difficulty
            <select value={difficulty} onChange={(e) => onDifficulty(e.target.value as Difficulty)} aria-label="Difficulty" data-testid="difficulty-select">
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {d[0].toUpperCase() + d.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Mic latency {micLatencyMs} ms
            <input
              type="range"
              min={0}
              max={300}
              step={10}
              value={micLatencyMs}
              onChange={(e) => onMicLatency(Number(e.target.value))}
              aria-label="Microphone latency compensation"
              data-testid="mic-latency"
            />
          </label>
          <p className="settings-hint">Use headphones so the backing track doesn't get scored instead of you. On iPhone the mic may lower media volume.</p>
          <dl className="shortcuts" aria-label="Keyboard shortcuts">
            <dt><kbd>Space</kbd></dt><dd>play / pause</dd>
            <dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>seek 5 s</dd>
            <dt><kbd>F</kbd></dt><dd>performance mode</dd>
            <dt><kbd>M</kbd></dt><dd>microphone</dd>
            <dt><kbd>R</kbd></dt><dd>restart</dd>
          </dl>
        </div>
      </details>
    </div>
  );
}
