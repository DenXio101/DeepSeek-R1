import { useEffect, useState, useSyncExternalStore } from "react";
import { AudioGraph, type MicState } from "./AudioGraph";

export function useAudioGraph(): { graph: AudioGraph; mic: MicState } {
  const [graph] = useState(() => new AudioGraph());
  // release the microphone on unmount (StrictMode remount re-requests only if the user toggles again)
  useEffect(() => () => graph.disableMic(), [graph]);
  const mic = useSyncExternalStore(graph.subscribeMic, graph.getMicState, graph.getMicState);
  return { graph, mic };
}
