import { useRef } from "react";
import type { ScoreSummary } from "../engine/scoring";
import { useModalFocus } from "../hooks/useModalFocus";

interface Props {
  title: string;
  summary: ScoreSummary | null;
  micOn: boolean;
  onSingAgain: () => void;
  onClose: () => void;
  /** in a set with a song still to come: "Next: <title>" becomes the primary action */
  nextTitle?: string;
  onNext?: () => void;
  /** in a set: "End set" replaces Close */
  onEndSet?: () => void;
}

/**
 * End-of-song result. Button order (= focus order): in a set with a next song
 * Next · Sing again · End set; on the last song of a set Sing again · End set;
 * otherwise Sing again · Close. The first button gets focus; the screen waits for a tap.
 */
export default function GradeScreen({ title, summary, micOn, onSingAgain, onClose, nextTitle, onNext, onEndSet }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const hasNext = !!nextTitle && !!onNext;
  useModalFocus(true, ref, hasNext ? "[data-testid=btn-next]" : "[data-testid=btn-sing-again]");
  return (
    <div className="grade-backdrop" data-testid="grade-screen" role="dialog" aria-modal="true" aria-label="Performance result" ref={ref}>
      <div className="grade-card">
        <p className="grade-kicker">{summary ? "Your performance" : "Song complete"}</p>
        <h2 className="grade-title">{title}</h2>
        {summary ? (
          <>
            <div className="grade-letter-wrap">
              <span className={`grade-letter grade-letter--${summary.grade.toLowerCase()}`} data-testid="grade-letter">
                {summary.grade}
              </span>
              {summary.partial && <span className="grade-partial">Partial</span>}
            </div>
            <dl className="grade-stats">
              <div>
                <dt>Score</dt>
                <dd data-testid="grade-score">{summary.total.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Accuracy</dt>
                <dd>{Math.round(summary.accuracy * 100)}%</dd>
              </div>
              <div>
                <dt>Max combo</dt>
                <dd>×{summary.maxCombo}</dd>
              </div>
              <div>
                <dt>Perfect lines</dt>
                <dd>
                  {summary.perfectLines}/{summary.lines}
                </dd>
              </div>
              {summary.meanCents !== null && (
                <div>
                  <dt>Pitch error</dt>
                  <dd>{Math.round(summary.meanCents)}¢</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="grade-hint">{micOn ? "No syllables were scored." : "Turn the microphone on to get a score and a grade next time."}</p>
        )}
        <div className="grade-actions">
          {hasNext && (
            <button type="button" className="transport-btn transport-btn--primary" onClick={onNext} data-testid="btn-next">
              Next: {nextTitle}
            </button>
          )}
          <button type="button" className={hasNext ? "dock-btn" : "transport-btn transport-btn--primary"} onClick={onSingAgain} data-testid="btn-sing-again">
            Sing again
          </button>
          {onEndSet ? (
            <button type="button" className="dock-btn" onClick={onEndSet} data-testid="btn-end-set">
              End set
            </button>
          ) : (
            <button type="button" className="dock-btn" onClick={onClose} data-testid="btn-close-grade">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
