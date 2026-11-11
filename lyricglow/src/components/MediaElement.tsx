import { useCallback, useEffect, useRef } from "react";
import type { PlaybackEngine } from "../engine/PlaybackEngine";

export type MediaKind = "audio" | "video";

interface Props {
  engine: PlaybackEngine;
  kind: MediaKind;
  src: string;
  /** the browser could not open the file (stale handle, unsupported codec) */
  onError?: () => void;
}

/**
 * Mounts the <audio>/<video> element and hands it to the engine for the lifetime of the node.
 * The element is keyed by kind in App, so a new song of the same kind swaps `src` on the same
 * element (one audio chain, iOS activation kept); the engine is told to reset its clock state.
 */
export default function MediaElement({ engine, kind, src, onError }: Props) {
  const ref = useCallback(
    (el: HTMLMediaElement | null) => {
      engine.attachMedia(el);
      return () => engine.attachMedia(null);
    },
    [engine],
  );
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    engine.mediaSourceChanged();
  }, [engine, src]);

  if (kind === "video") {
    return (
      <video ref={ref} src={src} className="stage-video" playsInline preload="auto" onError={onError} data-testid="video-element" />
    );
  }
  return <audio ref={ref} src={src} preload="auto" onError={onError} data-testid="audio-element" />;
}
