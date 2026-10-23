import { useEffect, useState } from "react";

export type EffectsLevel = "auto" | "full" | "reduced";

function systemPrefers(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** OS preference combined with the in-app override */
export function useReducedMotion(level: EffectsLevel): boolean {
  const [system, setSystem] = useState(systemPrefers);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setSystem(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  if (level === "full") return false;
  if (level === "reduced") return true;
  return system;
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
}
