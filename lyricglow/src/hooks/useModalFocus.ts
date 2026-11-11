import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]):not([type="file"]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Focus management for a modal surface: move focus inside when it opens (to
 * `initialSelector` or the first control), keep Tab inside, make the rest of
 * the app inert, and return focus to the opener on close.
 */
export function useModalFocus(open: boolean, ref: RefObject<HTMLElement | null>, initialSelector?: string): void {
  useEffect(() => {
    if (!open) return;
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getBoundingClientRect().width > 0);
    const first = (initialSelector && root.querySelector<HTMLElement>(initialSelector)) || focusables()[0] || root;
    if (first === root) root.tabIndex = -1;
    const t = window.setTimeout(() => first.focus({ preventScroll: true }), 30);

    // everything that is not this surface (or an ancestor of it) becomes inert
    const inerted: HTMLElement[] = [];
    let node: HTMLElement | null = root;
    while (node && node.parentElement && node !== document.body) {
      for (const sib of Array.from(node.parentElement.children)) {
        if (sib !== node && sib instanceof HTMLElement && !sib.inert) {
          sib.inert = true;
          inerted.push(sib);
        }
      }
      node = node.parentElement;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !root.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !root.contains(active))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    root.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      root.removeEventListener("keydown", onKey);
      for (const el of inerted) el.inert = false;
      if (opener && opener.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
    };
  }, [open, ref, initialSelector]);
}
