// The Vocals switch: steps and the order a tap moves through them.

/** full = original mix · light = a 30 % guide vocal · off = minus one · custom = another slider level */
export type VocalsMode = "full" | "light" | "off" | "custom";

/** the "light" step: the original singer as a faint guide */
export const LIGHT_VOCAL = 0.3;

export interface VocalsState {
  mode: VocalsMode;
  /** percent of the original vocal, for the caption of a custom level */
  percent: number;
  /** YouTube: only Vocals ↔ Minus one (a version swap), no light step */
  twoStep: boolean;
  /** looking for a karaoke version */
  busy: boolean;
  /** why the switch cannot be used right now; null = usable */
  disabledReason: string | null;
}

export function vocalsModeOf(level: number): VocalsMode {
  return level >= 0.999 ? "full" : level <= 0.001 ? "off" : Math.abs(level - LIGHT_VOCAL) < 0.005 ? "light" : "custom";
}

/** the step a tap leads to: Full → Light → Off → Full; a custom level drops to the next lower step */
export function nextVocalsMode(mode: VocalsMode, twoStep: boolean, percent = 100): VocalsMode {
  if (twoStep) return mode === "off" ? "full" : "off";
  if (mode === "full") return "light";
  if (mode === "light") return "off";
  if (mode === "custom") return percent > LIGHT_VOCAL * 100 ? "light" : "off";
  return "full";
}

export function levelOfMode(mode: VocalsMode): number {
  return mode === "full" ? 1 : mode === "light" ? LIGHT_VOCAL : 0;
}
