import { useEffect, useRef } from "react";
import type { PlaybackEngine } from "../engine/PlaybackEngine";
import type { Theme } from "./Header";

interface Props {
  engine: PlaybackEngine;
  theme: Theme;
  reducedMotion: boolean;
}

interface Tile {
  pts: [number, number, number, number, number, number];
  rgb: [number, number, number];
  alpha: number;
  /** 0..1 phase so neighbouring regions breathe at different times */
  band: number;
}

const DARK = {
  tints: [
    [232, 200, 122],
    [0, 212, 255],
    [244, 160, 192],
    [196, 186, 220],
  ] as [number, number, number][],
  weights: [0.4, 0.25, 0.15, 0.2],
  alpha: [0.035, 0.1],
  seam: "rgba(10, 10, 14, 0.85)",
};
const LIGHT = {
  tints: [
    [168, 120, 28],
    [0, 151, 184],
    [200, 80, 126],
    [90, 70, 50],
  ] as [number, number, number][],
  weights: [0.4, 0.25, 0.15, 0.2],
  alpha: [0.04, 0.1],
  seam: "rgba(245, 240, 232, 0.9)",
};

/** small deterministic PRNG so the mosaic is stable across repaints */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTiles(w: number, h: number, theme: Theme, seed = 7): Tile[] {
  const pal = theme === "light" ? LIGHT : DARK;
  const rnd = mulberry32(seed);
  const cell = Math.max(70, Math.min(130, Math.min(w, h) * 0.09 + 40));
  const cols = Math.ceil(w / cell) + 3;
  const rows = Math.ceil(h / (cell * 0.866)) + 3;
  const jitter = cell * 0.28;
  // jittered triangular lattice, one cell of bleed on every side so drift never shows an edge
  const grid: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c <= cols; c++) {
      const x = (c - 1.5) * cell + (r % 2 ? cell / 2 : 0) + (rnd() - 0.5) * jitter;
      const y = (r - 1.5) * cell * 0.866 + (rnd() - 0.5) * jitter;
      row.push([x, y]);
    }
    grid.push(row);
  }
  const pick = (): [number, number, number] => {
    let u = rnd();
    for (let i = 0; i < pal.weights.length; i++) {
      u -= pal.weights[i];
      if (u <= 0) return pal.tints[i];
    }
    return pal.tints[pal.tints.length - 1];
  };
  const tiles: Tile[] = [];
  const push = (a: [number, number], b: [number, number], c: [number, number]) => {
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    tiles.push({
      pts: [a[0], a[1], b[0], b[1], c[0], c[1]],
      rgb: pick(),
      alpha: pal.alpha[0] + rnd() * (pal.alpha[1] - pal.alpha[0]),
      band: ((cx / (w || 1)) * 0.6 + (cy / (h || 1)) * 0.4 + rnd() * 0.15) % 1,
    });
  };
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p00 = grid[r][c];
      const p01 = grid[r][c + 1];
      const p10 = grid[r + 1][c];
      const p11 = grid[r + 1][c + 1];
      if (r % 2) {
        push(p00, p01, p11);
        push(p00, p11, p10);
      } else {
        push(p00, p01, p10);
        push(p01, p11, p10);
      }
    }
  }
  return tiles;
}

/**
 * Toned-down abstract mosaic behind the stage when no video is showing: a jittered
 * triangular lattice tinted with the palette at ≤ ~10 % alpha, drifting a few pixels
 * and breathing softly while the song plays. Static under reduced motion.
 */
export default function MosaicBackdrop({ engine, theme, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({ tiles: [] as Tile[], w: 0, h: 0, dpr: 1, theme, reducedMotion, lastDraw: 0, lastPlaying: 0, dirty: true });
  useEffect(() => {
    const st = stateRef.current;
    st.theme = theme;
    st.reducedMotion = reducedMotion;
    st.tiles = st.w && st.h ? buildTiles(st.w, st.h, theme) : [];
    st.dirty = true;
    canvasRef.current?.setAttribute("data-tiles", String(st.tiles.length));
    engine.requestFrame();
  }, [theme, reducedMotion, engine]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const st = stateRef.current;

    const draw = (now: number, playing: boolean) => {
      const ctx = c.getContext("2d");
      if (!ctx || !st.w || !st.h) return;
      const pal = st.theme === "light" ? LIGHT : DARK;
      const animate = playing && !st.reducedMotion;
      const t = animate ? now / 1000 : 0;
      const energyRaw = parseFloat(document.documentElement.style.getPropertyValue("--energy"));
      const energy = animate && Number.isFinite(energyRaw) ? energyRaw : 0.35;
      const dx = animate ? 8 * Math.sin((t * Math.PI * 2) / 43) : 0;
      const dy = animate ? 6 * Math.cos((t * Math.PI * 2) / 37) : 0;
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, st.w, st.h);
      ctx.translate(dx, dy);
      ctx.lineWidth = 1.2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = pal.seam;
      const lift = 1 + 0.12 * energy;
      for (const tile of st.tiles) {
        const breathe = animate ? 0.85 + 0.15 * Math.sin(t * 0.3 + tile.band * Math.PI * 2) : 1;
        const a = Math.min(0.14, tile.alpha * breathe * lift);
        const [r, g, b] = tile.rgb;
        const p = tile.pts;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[2], p[3]);
        ctx.lineTo(p[4], p[5]);
        ctx.closePath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
        ctx.fill();
        ctx.stroke();
      }
    };

    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      if (!r.width || !r.height) return;
      st.dpr = Math.min(2, window.devicePixelRatio || 1);
      st.w = r.width;
      st.h = r.height;
      c.width = Math.round(r.width * st.dpr);
      c.height = Math.round(r.height * st.dpr);
      st.tiles = buildTiles(st.w, st.h, st.theme);
      c.setAttribute("data-tiles", String(st.tiles.length));
      st.dirty = true;
      engine.requestFrame();
    });
    ro.observe(c);

    const unsub = engine.subscribeFrame((f) => {
      if (f.playing) st.lastPlaying = f.now;
      const settling = f.now - st.lastPlaying < 1200;
      const animate = (f.playing || settling) && !st.reducedMotion;
      if (!animate && !st.dirty) return;
      if (animate && f.now - st.lastDraw < 41) return; // ≤ 24 fps is plenty for a backdrop
      st.lastDraw = f.now;
      st.dirty = false;
      draw(f.now, animate);
      c.dataset.animating = String(animate);
    }, "render");

    return () => {
      ro.disconnect();
      unsub();
    };
  }, [engine]);

  return <canvas ref={canvasRef} className="stage-mosaic" data-testid="mosaic-canvas" aria-hidden="true" />;
}
