interface Props {
  level: number;
  mono: boolean;
  onLevel: (v: number) => void;
}

/**
 * "Voice" slider for local files: 100 % = original mix, lower = centre-channel
 * (lead vocal) reduced so the singer becomes a faint guide. The level itself is
 * applied by `useVocalLevel` in App, so it holds even while this slider is off screen.
 */
export default function VocalControl({ level, mono, onLevel }: Props) {
  const pct = Math.round(level * 100);
  return (
    <div className="vocal-control" data-testid="vocal-control" title="How much of the original singer you hear (centre-channel reduction)">
      <label htmlFor="vocal-slider" className="tempo-label vocal-label">
        Voice {mono ? "—" : `${pct}%`}
      </label>
      <input
        id="vocal-slider"
        type="range"
        className="tempo-slider vocal-slider"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={mono}
        onChange={(e) => onLevel(Number(e.target.value) / 100)}
        aria-label="Original vocal level"
        data-testid="vocal-level"
      />
      {mono && (
        <span className="vocal-note" data-testid="vocal-mono-note">
          mono file — can't separate vocals
        </span>
      )}
    </div>
  );
}
