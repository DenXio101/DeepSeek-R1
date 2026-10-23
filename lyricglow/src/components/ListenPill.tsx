import { useEffect, useState } from "react";
import type { ListenStatus } from "../engine/useListener";

interface Props {
  status: ListenStatus;
  song: { title: string; artist: string } | null;
  nextAt: number;
  message: string | null;
  onStop: () => void;
  onNow: () => void;
}

/** On-stage status while Listen mode follows the room. */
export default function ListenPill({ status, song, nextAt, message, onStop, onNow }: Props) {
  // countdown to the next check, refreshed by a timer (never read the clock during render)
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!nextAt) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((nextAt - performance.now()) / 1000)));
    const first = window.setTimeout(tick, 0);
    const id = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [nextAt]);

  let text: string;
  if (status === "starting") text = message ?? "Starting microphone…";
  else if (status === "listening") text = "Listening to the room…";
  else if (status === "following" && song) text = `Following “${song.title}”${nextAt && left ? ` · next check in ${left} s` : nextAt ? "" : " · checking…"}`;
  else if (status === "nohear") text = message ?? "Can't hear a song.";
  else if (status === "error") text = message ?? "Listening failed.";
  else text = message ?? "Listening…";

  return (
    <div className={`listen-pill listen-pill--${status}`} role="status" data-testid="listen-pill" data-status={status}>
      <span className="listen-dot" aria-hidden="true" />
      <span className="listen-text" data-testid="listen-text">
        {text}
      </span>
      {status !== "starting" && (
        <button type="button" className="mini-btn listen-now" onClick={onNow} aria-label="Check the song now" title="Check now" data-testid="listen-now">
          ↻
        </button>
      )}
      <button type="button" className="notice-close listen-close" onClick={onStop} aria-label="Stop listening" data-testid="listen-stop">
        ×
      </button>
    </div>
  );
}
