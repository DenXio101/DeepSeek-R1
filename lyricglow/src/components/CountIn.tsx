import type { CountInState } from "../engine/KaraokeSession";

interface Props {
  countIn: CountInState | null;
}

/** 3‑2‑1 conductor count before a line that follows a gap */
export default function CountIn({ countIn }: Props) {
  if (!countIn) return null;
  const { show, total } = countIn;
  return (
    <div className="count-in" data-testid="count-in" aria-hidden="true" data-show={show}>
      <span key={show} className="count-in-num">
        {show}
      </span>
      <span className="count-in-dots">
        {Array.from({ length: total }, (_, i) => (
          <i key={i} className={`count-in-dot ${i < total - show + 1 ? "count-in-dot--on" : ""}`} />
        ))}
      </span>
    </div>
  );
}
