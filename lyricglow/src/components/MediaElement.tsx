import { useCallback } from "react";
import type { PlaybackEngine } from "../engine/PlaybackEngine";

export type MediaKind = "audio" | "video";

interface Props {
  engine: PlaybackEngine;
  kind: MediaKind;
  src: string;
}

/** Mounts the <audio>/<video> element and hands it to the engine for the lifetime of the node. */
export default function MediaElement({ engine, kind, src }: Props) {
  const ref = useCallback(
    (el: HTMLMediaElement | null) => {
      engine.attachMedia(el);
      return () => engine.attachMedia(null);
    },
    [engine],
  );

  if (kind === "video") {
    return (
      <video ref={ref} src={src} className="stage-video" playsInline preload="auto" data-testid="video-element" />
    );
  }
  return <audio ref={ref} src={src} preload="auto" data-testid="audio-element" />;
}
