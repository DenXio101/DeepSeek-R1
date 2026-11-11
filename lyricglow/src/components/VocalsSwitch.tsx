import { IconVoice } from "./Icons";

interface Props {
  /** original singer audible (vocal level > 0) */
  on: boolean;
  /** why the switch cannot be used right now (mono file, not a local file); null = usable */
  disabledReason: string | null;
  onToggle: () => void;
}

/**
 * Oblong switch for the original singer's voice (KaraFun's "Vocals" button). It is a
 * view onto the same vocal level the Voice slider under More edits: off = 0, on = the
 * last non-zero level. Same markup and styling as the mic switch, gold instead of rose.
 */
export default function VocalsSwitch({ on, disabledReason, onToggle }: Props) {
  const disabled = disabledReason !== null;
  const state = disabled ? "unavailable" : on ? "on" : "off";
  const checked = !disabled && on;
  return (
    <div className="mic-switch-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        aria-label={disabled ? `Original vocals — ${disabledReason}` : on ? "Turn the original singer's voice off" : "Turn the original singer's voice on"}
        title={disabled ? disabledReason : "Original singer's voice on or off (fine level under More → Voice)"}
        className={`mic-switch mic-switch--gold ${checked ? "mic-switch--on" : ""}`}
        onClick={onToggle}
        data-testid="vocals-toggle"
        data-state={state}
      >
        <span className="mic-switch-track" aria-hidden="true">
          <span className="mic-switch-text mic-switch-text--on">ON</span>
          <span className="mic-switch-text mic-switch-text--off">OFF</span>
          <span className="mic-switch-knob">
            <IconVoice />
          </span>
        </span>
      </button>
      <span className="thumb-caption" data-testid="vocals-state" data-value={state}>
        {state === "off" ? "Vocals off" : state === "unavailable" ? "Vocals —" : "Vocals"}
      </span>
    </div>
  );
}
