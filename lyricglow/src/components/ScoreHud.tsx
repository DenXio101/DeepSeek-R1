import type { ScoreSnapshot } from "../engine/KaraokeSession";

interface Props {
  score: ScoreSnapshot;
}

export default function ScoreHud({ score }: Props) {
  const rating = score.lastLine;
  return (
    <div className="score-hud" data-testid="score-hud">
      <div className="score-main">
        <span className="score-label">Score</span>
        <span className="score-value" data-testid="score-value">
          {score.total.toLocaleString()}
        </span>
      </div>
      <div className={`combo ${score.combo >= 2 ? "combo--on" : ""}`} data-testid="combo-value" aria-label={`Combo ${score.combo}`}>
        ×{score.combo}
      </div>
      {rating && (
        <div key={rating.key} className={`line-rating line-rating--${rating.rating.toLowerCase()}`} data-testid="line-rating">
          {rating.rating}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {rating ? `${rating.rating}. Score ${score.total}, combo ${score.combo}` : ""}
      </span>
    </div>
  );
}
