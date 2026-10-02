import { useEffect, useRef } from "react";
import type { AudioGraph } from "../engine/AudioGraph";
import { Envelope, syntheticBass, syntheticEnergy } from "../engine/beat";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import { useFrame } from "../engine/useFrame";
import type { TrackTimeline } from "../model/timeline";

interface Props {
  engine: PlaybackEngine;
  graph: AudioGraph;
  timeline: TrackTimeline;
  /** draw bars (false = only drive the CSS variables) */
  visible: boolean;
  reducedMotion: boolean;
  theme: "dark" | "light";
}

const BANDS = 48;

/**
 * Audio-reactive footlights: a mirrored log-spaced spectrum at the bottom of
 * the stage. Also publishes --bass / --energy on <html> for CSS-driven light.
 * Falls back to a BPM-synced synthetic pulse without an analyser.
 */
export default function SpectrumCanvas({ engine, graph, timeline, visible, reducedMotion, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef<Float32Array>(new Float32Array(BANDS));
  const envRef = useRef({ bass: new Envelope(0.6, 0.08), energy: new Envelope(0.5, 0.06), lastBassVar: -1, lastEnergyVar: -1, size: { w: 0, h: 0, dpr: 1 } });

  // size to container
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      envRef.current.size = { w: r.width, h: r.height, dpr };
    });
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  useEffect(() => () => {
    document.documentElement.style.removeProperty("--bass");
    document.documentElement.style.removeProperty("--energy");
  }, []);

  useFrame(engine, "render", (f) => {
    const env = envRef.current;
    const bands = bandsRef.current;
    const t = f.time + (timeline.track.offset ?? 0);
    let bass: number;
    let energy: number;
    const spectrum = graph.mediaAnalyserActive ? graph.readSpectrum() : null;

    if (spectrum) {
      // real spectrum → log-spaced bands
      const binHz = graph.binHz;
      const nBins = spectrum.length;
      const fMin = 40;
      const fMax = Math.min(14000, binHz * nBins);
      let sum = 0;
      for (let i = 0; i < BANDS; i++) {
        const f0 = fMin * Math.pow(fMax / fMin, i / BANDS);
        const f1 = fMin * Math.pow(fMax / fMin, (i + 1) / BANDS);
        const b0 = Math.max(0, Math.floor(f0 / binHz));
        const b1 = Math.min(nBins - 1, Math.max(b0, Math.floor(f1 / binHz)));
        let m = 0;
        for (let b = b0; b <= b1; b++) if (spectrum[b] > m) m = spectrum[b];
        const v = m / 255;
        bands[i] = v;
        sum += v;
      }
      let bsum = 0;
      let bn = 0;
      for (let b = 1; b * binHz < 160 && b < nBins; b++) {
        bsum += spectrum[b];
        bn++;
      }
      const rawBass = bn ? bsum / bn / 255 : 0;
      bass = env.bass.step(Math.pow(Math.max(0, rawBass - 0.35) / 0.65, 1.6));
      energy = env.energy.step(sum / BANDS);
    } else {
      // synthetic beat pulse (demo clock, or analyser unavailable)
      const playing = f.playing;
      const sb = playing ? syntheticBass(t, timeline.beat, timeline.beatOffset) : 0;
      bass = env.bass.step(sb);
      energy = env.energy.step(playing ? syntheticEnergy(sb) : 0.2);
      for (let i = 0; i < BANDS; i++) {
        const x = i / BANDS;
        const shape = Math.exp(-Math.pow((x - 0.18) / 0.22, 2)) * 0.9 + Math.exp(-Math.pow((x - 0.62) / 0.3, 2)) * 0.35;
        const shimmer = 0.75 + 0.25 * Math.sin(t * 2.1 + i * 0.7);
        bands[i] = playing ? (0.12 + 0.55 * bass) * shape * shimmer : 0.04 * shape;
      }
    }

    if (reducedMotion) bass = 0;
    const root = document.documentElement.style;
    if (Math.abs(bass - env.lastBassVar) > 0.01) {
      root.setProperty("--bass", bass.toFixed(3));
      env.lastBassVar = bass;
    }
    if (Math.abs(energy - env.lastEnergyVar) > 0.01) {
      root.setProperty("--energy", energy.toFixed(3));
      env.lastEnergyVar = energy;
    }

    // draw
    const c = canvasRef.current;
    if (!c || !visible) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { w, h, dpr } = env.size;
    if (!w || !h) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const half = BANDS;
    const bw = w / (half * 2);
    const gap = bw * 0.28;
    const dark = theme === "dark";
    ctx.globalCompositeOperation = dark ? "lighter" : "source-over";
    const smooth = reducedMotion ? 0.35 : 1;
    for (let i = 0; i < half; i++) {
      const v = Math.min(1, bands[i] * smooth);
      const bh = Math.max(1.5, v * h * 0.92);
      const alpha = dark ? 0.1 + v * 0.55 : 0.08 + v * 0.35;
      const hue = i < half * 0.3 ? "232, 200, 122" : i < half * 0.65 ? "0, 212, 255" : "244, 160, 192";
      const grad = ctx.createLinearGradient(0, h - bh, 0, h);
      grad.addColorStop(0, `rgba(${hue}, ${alpha})`);
      grad.addColorStop(1, `rgba(${hue}, ${alpha * 0.15})`);
      ctx.fillStyle = grad;
      // mirrored: center outwards
      const xr = w / 2 + i * bw;
      const xl = w / 2 - (i + 1) * bw;
      ctx.fillRect(xr + gap / 2, h - bh, bw - gap, bh);
      ctx.fillRect(xl + gap / 2, h - bh, bw - gap, bh);
    }
    ctx.globalCompositeOperation = "source-over";
  });

  return <canvas ref={canvasRef} className={`spectrum-canvas ${visible ? "" : "spectrum-canvas--hidden"}`} aria-hidden="true" data-testid="spectrum-canvas" />;
}
