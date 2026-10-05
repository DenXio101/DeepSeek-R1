import { useLayoutEffect, useRef, useState } from "react";
import type { PlaybackEngine } from "./engine/PlaybackEngine";
import { useFrame } from "./engine/useFrame";
import { clamp, easeInOutCubic, groupSyllablesIntoWords, wordText, type Line, type Voice } from "./lyrics";
import type { TrackTimeline } from "./model/timeline";
import { beatPulse, conductorLead, createCueState, resetCue, stepCue, type Point } from "./components/CueBall";

type Role = "prev2" | "prev" | "active" | "next";

interface KaraokeProps {
  engine: PlaybackEngine;
  timeline: TrackTimeline;
  activeIdx: number;
  cursorIdx: number;
  generation: number;
  isLandscape: boolean;
  reducedMotion: boolean;
  /** fired once when an emphasised word peaks (stage coords) */
  onPeak?: (p: Point, voice: Voice) => void;
}

const WORD_DROP_PX = 12;
const WORD_DROP_DUR = 0.4;
const GHOST_PEAK = 0.3;
const GHOST_HOLD = 0.4;
const GHOST_FADE = 2.6;
const PEAK_TAIL = 0.6;

const sylKeyOf = (lineId: string, wi: number, si: number) => `${lineId}__w${wi}__s${si}`;
const wordKeyOf = (lineId: string, wi: number) => `${lineId}__w${wi}`;

/** mutable per-instance scratch state kept out of React */
function makeScratch(): Scratch {
  return {
    sylEls: new Map(),
    wordEls: new Map(),
    ghostEls: new Map(),
    lineEls: new Map(),
    centers: new Map(),
    wordCenters: new Map(),
    lastReveal: new Map(),
    lastWordClass: new Map(),
    lastGhost: new Map(),
    peakFired: new Set(),
    lineTops: new Map(),
    cue: createCueState(),
    cueVisible: false,
    lastGeneration: -1,
  };
}

interface Scratch {
  sylEls: Map<string, HTMLElement>;
  wordEls: Map<string, HTMLElement>;
  ghostEls: Map<string, HTMLElement>;
  lineEls: Map<string, HTMLElement>;
  centers: Map<string, Point>;
  wordCenters: Map<string, Point>;
  lastReveal: Map<string, number>;
  lastWordClass: Map<string, string>;
  lastGhost: Map<string, number>;
  peakFired: Set<string>;
  lineTops: Map<string, number>;
  cue: ReturnType<typeof createCueState>;
  cueVisible: boolean;
  lastGeneration: number;
}

export default function Karaoke({
  engine,
  timeline,
  activeIdx,
  cursorIdx,
  generation,
  isLandscape,
  reducedMotion,
  onPeak,
}: KaraokeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cueRef = useRef<HTMLDivElement>(null);
  const onPeakRef = useRef(onPeak);
  useLayoutEffect(() => {
    onPeakRef.current = onPeak;
  });

  // element registries (stable objects, pruned by React 19 ref cleanups)
  const scratchRef = useRef<Scratch | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);

  const lines = timeline.track.lines;
  const activeLine: Line | null = activeIdx >= 0 ? lines[activeIdx] : null;

  // slots
  const slots: { line: Line; role: Role }[] = [];
  const base = activeIdx >= 0 ? activeIdx : cursorIdx;
  const push = (i: number, role: Role) => {
    if (i >= 0 && i < lines.length) slots.push({ line: lines[i], role });
  };
  if (activeIdx >= 0) {
    push(activeIdx - 2, "prev2");
    push(activeIdx - 1, "prev");
    push(activeIdx, "active");
    push(activeIdx + 1, "next");
  } else {
    push(base - 2, "prev2");
    push(base - 1, "prev");
    push(base, "next");
  }

  // ── measurement: container resize / fonts → relayout tick ───────────────────
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const bump = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setLayoutTick((n) => n + 1));
    };
    const ro = new ResizeObserver(bump);
    ro.observe(el);
    if (document.fonts?.ready) void document.fonts.ready.then(bump);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  // ── on line / layout change: FLIP line moves, reset imperative state, cache rects ──
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scratch = (scratchRef.current ??= makeScratch());
    const crect = container.getBoundingClientRect();
    const { sylEls, wordEls, ghostEls, lineEls } = scratch;
    sylEls.clear();
    wordEls.clear();
    ghostEls.clear();
    lineEls.clear();
    for (const el of container.querySelectorAll<HTMLElement>("[data-line-id]")) lineEls.set(el.dataset.lineId!, el);
    for (const el of container.querySelectorAll<HTMLElement>("[data-word-key]")) wordEls.set(el.dataset.wordKey!, el);
    for (const el of container.querySelectorAll<HTMLElement>("[data-ghost-key]")) ghostEls.set(el.dataset.ghostKey!, el);
    for (const el of container.querySelectorAll<HTMLElement>("[data-syl-key]")) sylEls.set(el.dataset.sylKey!, el);

    // FLIP: lines that moved slots glide instead of jumping
    if (!reducedMotion) {
      for (const [id, el] of lineEls) {
        const prevTop = scratch.lineTops.get(id);
        const top = el.getBoundingClientRect().top - crect.top;
        if (prevTop !== undefined && Math.abs(prevTop - top) > 1) {
          const dy = prevTop - top;
          el.style.transition = "none";
          el.style.setProperty("--flip-y", `${dy}px`);
          void el.offsetHeight; // commit the start position
          el.style.transition = "";
          el.style.setProperty("--flip-y", "0px");
        }
      }
    }

    // reset every imperative style; the active line is re-driven next frame
    for (const el of wordEls.values()) {
      el.style.transform = "";
      el.style.opacity = "";
      el.classList.remove("lyric-word--active", "lyric-word--finished", "lyric-word--peak");
    }
    for (const el of sylEls.values()) el.style.removeProperty("--reveal");
    for (const el of ghostEls.values()) el.style.opacity = "";
    scratch.lastReveal.clear();
    scratch.lastWordClass.clear();
    scratch.lastGhost.clear();
    scratch.peakFired.clear();
    resetCue(scratch.cue);

    // cache syllable + word centres of the active line in stage coordinates
    scratch.centers.clear();
    scratch.wordCenters.clear();
    if (activeLine) {
      const words = groupSyllablesIntoWords(activeLine.syllables);
      words.forEach((syls, wi) => {
        const wk = wordKeyOf(activeLine.id, wi);
        const wel = wordEls.get(wk);
        if (wel) {
          const r = wel.getBoundingClientRect();
          scratch.wordCenters.set(wk, { x: r.left - crect.left + r.width / 2, y: r.top - crect.top + r.height / 2 });
        }
        syls.forEach((_, si) => {
          const sk = sylKeyOf(activeLine.id, wi, si);
          const sel = sylEls.get(sk);
          if (!sel) return;
          const r = sel.getBoundingClientRect();
          scratch.centers.set(sk, { x: r.left - crect.left + r.width / 2, y: r.top - crect.top + r.height / 2 });
        });
      });
    }

    // remember line tops for the next FLIP
    scratch.lineTops.clear();
    for (const [id, el] of lineEls) scratch.lineTops.set(id, el.getBoundingClientRect().top - crect.top);

    engine.requestFrame();
  }, [activeLine, generation, isLandscape, layoutTick, reducedMotion, engine]);

  // ── per-frame drive ───────────────────────────────────────────────────────
  useFrame(engine, "render", (f) => {
    const scratch = (scratchRef.current ??= makeScratch());
    const { sylEls, wordEls, ghostEls } = scratch;
    const t = f.time + (timeline.track.offset ?? 0);
    const cueEl = cueRef.current;

    if (f.generation !== scratch.lastGeneration) {
      scratch.lastGeneration = f.generation;
      scratch.peakFired.clear();
      resetCue(scratch.cue);
    }

    if (!activeLine) {
      if (scratch.cueVisible && cueEl) {
        cueEl.classList.remove("cue-ball--visible");
        scratch.cueVisible = false;
      }
      return;
    }

    const words = groupSyllablesIntoWords(activeLine.syllables);
    const lineId = activeLine.id;

    words.forEach((syls, wi) => {
      const wk = wordKeyOf(lineId, wi);
      const body = wordEls.get(wk);
      if (!body) return;
      const first = syls[0];
      const last = syls[syls.length - 1];
      const finished = t > last.end + 0.05;
      const active = !finished && t >= first.start;
      const peaking = !!last.emphasis && t >= last.start && t <= last.end + PEAK_TAIL;

      // syllable reveal
      syls.forEach((syl, si) => {
        const sk = sylKeyOf(lineId, wi, si);
        const el = sylEls.get(sk);
        if (!el) return;
        const dur = syl.end - syl.start;
        const p = dur > 0 ? clamp((t - syl.start) / dur, 0, 1) : t >= syl.end ? 1 : 0;
        const eased = easeInOutCubic(p);
        const prev = scratch.lastReveal.get(sk);
        if (prev === undefined || Math.abs(prev - eased) > 0.004 || (eased === 1 && prev !== 1) || (eased === 0 && prev !== 0)) {
          el.style.setProperty("--reveal", eased.toFixed(3));
          scratch.lastReveal.set(sk, eased);
        }
      });

      // word classes
      const cls = `${active ? "a" : ""}${finished ? "f" : ""}${peaking ? "p" : ""}`;
      if (scratch.lastWordClass.get(wk) !== cls) {
        body.classList.toggle("lyric-word--active", active);
        body.classList.toggle("lyric-word--finished", finished);
        body.classList.toggle("lyric-word--peak", peaking && !reducedMotion);
        scratch.lastWordClass.set(wk, cls);
      }

      // peak event (once per pass)
      if (peaking && !scratch.peakFired.has(wk)) {
        scratch.peakFired.add(wk);
        const c = scratch.wordCenters.get(wk);
        const host = containerRef.current;
        if (c && host && onPeakRef.current) {
          // hand over viewport coordinates: the particle canvas covers the whole stage, not just this block
          const cr = host.getBoundingClientRect();
          onPeakRef.current({ x: c.x + cr.left, y: c.y + cr.top }, activeLine.voice);
        }
      } else if (!peaking && t < last.start && scratch.peakFired.has(wk)) {
        scratch.peakFired.delete(wk);
      }

      // word fall + ghost
      if (finished) {
        const dp = clamp((t - last.end) / WORD_DROP_DUR, 0, 1);
        const e = easeInOutCubic(dp);
        if (reducedMotion) {
          body.style.transform = "";
          body.style.opacity = String(1 - dp * 0.45);
        } else {
          body.style.transform = `translateY(${(e * WORD_DROP_PX).toFixed(2)}px)`;
          body.style.opacity = (1 - dp * 0.55).toFixed(3);
        }
        const ghost = ghostEls.get(wk);
        if (ghost) {
          const since = t - last.end;
          const g =
            since < GHOST_HOLD
              ? GHOST_PEAK * clamp(since / 0.15, 0, 1)
              : GHOST_PEAK * (1 - clamp((since - GHOST_HOLD) / GHOST_FADE, 0, 1));
          const lg = scratch.lastGhost.get(wk);
          if (lg === undefined || Math.abs(lg - g) > 0.004) {
            ghost.style.opacity = g.toFixed(3);
            scratch.lastGhost.set(wk, g);
          }
        }
      } else if (scratch.lastGhost.has(wk) || body.style.transform !== "") {
        body.style.transform = "";
        body.style.opacity = "";
        const ghost = ghostEls.get(wk);
        if (ghost) ghost.style.opacity = "";
        scratch.lastGhost.delete(wk);
      }
    });

    // ── cue ball ──
    if (!cueEl) return;
    const lead = conductorLead(f.rate);
    const target = t + lead;
    let tk: string | null = null;
    let tsyl: { start: number; end: number } | null = null;
    outer: for (let wi = 0; wi < words.length; wi++) {
      for (let si = 0; si < words[wi].length; si++) {
        const s = words[wi][si];
        if (target <= s.end) {
          tk = sylKeyOf(lineId, wi, si);
          tsyl = s;
          break outer;
        }
      }
    }
    const center = tk ? scratch.centers.get(tk) : undefined;
    if (!tk || !tsyl || !center) {
      if (scratch.cueVisible) {
        cueEl.classList.remove("cue-ball--visible");
        scratch.cueVisible = false;
      }
      return;
    }
    const p = stepCue(scratch.cue, tk, center, tsyl, t, reducedMotion);
    const pulse = reducedMotion ? 1 : beatPulse(t, timeline.beat, timeline.beatOffset);
    cueEl.style.transform = `translate3d(${(p.x - 7).toFixed(1)}px, ${(p.y - 7).toFixed(1)}px, 0) scale(${pulse.toFixed(3)})`;
    if (!scratch.cueVisible) {
      cueEl.classList.add("cue-ball--visible");
      scratch.cueVisible = true;
    }
  });

  function renderLine(line: Line, role: Role) {
    const words = groupSyllablesIntoWords(line.syllables);
    return (
      <div
        key={line.id}
        className={`lyric-line lyric-line--${role} voice-${line.voice}`}
        data-testid={`lyric-line-${role}`}
        data-section={line.section}
        data-line-id={line.id}
      >
        {words.map((syls, wi) => {
          const wk = wordKeyOf(line.id, wi);
          return (
            <span key={wk} className="lyric-word-slot">
              <span className="lyric-word" data-word-key={wk} data-testid={`word-${wk}`}>
                {syls.map((syl, si) => {
                  const sk = sylKeyOf(line.id, wi, si);
                  return (
                    <span key={sk} className="lyric-syllable" data-syl-key={sk} data-testid={`syllable-${sk}`}>
                      {syl.text}
                    </span>
                  );
                })}
              </span>
              <span className="lyric-word-ghost" data-ghost-key={wk} aria-hidden="true">
                {wordText(syls)}
              </span>
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className={`karaoke-stage ${isLandscape ? "karaoke-stage--landscape" : ""}`}
      ref={containerRef}
      data-testid="karaoke-stage"
      data-active-line={activeLine?.id ?? ""}
    >
      <div className="lyric-lines-container" aria-live="off">
        {slots.map(({ line, role }) => renderLine(line, role))}
      </div>
      <div className="cue-ball" ref={cueRef} data-testid="cue-ball" aria-hidden="true" />
    </div>
  );
}
