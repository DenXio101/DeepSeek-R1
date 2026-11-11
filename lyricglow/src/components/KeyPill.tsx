import { formatKey } from "../engine/SoundTouchShifter";

/** Small stage badge shown while the key is shifted. */
export default function KeyPill({ semitones }: { semitones: number }) {
  return (
    <div className="key-pill" role="status" aria-label={`Key ${semitones > 0 ? "plus" : "minus"} ${Math.abs(semitones)} semitones`} data-testid="key-pill">
      Key {formatKey(semitones)}
    </div>
  );
}
