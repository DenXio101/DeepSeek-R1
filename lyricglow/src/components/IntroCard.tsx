import { useEffect, useRef, useState } from "react";
import { formatKey } from "../engine/SoundTouchShifter";
import CountIn from "./CountIn";

interface Props {
  title: string;
  artist: string;
  /** "Song 2 of 3" */
  position: string;
  keyOffset: number;
  /** seconds per beat of the song (the timeline's beat); the countdown is three beats */
  beatSeconds: number;
  /** the browser refused to start the music by itself: show a button instead of the countdown */
  tapToStart: boolean;
  /** countdown finished → the caller starts the music */
  onDone: () => void;
  /** user tapped Skip / Tap to start → the caller starts the music inside the gesture */
  onSkip: () => void;
}

const BEATS = 3;

/**
 * Title card before a song of a set: title, artist, position, key (when shifted) and a
 * three-beat countdown with the KaraFun dots. Pre-roll state that lives in App; the card
 * only runs the timer and reports when it ends.
 */
export default function IntroCard({ title, artist, position, keyOffset, beatSeconds, tapToStart, onDone, onSkip }: Props) {
  const [show, setShow] = useState(BEATS);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    if (tapToStart) return;
    if (show <= 0) {
      doneRef.current();
      return;
    }
    const id = window.setTimeout(() => setShow((s) => s - 1), Math.max(0.3, beatSeconds) * 1000);
    return () => window.clearTimeout(id);
  }, [show, beatSeconds, tapToStart]);

  return (
    <div className="intro-card" role="status" aria-label={`Up next: ${title}${artist ? ` by ${artist}` : ""}`} data-testid="intro-card">
      <span className="intro-position" data-testid="intro-position">
        {position}
      </span>
      <span className="intro-title">{title}</span>
      {artist && <span className="intro-artist">{artist}</span>}
      {keyOffset !== 0 && (
        <span className="key-pill" data-testid="intro-key">
          Key {formatKey(keyOffset)}
        </span>
      )}
      {tapToStart ? (
        <button type="button" className="transport-btn transport-btn--primary intro-tap" onClick={onSkip} data-testid="intro-tap">
          Tap to start
        </button>
      ) : (
        <>
          <CountIn countIn={{ lineIdx: -1, show: Math.max(1, show), total: BEATS }} variant="dots" />
          <span className="sr-only" data-testid="intro-countdown">
            {show}
          </span>
          <button type="button" className="mini-btn intro-skip" onClick={onSkip} aria-label="Skip the intro and start now" data-testid="intro-skip">
            Skip
          </button>
        </>
      )}
    </div>
  );
}
