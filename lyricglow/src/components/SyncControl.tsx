import { useState } from "react";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import { useFrame } from "../engine/useFrame";
import type { Line, Track } from "../lyrics";
import { formatOffset, lineLabel, offsetForTap, upcomingLine } from "../model/sync";

// ─── sheet row ──────────────────────────────────────────────────────────────
interface ControlProps {
  track: Track;
  onNudge: (delta: number) => void;
  onStartTap: () => void;
}

export function SyncControl({ track, onNudge, onStartTap }: ControlProps) {
  const offset = track.offset ?? 0;
  return (
    <div className="sync-control" data-testid="sync-control">
      <button type="button" className="dock-btn dock-btn--accent sync-start" onClick={onStartTap} data-testid="sync-tap-start">
        Tap to sync
      </button>
      <div className="sync-chips">
        <button type="button" className="sync-chip" onClick={() => onNudge(-0.5)} aria-label="Lyrics 0.5 seconds earlier" data-testid="sync-minus">
          −0.5 s
        </button>
        <span className="song-offset" data-testid="sync-offset">
          {formatOffset(offset)}
        </span>
        <button type="button" className="sync-chip" onClick={() => onNudge(0.5)} aria-label="Lyrics 0.5 seconds later" data-testid="sync-plus">
          +0.5 s
        </button>
      </div>
      <p className="song-hint">Words early or late? Tap to sync shows the next line — tap the moment the singer starts it.</p>
    </div>
  );
}

// ─── on-stage card ─────────────────────────────────────────────────────────
interface CardProps {
  engine: PlaybackEngine;
  track: Track;
  onApply: (offset: number, line: Line) => void;
  onCancel: () => void;
}

export function SyncCard({ engine, track, onApply, onCancel }: CardProps) {
  const [target, setTarget] = useState<Line | null>(() => upcomingLine(track, engine.frame.time));

  useFrame(engine, "render", (f) => {
    const next = upcomingLine(track, f.time);
    setTarget((prev) => (prev?.id === next?.id ? prev : next));
  });

  const tap = () => {
    const line = target ?? upcomingLine(track, engine.frame.time);
    if (!line) return;
    onApply(offsetForTap(line, engine.frame.time), line);
  };

  return (
    <div className="sync-card" role="dialog" aria-label="Tap to sync" data-testid="sync-card">
      <div className="sync-card-text">
        <span className="sync-card-kicker">Tap when the singer starts</span>
        <strong className="sync-card-line" data-testid="sync-card-line">
          {target ? `“${lineLabel(target)}”` : "— no line coming up —"}
        </strong>
      </div>
      <div className="sync-card-actions">
        <button type="button" className="sync-tap-btn" onClick={tap} disabled={!target} data-testid="sync-tap">
          TAP
        </button>
        <button type="button" className="mini-btn" onClick={onCancel} data-testid="sync-cancel">
          Cancel
        </button>
      </div>
    </div>
  );
}
