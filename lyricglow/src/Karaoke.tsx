import { useRef, useEffect, useState, useCallback } from "react";
import type { Line, Syllable } from "./lyrics";
import { groupSyllablesIntoWords, easeInOutCubic, clamp } from "./lyrics";

const CONDUCTOR_LEAD = 0.32;

interface CueBallPos {
  x: number;
  y: number;
  visible: boolean;
}

interface SyllableRef {
  el: HTMLElement | null;
}

interface WordGroupRef {
  el: HTMLElement | null;
}

interface KaraokeProps {
  lines: Line[];
  time: number;
  playbackRate: number;
  isLandscape: boolean;
}

function useClock() {
  const [, setTick] = useState(0);
  useEffect(() => {
    let id: number;
    const loop = () => {
      setTick((t) => t + 1);
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}

export default function Karaoke({ lines, time, playbackRate, isLandscape }: KaraokeProps) {
  useClock();

  const containerRef = useRef<HTMLDivElement>(null);
  const sylRefs = useRef<Map<string, SyllableRef>>(new Map());
  const wordRefs = useRef<Map<string, WordGroupRef>>(new Map());
  const [cueBall, setCueBall] = useState<CueBallPos>({ x: 0, y: 0, visible: false });
  const prevCueRef = useRef<{ x: number; y: number } | null>(null);
  const animRef = useRef<number>(0);

  const getSylKey = (lineId: string, wordIdx: number, sylIdx: number) =>
    `${lineId}__w${wordIdx}__s${sylIdx}`;
  const getWordKey = (lineId: string, wordIdx: number) => `${lineId}__w${wordIdx}`;

  // Find active line
  const activeLine = lines.find((l) => time >= l.start - 1.5 && time <= l.end + 0.5) ?? null;

  // Context lines: previous and next
  const activeIdx = activeLine ? lines.indexOf(activeLine) : -1;
  const prevLine = activeIdx > 0 ? lines[activeIdx - 1] : null;
  const nextLine = activeIdx >= 0 && activeIdx < lines.length - 1 ? lines[activeIdx + 1] : null;

  const getCenter = useCallback((el: HTMLElement | null): { x: number; y: number } | null => {
    if (!el || !containerRef.current) return null;
    const cr = containerRef.current.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    return {
      x: er.left - cr.left + er.width / 2,
      y: er.top - cr.top + er.height / 2,
    };
  }, []);

  // Cue ball animation
  useEffect(() => {
    cancelAnimationFrame(animRef.current);

    if (!activeLine) {
      setCueBall({ x: 0, y: 0, visible: false });
      prevCueRef.current = null;
      return;
    }

    const lead = CONDUCTOR_LEAD / Math.max(0.4, playbackRate);
    const targetTime = time + lead;

    // Find which syllable the cue ball should point at
    let targetSyl: Syllable | null = null;
    let targetWordIdx = -1;
    let targetSylIdx = -1;

    const words = groupSyllablesIntoWords(activeLine.syllables);
    outer: for (let wi = 0; wi < words.length; wi++) {
      for (let si = 0; si < words[wi].length; si++) {
        const syl = words[wi][si];
        if (targetTime >= syl.start && targetTime <= syl.end) {
          targetSyl = syl;
          targetWordIdx = wi;
          targetSylIdx = si;
          break outer;
        }
        // Target next upcoming syllable
        if (targetTime < syl.start) {
          targetSyl = syl;
          targetWordIdx = wi;
          targetSylIdx = si;
          break outer;
        }
      }
    }

    if (!targetSyl) {
      // Past all syllables in line
      setCueBall((p) => ({ ...p, visible: false }));
      return;
    }

    const key = getSylKey(activeLine.id, targetWordIdx, targetSylIdx);
    const ref = sylRefs.current.get(key);
    const center = getCenter(ref?.el ?? null);

    if (!center) {
      setCueBall((p) => ({ ...p, visible: false }));
      return;
    }

    const prev = prevCueRef.current;
    if (!prev) {
      prevCueRef.current = center;
      setCueBall({ x: center.x, y: center.y, visible: true });
      return;
    }

    // Arc animation
    const startX = prev.x;
    const startY = prev.y;
    const endX = center.x;
    const endY = center.y;

    if (Math.abs(endX - startX) < 2 && Math.abs(endY - startY) < 2) {
      // Bounce/settle on same syllable
      const sylStart = targetSyl.start;
      const sylEnd = targetSyl.end;
      const p = clamp((time - sylStart) / (sylEnd - sylStart), 0, 1);
      const bounce = Math.sin(p * Math.PI) * 6;
      setCueBall({ x: endX, y: endY - bounce, visible: true });
      return;
    }

    // Transition arc
    const dist = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
    const arcDuration = clamp(dist / 300, 0.08, 0.25);
    const arcStart = (targetSyl?.start ?? time) - arcDuration;
    const t = clamp((time - arcStart) / arcDuration, 0, 1);
    const eased = easeInOutCubic(t);

    const x = startX + (endX - startX) * eased;
    const arcH = -Math.abs(endY - startY) * 0.4 - 8;
    const y = startY + (endY - startY) * eased + arcH * Math.sin(t * Math.PI);

    if (t >= 0.98) {
      prevCueRef.current = { x: endX, y: endY };
    }

    setCueBall({ x, y, visible: true });
  });

  const voiceClass = (v: Line["voice"]) =>
    v === "male" ? "voice-male" : v === "female" ? "voice-female" : "voice-duet";

  function renderLine(line: Line, role: "active" | "prev" | "next") {
    const words = groupSyllablesIntoWords(line.syllables);

    return (
      <div
        key={line.id}
        className={`lyric-line lyric-line--${role} ${voiceClass(line.voice)}`}
        data-testid={`lyric-line-${role}`}
        data-section={line.section}
      >
        {words.map((syls, wi) => {
          const wordKey = getWordKey(line.id, wi);
          const lastSyl = syls[syls.length - 1];
          const wordFinished = role === "active" && time > lastSyl.end + 0.05;
          const wordActive =
            role === "active" &&
            time >= syls[0].start &&
            time <= lastSyl.end + 0.05;

          const wordDropProgress = wordFinished
            ? clamp((time - lastSyl.end) / 0.4, 0, 1)
            : 0;
          const dropY = easeInOutCubic(wordDropProgress) * 12;
          const dropOpacity = 1 - wordDropProgress * 0.55;
          const isEmphasis = lastSyl.emphasis && role === "active";
          const emphasisActive =
            isEmphasis &&
            time >= lastSyl.start &&
            time <= lastSyl.end + 0.6;

          return (
            <span
              key={wordKey}
              className={[
                "lyric-word",
                wordFinished ? "lyric-word--finished" : "",
                wordActive ? "lyric-word--active" : "",
                emphasisActive ? "lyric-word--peak" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              ref={(el) => {
                wordRefs.current.set(wordKey, { el });
              }}
              style={
                role === "active"
                  ? {
                      transform: wordFinished ? `translateY(${dropY}px)` : undefined,
                      opacity: wordFinished ? dropOpacity : undefined,
                    }
                  : undefined
              }
            >
              {syls.map((syl, si) => {
                const sylKey = getSylKey(line.id, wi, si);
                const sylDur = syl.end - syl.start;
                const rawProg =
                  role === "active" && sylDur > 0
                    ? (time - syl.start) / sylDur
                    : time > syl.end
                    ? 1
                    : 0;
                const progress = clamp(rawProg, 0, 1);
                const eased = easeInOutCubic(progress);

                return (
                  <span
                    key={sylKey}
                    className="lyric-syllable"
                    ref={(el) => {
                      sylRefs.current.set(sylKey, { el });
                    }}
                    data-testid={`syllable-${sylKey}`}
                    style={
                      role === "active"
                        ? ({
                            "--reveal": eased,
                          } as React.CSSProperties)
                        : undefined
                    }
                  >
                    {syl.text}
                  </span>
                );
              })}
              {/* Ghost copy of finished word */}
              {wordFinished && role === "active" && (
                <span
                  className="lyric-word-ghost"
                  aria-hidden="true"
                  style={{
                    opacity: clamp(
                      0.28 - clamp((time - lastSyl.end - 0.4) / 2.5, 0, 1) * 0.28,
                      0,
                      0.28
                    ),
                  }}
                >
                  {syls.map((s) => s.text).join("")}
                </span>
              )}
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
    >
      {/* Section label */}
      {activeLine && (
        <div className="section-label" data-testid="section-label">
          {activeLine.section}
        </div>
      )}

      <div className="lyric-lines-container">
        {prevLine && renderLine(prevLine, "prev")}
        {activeLine && renderLine(activeLine, "active")}
        {nextLine && renderLine(nextLine, "next")}
      </div>

      {/* Cue ball */}
      {cueBall.visible && activeLine && (
        <div
          className="cue-ball"
          data-testid="cue-ball"
          style={{
            transform: `translate(${cueBall.x}px, ${cueBall.y - 38}px)`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
