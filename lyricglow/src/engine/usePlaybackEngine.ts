import { useEffect, useState, useSyncExternalStore } from "react";
import { PlaybackEngine, type PlaybackSnapshot } from "./PlaybackEngine";

export function usePlaybackEngine(): { engine: PlaybackEngine; playback: PlaybackSnapshot } {
  const [engine] = useState(() => new PlaybackEngine());
  useEffect(() => () => engine.dispose(), [engine]);
  const playback = useSyncExternalStore(engine.subscribeState, engine.getSnapshot, engine.getSnapshot);
  return { engine, playback };
}
