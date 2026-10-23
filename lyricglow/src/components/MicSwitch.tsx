import type { MicState } from "../engine/AudioGraph";
import { IconMic } from "./Icons";

interface Props {
  mic: MicState;
  onToggle: () => void;
}

/** Oblong slider switch for the microphone: knob (with the mic icon) slides right when on. */
export default function MicSwitch({ mic, onToggle }: Props) {
  const on = mic.status === "on";
  const busy = mic.status === "requesting";
  const error = mic.status === "error";
  return (
    <div className="mic-switch-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-busy={busy || undefined}
        aria-label={on ? "Turn microphone off" : "Turn microphone on for scoring"}
        title="Sing into the mic to get scored (headphones recommended)"
        className={`mic-switch ${on ? "mic-switch--on" : ""} ${busy ? "mic-switch--busy" : ""} ${error ? "mic-switch--error" : ""}`}
        onClick={onToggle}
        data-testid="mic-toggle"
      >
        <span className="mic-switch-track" aria-hidden="true">
          <span className="mic-switch-text mic-switch-text--on">ON</span>
          <span className="mic-switch-text mic-switch-text--off">OFF</span>
          <span className="mic-switch-knob">
            <IconMic />
          </span>
        </span>
      </button>
      <span className="thumb-caption">{busy ? "Mic…" : on ? "Mic on" : "Mic"}</span>
    </div>
  );
}
