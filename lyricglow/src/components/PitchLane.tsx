import { useEffect, useRef } from "react";
import type { KaraokeSession } from "../engine/KaraokeSession";
import type { PitchTracker } from "../engine/PitchTracker";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import { useFrame } from "../engine/useFrame";
import type { TrackTimeline } from "../model/timeline";

interface Props {
  engine: PlaybackEngine;
  timeline: TrackTimeline;
  tracker: PitchTracker;
  session: KaraokeSession;
  activeIdx: number;
  cursorIdx: number;
  reducedMotion: boolean;
  micLatency: number;
}

const PAST = 1.0;
const FUTURE = 4.0;
const NOW_FRAC = 0.22;
const VOICE_RGB = { male: "0, 212, 255", female: "244, 160, 192", duet: "232, 200, 122" } as const;

/**
 * SingStar-style lane: target note bars scroll right→left under the lyric,
 * the singer's live pitch rides on top. Rows fold pitch to one octave so an
 * octave-off singer still lands on the bar.
 */
export default function PitchLane({ engine, timeline, tracker, session, activeIdx, cursorIdx, reducedMotion, micLatency }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const baseRef = useRef({ laneBase: 48, lineIdx: -1 });

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      sizeRef.current = { w: r.width, h: r.height, dpr };
      engine.requestFrame();
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, [engine]);

  useFrame(engine, "render", (f) => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    const { w, h, dpr } = sizeRef.current;
    if (!ctx || !w || !h) return;
    const t = f.time + (timeline.track.offset ?? 0);
    const flat = timeline.flat;
    const lines = timeline.track.lines;

    // lane base follows the active (or upcoming) line's lowest note
    const refLine = activeIdx >= 0 ? activeIdx : Math.min(cursorIdx, lines.length - 1);
    if (refLine !== baseRef.current.lineIdx && refLine >= 0) {
      let min = Infinity;
      for (const s of lines[refLine].syllables) if (s.note !== undefined && s.note < min) min = s.note;
      baseRef.current = { laneBase: Number.isFinite(min) ? min - 1 : baseRef.current.laneBase, lineIdx: refLine };
    }
    const laneBase = baseRef.current.laneBase;
    const pad = 10;
    const rowH = (h - pad * 2) / 11;
    const yOf = (note: number) => {
      const row = (((note - laneBase) % 12) + 12) % 12;
      return h - pad - row * rowH;
    };
    const pps = w / (PAST + FUTURE);
    const nowX = w * NOW_FRAC;
    const xOf = (time: number) => nowX + (time - t) * pps;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // backdrop + semitone grid
    ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let r = 0; r < 12; r++) {
      const y = h - pad - r * rowH;
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
    }
    // now line
    ctx.strokeStyle = "rgba(232, 200, 122, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nowX, 4);
    ctx.lineTo(nowX, h - 4);
    ctx.stroke();

    // target bars
    const barH = Math.max(6, rowH * 0.8);
    for (const s of flat) {
      if (s.note === undefined) continue;
      if (s.end < t - PAST || s.start > t + FUTURE) continue;
      const x0 = Math.max(2, xOf(s.start));
      const x1 = Math.min(w - 2, xOf(s.end));
      if (x1 <= x0) continue;
      const y = yOf(s.note);
      const rgb = VOICE_RGB[s.voice];
      const live = t >= s.start && t <= s.end;
      const res = session.getResult(s.globalIdx);
      const bh = s.emphasis ? barH * 1.25 : barH;
      ctx.fillStyle = `rgba(${rgb}, ${live ? 0.95 : res ? 0.35 : 0.6})`;
      ctx.beginPath();
      ctx.roundRect(x0, y - bh / 2, x1 - x0, bh, bh / 2);
      ctx.fill();
      if (res) {
        // gold fill proportional to accuracy
        ctx.fillStyle = `rgba(232, 200, 122, ${0.25 + 0.7 * res.ratio})`;
        ctx.beginPath();
        ctx.roundRect(x0, y - bh / 2, (x1 - x0) * Math.max(0.08, res.ratio), bh, bh / 2);
        ctx.fill();
      }
      if (live && !reducedMotion) {
        ctx.shadowColor = `rgba(${rgb}, 0.9)`;
        ctx.shadowBlur = 14;
        ctx.fillStyle = `rgba(${rgb}, 0.5)`;
        ctx.beginPath();
        ctx.roundRect(x0, y - bh / 2, x1 - x0, bh, bh / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    // singer trail (latency-corrected so it lines up with the bars)
    const hist = tracker.history;
    if (hist.length && !reducedMotion) {
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      let prevX: number | null = null;
      let prevY = 0;
      for (const s of hist) {
        const ts = s.t - micLatency;
        if (ts < t - PAST) continue;
        if (ts > t + 0.05) break;
        if (s.midi === null || s.confidence < 0.3) {
          prevX = null;
          continue;
        }
        const x = xOf(ts);
        const y = yOf(s.midi);
        const age = (t - ts) / PAST;
        if (prevX !== null && Math.abs(y - prevY) < rowH * 6) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${(1 - age) * 0.55 * s.confidence})`;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        prevX = x;
        prevY = y;
      }
    }
    // live dot
    const live = tracker.latest;
    if (live.midi !== null && live.confidence > 0.05) {
      const y = yOf(live.midi);
      const r = 5 + live.confidence * 2;
      if (!reducedMotion) {
        ctx.shadowColor = "rgba(255, 255, 255, 0.9)";
        ctx.shadowBlur = 16;
      }
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.65 * live.confidence})`;
      ctx.beginPath();
      ctx.arc(nowX, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  });

  return <canvas ref={canvasRef} className="pitch-lane" aria-hidden="true" data-testid="pitch-lane" />;
}
