import { nextVocalsMode, type VocalsMode, type VocalsState } from "../model/vocals";
import { IconVoice } from "./Icons";

interface Props {
  vocals: VocalsState;
  onCycle: () => void;
}

const NAME: Record<VocalsMode, string> = { full: "full", light: "light, 30 percent", off: "off (minus one)", custom: "custom level" };

/**
 * Three-position oblong switch for the original singer (KaraFun's "Vocals" button):
 * knob right = full, middle = light 30 %, left = minus one. For local files it steps the
 * same level the Voice slider under More edits; for YouTube it swaps between the official
 * video and a karaoke upload. Same shell as the mic switch, gold instead of rose.
 */
export default function VocalsSwitch({ vocals, onCycle }: Props) {
  const { mode, percent, twoStep, busy, disabledReason } = vocals;
  const disabled = disabledReason !== null;
  const state = disabled ? "unavailable" : mode;
  const pos = disabled || mode === "off" ? "" : mode === "full" ? "mic-switch--on" : "mic-switch--mid";
  const caption = disabled ? "Vocals —" : busy ? "Finding…" : mode === "full" ? "Vocals" : mode === "light" ? "Vocals 30%" : mode === "off" ? "Minus one" : `Vocals ${percent}%`;
  const next = nextVocalsMode(mode, twoStep, percent);
  return (
    <div className="mic-switch-wrap">
      <button
        type="button"
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-label={disabled ? `Original vocals — ${disabledReason}` : `Original vocals: ${NAME[mode]}. Tap for ${NAME[next]}.`}
        title={disabled ? disabledReason : twoStep ? "Swap between the official video and a karaoke (minus one) version" : "Original singer: full → light 30% → minus one"}
        className={`mic-switch mic-switch--gold ${pos} ${busy ? "mic-switch--busy" : ""}`}
        onClick={onCycle}
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
        {caption}
      </span>
    </div>
  );
}
