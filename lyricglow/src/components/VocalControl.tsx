import { useEffect, useRef, useState } from "react";
import type { AudioGraph } from "../engine/AudioGraph";
import type { PlaybackEngine } from "../engine/PlaybackEngine";

interface Props {
  engine: PlaybackEngine;
  graph: AudioGraph;
  /** bumps when a new file element is mounted */
  sourceKey: string;
  level: number;
  onLevel: (v: number) => void;
}

/**
 * "Vocal" slider for local files: 100 % = original mix, lower = centre-channel
 * (lead vocal) reduced so the singer becomes a faint guide. Auto-bypasses on
 * mono sources where the trick would mute the whole track.
 */
export default function VocalControl({ engine, graph, sourceKey, level, onLevel }: Props) {
  // mono verdict is remembered per source; a new source starts unknown
  const [monoState, setMonoState] = useState<{ key: string; mono: boolean }>({ key: "", mono: false });
  const mono = monoState.key === sourceKey ? monoState.mono : false;
  const applied = useRef<string>("");

  // apply the level to the current element (routing it through Web Audio on first use)
  useEffect(() => {
    const el = engine.mediaElement;
    if (!el) return;
    const effective = mono ? 1 : level;
    const key = `${sourceKey}:${effective}`;
    if (applied.current === key) return;
    graph.setVocalLevel(el, effective);
    applied.current = key;
  }, [engine, graph, sourceKey, level, mono]);

  // mono detection while playing (state only changes when the verdict changes)
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = engine.mediaElement;
      if (!el || el.paused) return;
      const m = graph.vocalSourceIsMono(el);
      if (m !== null) setMonoState((prev) => (prev.key === sourceKey && prev.mono === m ? prev : { key: sourceKey, mono: m }));
    }, 600);
    return () => window.clearInterval(id);
  }, [engine, graph, sourceKey]);

  if (!graph.supported) return null;
  const pct = Math.round(level * 100);
  return (
    <div className="vocal-control" data-testid="vocal-control" title="How much of the original singer you hear (centre-channel reduction)">
      <label htmlFor="vocal-slider" className="tempo-label vocal-label">
        Voice {mono ? "—" : `${pct}%`}
      </label>
      <input
        id="vocal-slider"
        type="range"
        className="tempo-slider vocal-slider"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={!!mono}
        onChange={(e) => onLevel(Number(e.target.value) / 100)}
        aria-label="Original vocal level"
        data-testid="vocal-level"
      />
      {mono && (
        <span className="vocal-note" data-testid="vocal-mono-note">
          mono file — can't separate vocals
        </span>
      )}
    </div>
  );
}
