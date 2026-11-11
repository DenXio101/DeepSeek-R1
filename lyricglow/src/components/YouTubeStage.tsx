import { useEffect, useRef } from "react";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import { loadYouTubeApi, youtubeErrorMessage, youtubeTransport, YT_STATE, type YTPlayer } from "../engine/youtube";

interface Props {
  engine: PlaybackEngine;
  videoId: string;
  /** `code` is the IFrame API error code (2, 5, 100, 101, 150) when the player reported it */
  onError: (message: string, code?: number) => void;
  onReady?: () => void;
  /** resume position in seconds (a version swap keeps the place in the song) */
  startAt?: number;
  /** start playing as soon as the player is ready (the song was playing before the swap) */
  autoplay?: boolean;
}

/**
 * Full-stage YouTube player. The player stays visible (YouTube's terms) under
 * the lyric overlay; the engine drives it through a Transport.
 */
export default function YouTubeStage({ engine, videoId, onError, onReady, startAt = 0, autoplay = false }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cbRef = useRef({ onError, onReady, startAt, autoplay });
  useEffect(() => {
    cbRef.current = { onError, onReady, startAt, autoplay };
  });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    const mount = document.createElement("div");
    host.appendChild(mount);

    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        let transport: ReturnType<typeof youtubeTransport> | null = null;
        player = new YT.Player(mount, {
          videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            controls: 0,
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            disablekb: 1,
            fs: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: (e) => {
              if (cancelled) return;
              transport = youtubeTransport(e.target);
              engine.attachTransport(transport);
              const { startAt: at, autoplay: go } = cbRef.current;
              if (at > 0) engine.seek(at);
              if (go) engine.play();
              cbRef.current.onReady?.();
            },
            onStateChange: (e) => {
              if (!transport) return;
              const s = e.data;
              if (s === YT_STATE.PLAYING) transport.notify("play");
              else if (s === YT_STATE.PAUSED) transport.notify("pause");
              else if (s === YT_STATE.ENDED) transport.notify("ended");
              else if (s === YT_STATE.CUED) transport.notify("duration");
              if (s === YT_STATE.PLAYING) transport.notify("duration");
            },
            onPlaybackRateChange: () => transport?.notify("rate"),
            onError: (e) => cbRef.current.onError(youtubeErrorMessage(e.data), e.data),
          },
        });
      })
      .catch((err: unknown) => {
        if (!cancelled) cbRef.current.onError(err instanceof Error ? err.message : "Couldn't load YouTube.");
      });

    return () => {
      cancelled = true;
      if (engine.currentTransport?.kind === "youtube") engine.attachTransport(null);
      try {
        player?.destroy();
      } catch {
        /* already gone */
      }
      mount.remove();
    };
  }, [engine, videoId]);

  return <div ref={hostRef} className="stage-youtube" data-testid="youtube-stage" data-video-id={videoId} />;
}
