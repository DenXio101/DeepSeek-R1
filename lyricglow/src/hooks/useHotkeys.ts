import { useEffect, useRef } from "react";

export type HotkeyHandler = (e: KeyboardEvent) => void;
/** keys use KeyboardEvent.key, with " " spelled "Space" */
export type HotkeyMap = Record<string, HotkeyHandler>;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Global keyboard shortcuts. Ignored while typing in a field (except Escape).
 * Handlers always receive the event; the hook calls preventDefault for handled keys.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key === " " ? "Space" : e.key;
      const handler = mapRef.current[key];
      if (!handler) return;
      if (key !== "Escape" && isEditable(e.target)) return;
      if (e.repeat && (key === "Space" || key === "Enter")) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      handler(e);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}
