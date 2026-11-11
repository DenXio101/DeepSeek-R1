import { useCallback, useEffect, useState } from "react";

type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

function current(): boolean {
  const d = document as FsDoc;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/**
 * Fullscreen API with an "immersive" fallback (same CSS, no browser fullscreen)
 * for browsers that lack it (iPhone Safari).
 */
export function useFullscreen(): { active: boolean; native: boolean; supported: boolean; toggle: () => void; exit: () => void } {
  const el = typeof document !== "undefined" ? (document.documentElement as FsEl) : null;
  const supported = !!el && !!(el.requestFullscreen || el.webkitRequestFullscreen);
  const [native, setNative] = useState(() => (typeof document !== "undefined" ? current() : false));
  const [immersive, setImmersive] = useState(false);

  useEffect(() => {
    const on = () => setNative(current());
    document.addEventListener("fullscreenchange", on);
    document.addEventListener("webkitfullscreenchange", on);
    return () => {
      document.removeEventListener("fullscreenchange", on);
      document.removeEventListener("webkitfullscreenchange", on);
    };
  }, []);

  const exit = useCallback(() => {
    const d = document as FsDoc;
    if (current()) {
      const p = d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.();
      void Promise.resolve(p).catch(() => {});
    }
    setImmersive(false);
  }, []);

  const toggle = useCallback(() => {
    if (native || immersive) {
      exit();
      return;
    }
    const root = document.documentElement as FsEl;
    if (root.requestFullscreen || root.webkitRequestFullscreen) {
      const p = root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen!();
      void Promise.resolve(p).catch(() => setImmersive(true));
    } else setImmersive(true);
  }, [native, immersive, exit]);

  return { active: native || immersive, native, supported, toggle, exit };
}
