import { useRef } from "react";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import { useFrame } from "../engine/useFrame";
import { formatTime } from "../lyrics";

interface Props {
  engine: PlaybackEngine;
  duration: number;
}

/** Seek bar + time labels, updated imperatively every frame (no React renders). */
export default function ProgressRow({ engine, duration }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const lastLabel = useRef("");

  useFrame(engine, "render", (f) => {
    if (!dragging.current && inputRef.current) inputRef.current.value = String(f.time);
    const label = formatTime(f.time);
    if (label !== lastLabel.current && labelRef.current) {
      labelRef.current.textContent = label;
      lastLabel.current = label;
    }
  });

  const max = duration > 0 ? duration : 1;

  return (
    <div className="progress-row">
      <span className="time-label" ref={labelRef} data-testid="time-current">
        0:00
      </span>
      <input
        ref={inputRef}
        type="range"
        className="seek-bar"
        min={0}
        max={max}
        step="any"
        defaultValue={0}
        onPointerDown={() => {
          dragging.current = true;
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
        onBlur={() => {
          dragging.current = false;
        }}
        onChange={(e) => engine.seek(Number(e.target.value))}
        onInput={(e) => engine.seek(Number((e.target as HTMLInputElement).value))}
        aria-label="Seek position"
        data-testid="seek-bar"
      />
      <span className="time-label" data-testid="time-duration">
        {formatTime(duration)}
      </span>
    </div>
  );
}
