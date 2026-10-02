import { useEffect, useRef } from "react";
import type { Voice } from "../lyrics";
import type { Point } from "./CueBall";

export interface StageFx {
  /** burst of embers from a peak word (stage coordinates) */
  emit(p: Point, voice: Voice): void;
  /** end-of-song golden rain for ~3 s */
  finale(): void;
  clear(): void;
}

interface Props {
  enabled: boolean;
  theme: "dark" | "light";
  fxRef: React.MutableRefObject<StageFx | null>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  ttl: number;
  size: number;
  rgb: string;
  spin: number;
  rot: number;
  kind: 0 | 1; // ember | confetti
}

const VOICE_RGB: Record<Voice, string> = { male: "0, 212, 255", female: "244, 160, 192", duet: "232, 200, 122" };
const MAX = 420;

/** Canvas ember/confetti layer. Runs its own wall-clock loop only while particles are alive. */
export default function ParticleLayer({ enabled, theme, fxRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef({
    ps: [] as Particle[],
    raf: 0,
    last: 0,
    size: { w: 0, h: 0, dpr: 1 },
    finaleUntil: 0,
    finaleNext: 0,
    enabled,
    theme,
    emitted: 0,
  });
  useEffect(() => {
    stateRef.current.enabled = enabled;
    stateRef.current.theme = theme;
  }, [enabled, theme]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const st = stateRef.current;
    const ro = new ResizeObserver(() => {
      const r = c.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
      st.size = { w: r.width, h: r.height, dpr };
    });
    ro.observe(c);

    const loop = (now: number) => {
      st.raf = 0;
      const dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0.016;
      st.last = now;
      const { w, h, dpr } = st.size;
      const ctx = c.getContext("2d");
      if (!ctx || !w || !h) return;

      // finale emitter
      if (now < st.finaleUntil && now >= st.finaleNext) {
        st.finaleNext = now + 90;
        for (let i = 0; i < 10 && st.ps.length < MAX; i++) {
          const gold = Math.random() < 0.7;
          st.ps.push({
            x: Math.random() * w,
            y: -10 - Math.random() * 30,
            vx: (Math.random() - 0.5) * 60,
            vy: 40 + Math.random() * 90,
            g: 60,
            life: 0,
            ttl: 2.6 + Math.random() * 1.6,
            size: 3 + Math.random() * 4,
            rgb: gold ? VOICE_RGB.duet : Math.random() < 0.5 ? VOICE_RGB.male : VOICE_RGB.female,
            spin: (Math.random() - 0.5) * 8,
            rot: Math.random() * Math.PI,
            kind: 1,
          });
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = st.theme === "dark" ? "lighter" : "source-over";
      const ps = st.ps;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.ttl || p.y > h + 20) {
          ps[i] = ps[ps.length - 1];
          ps.pop();
          continue;
        }
        p.vy += p.g * dt;
        p.vx *= 1 - 0.9 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        const f = p.life / p.ttl;
        if (p.kind === 0) {
          const a = (1 - f) * (0.55 + 0.45 * Math.sin(p.life * 23 + p.x));
          const r = p.size * (1 - f * 0.6);
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.2);
          grad.addColorStop(0, `rgba(255, 250, 235, ${a})`);
          grad.addColorStop(0.35, `rgba(${p.rgb}, ${a * 0.9})`);
          grad.addColorStop(1, `rgba(${p.rgb}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const a = f < 0.85 ? 0.9 : 0.9 * (1 - (f - 0.85) / 0.15);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = `rgba(${p.rgb}, ${a})`;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      if (ps.length || now < st.finaleUntil) st.raf = requestAnimationFrame(loop);
      else {
        st.last = 0;
        ctx.clearRect(0, 0, w, h);
      }
    };
    const kick = () => {
      if (!st.raf) st.raf = requestAnimationFrame(loop);
    };

    const fx: StageFx = {
      emit(p, voice) {
        if (!st.enabled) return;
        const rgb = VOICE_RGB[voice];
        const n = 26 + Math.floor(Math.random() * 14);
        for (let i = 0; i < n && st.ps.length < MAX; i++) {
          const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
          const sp = 40 + Math.random() * 130;
          st.ps.push({
            x: p.x + (Math.random() - 0.5) * 90,
            y: p.y + (Math.random() - 0.5) * 22,
            vx: Math.cos(ang) * sp,
            vy: Math.sin(ang) * sp,
            g: -28,
            life: 0,
            ttl: 0.9 + Math.random() * 0.9,
            size: 1.6 + Math.random() * 2.4,
            rgb,
            spin: 0,
            rot: 0,
            kind: 0,
          });
        }
        st.emitted++;
        c.dataset.emitted = String(st.emitted);
        kick();
      },
      finale() {
        if (!st.enabled) return;
        const now = performance.now();
        st.finaleUntil = now + 3200;
        st.finaleNext = now;
        c.dataset.finale = "1";
        kick();
      },
      clear() {
        st.ps.length = 0;
        st.finaleUntil = 0;
      },
    };
    fxRef.current = fx;
    return () => {
      ro.disconnect();
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = 0;
      if (fxRef.current === fx) fxRef.current = null;
    };
  }, [fxRef]);

  return <canvas ref={canvasRef} className="particle-canvas" aria-hidden="true" data-testid="particle-canvas" />;
}
