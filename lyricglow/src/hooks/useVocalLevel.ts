import { useEffect, useRef, useState } from "react";
import type { AudioGraph } from "../engine/AudioGraph";
import type { PlaybackEngine } from "../engine/PlaybackEngine";

/**
 * Keeps the "original singer" level applied to the current local file and watches
 * whether the file is mono (where centre-channel reduction would mute everything).
 * Lives in App so it works whether or not the slider is on screen.
 * Returns true when the source is mono (level bypassed).
 */
export function useVocalLevel(engine: PlaybackEngine, graph: AudioGraph, sourceKey: string | null, level: number): boolean {
  // mono verdict is remembered per source; a new source starts unknown
  const [monoState, setMonoState] = useState<{ key: string; mono: boolean }>({ key: "", mono: false });
  const mono = sourceKey !== null && monoState.key === sourceKey ? monoState.mono : false;
  const applied = useRef<string>("");

  useEffect(() => {
    if (!sourceKey || !graph.supported) return;
    const el = engine.mediaElement;
    if (!el) return;
    const effective = mono ? 1 : level;
    const key = `${sourceKey}:${effective}`;
    if (applied.current === key) return;
    graph.setVocalLevel(el, effective);
    applied.current = key;
  }, [engine, graph, sourceKey, level, mono]);

  useEffect(() => {
    if (!sourceKey || !graph.supported) return;
    const id = window.setInterval(() => {
      const el = engine.mediaElement;
      if (!el || el.paused) return;
      const m = graph.vocalSourceIsMono(el);
      if (m !== null) setMonoState((prev) => (prev.key === sourceKey && prev.mono === m ? prev : { key: sourceKey, mono: m }));
    }, 600);
    return () => window.clearInterval(id);
  }, [engine, graph, sourceKey]);

  return mono;
}
