import { useEffect, useState } from "react";

/** true after `ms` without pointer/touch/key activity while `enabled` */
export function useIdleHide(enabled: boolean, ms = 3000): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let id = window.setTimeout(() => setHidden(true), ms);
    const arm = () => {
      setHidden(false);
      window.clearTimeout(id);
      id = window.setTimeout(() => setHidden(true), ms);
    };
    const events: (keyof WindowEventMap)[] = ["pointermove", "pointerdown", "touchstart", "keydown", "wheel"];
    for (const e of events) window.addEventListener(e, arm, { passive: true });
    return () => {
      window.clearTimeout(id);
      for (const e of events) window.removeEventListener(e, arm);
      setHidden(false);
    };
  }, [enabled, ms]);
  return enabled && hidden;
}
