import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { TrackTimeline } from "../model/timeline";
import { KaraokeSession, type SessionSnapshot } from "./KaraokeSession";
import type { PlaybackEngine } from "./PlaybackEngine";

export function useKaraokeSession(
  engine: PlaybackEngine,
  timeline: TrackTimeline,
): { session: KaraokeSession; state: SessionSnapshot } {
  const session = useMemo(() => new KaraokeSession(timeline), [timeline]);
  useEffect(() => session.attach(engine), [session, engine]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  return { session, state };
}
