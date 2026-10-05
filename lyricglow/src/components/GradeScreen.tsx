import type { ScoreSummary } from "../engine/scoring";

interface Props {
  title: string;
  summary: ScoreSummary | null;
  micOn: boolean;
  onSingAgain: () => void;
  onClose: () => void;
}

export default function GradeScreen({ title, summary, micOn, onSingAgain, onClose }: Props) {
  return (
    <div className="grade-backdrop" data-testid="grade-screen" role="dialog" aria-modal="true" aria-label="Performance result">
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
          <button type="button" className="transport-btn transport-btn--primary" onClick={onSingAgain} data-testid="btn-sing-again">
            Sing again
          </button>
          <button type="button" className="dock-btn" onClick={onClose} data-testid="btn-close-grade">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
