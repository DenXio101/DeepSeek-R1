import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioGraph } from "./AudioGraph";
import { CAPTURE_S, Listener, recognize, type Capture, type RecognizeOutcome } from "./Listener";

export type ListenStatus = "idle" | "starting" | "listening" | "following" | "nohear" | "error";

export interface ListenState {
  status: ListenStatus;
  /** performance.now() of the next scheduled capture (0 = none) */
  nextAt: number;
  message: string | null;
  /** consecutive "no result" answers */
  misses: number;
}

interface Options {
  enabled: boolean;
  /** captures only happen while the song is running */
  playing: boolean;
  resyncSeconds: number;
  /** called for every answer; return true when the answer was a usable match */
  onResult: (r: RecognizeOutcome, cap: Capture) => boolean | Promise<boolean>;
  /** fatal (keys missing / quota): the hook stops itself after calling this */
  onFatal: (message: string, status: number) => void;
}

const IDLE: ListenState = { status: "idle", nextAt: 0, message: null, misses: 0 };

/** Drives Listener: capture → recognise → schedule the next check; exposes a small status. */
export function useListener(graph: AudioGraph, opts: Options): ListenState & { checkNow: () => void } {
  const [state, setState] = useState<ListenState>(IDLE);
  const listenerRef = useRef<Listener | null>(null);
  const timerRef = useRef(0);
  const busyRef = useRef(false);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const clearTimer = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  };

  const runOnce = useCallback(async () => {
    const l = listenerRef.current;
    if (!l || busyRef.current) return;
    busyRef.current = true;
    clearTimer();
    setState((s) => ({ ...s, status: s.status === "following" ? "following" : "listening", nextAt: 0, message: s.status === "following" ? s.message : "Listening…" }));
    try {
      const cap = await l.capture(CAPTURE_S);
      const r = await recognize(cap.wav);
      if (!listenerRef.current) return;
      const o = optsRef.current;
      if (!r.ok) {
        if (r.status === 503 || r.status === 429 || r.status === 413) {
          o.onFatal(r.error, r.status);
          return;
        }
        setState((s) => ({ ...s, status: "error", message: r.error }));
      } else {
        const used = await o.onResult(r, cap);
        if (used) setState((s) => ({ ...s, status: "following", misses: 0, message: null }));
        else
          setState((s) => {
            const misses = s.misses + 1;
            return { ...s, misses, status: misses >= 2 ? "nohear" : s.status === "following" ? "following" : "listening", message: misses >= 2 ? "Can't hear a song — move closer to the speaker." : s.message };
          });
      }
    } catch (err) {
      setState((s) => ({ ...s, status: "error", message: err instanceof Error ? err.message : "Couldn't listen." }));
    } finally {
      busyRef.current = false;
      const o = optsRef.current;
      if (listenerRef.current && o.enabled && o.playing) {
        setState((s) => {
          const wait = (s.status === "nohear" ? 12 : o.resyncSeconds) * 1000;
          clearTimer();
          timerRef.current = window.setTimeout(() => void runOnce(), wait);
          return { ...s, nextAt: performance.now() + wait };
        });
      }
    }
  }, []);

  // open / close with `enabled`
  useEffect(() => {
    if (!opts.enabled) return;
    const ctx = graph.ensureContext();
    if (!ctx) {
      optsRef.current.onFatal("This browser can't capture audio.", 0);
      return;
    }
    const l = new Listener();
    listenerRef.current = l;
    setState({ status: "starting", nextAt: 0, message: "Starting microphone…", misses: 0 });
    l.start(ctx)
      .then(() => {
        if (listenerRef.current !== l) return;
        graph.resume();
        void runOnce();
      })
      .catch((err: unknown) => {
        if (listenerRef.current !== l) return;
        const name = err instanceof DOMException ? err.name : "";
        optsRef.current.onFatal(name === "NotAllowedError" || name === "SecurityError" ? "Microphone blocked — allow it in the browser's site settings." : "Couldn't start the microphone.", 0);
      });
    return () => {
      clearTimer();
      l.stop();
      if (listenerRef.current === l) listenerRef.current = null;
      setState(IDLE);
    };
  }, [opts.enabled, graph, runOnce]);

  // pause stops the schedule; play (re)starts with an immediate check
  const playing = opts.enabled && opts.playing;
  useEffect(() => {
    if (!listenerRef.current || state.status === "starting") return;
    if (!playing) {
      clearTimer();
      setState((s) => (s.nextAt ? { ...s, nextAt: 0 } : s));
      return;
    }
    if (!busyRef.current && !timerRef.current) void runOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to play/pause edges only
  }, [playing]);

  const checkNow = useCallback(() => {
    if (listenerRef.current && !busyRef.current) void runOnce();
  }, [runOnce]);

  return { ...state, checkNow };
}
