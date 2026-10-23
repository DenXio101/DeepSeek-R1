import { useState } from "react";
import type { SectionEvent } from "../engine/KaraokeSession";

interface Props {
  event: SectionEvent | null;
}

/** Title card + light sweep when a new section opens; removes itself when its animation ends */
export default function SectionCard({ event }: Props) {
  const [doneKey, setDoneKey] = useState(-1);
  if (!event || doneKey === event.key) return null;
  return (
    <>
      <div key={`sweep-${event.key}`} className="light-sweep" aria-hidden="true" />
      <div
        key={`card-${event.key}`}
        className="section-card"
        data-testid="section-card"
        role="status"
        onAnimationEnd={() => setDoneKey(event.key)}
      >
        <span className="section-card-rule" />
        <span className="section-card-name">{event.name}</span>
        <span className="section-card-rule" />
      </div>
    </>
  );
}
