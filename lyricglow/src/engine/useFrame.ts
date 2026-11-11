import { useEffect, useLayoutEffect, useRef } from "react";
import type { FrameCallback, FramePhase, PlaybackEngine } from "./PlaybackEngine";

/**
 * Subscribe a callback to the engine's frame loop without re-rendering.
 * The latest callback is always used; subscription happens once per engine/phase.
 */
export function useFrame(engine: PlaybackEngine, phase: FramePhase, cb: FrameCallback): void {
  const cbRef = useRef<FrameCallback>(cb);
  useLayoutEffect(() => {
    cbRef.current = cb;
  });
  useEffect(() => engine.subscribeFrame((f) => cbRef.current(f), phase), [engine, phase]);
}
