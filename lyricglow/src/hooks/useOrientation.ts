import { useEffect, useState } from "react";

function read(): boolean {
  return typeof window !== "undefined" && window.innerWidth > window.innerHeight;
}

/** true when the viewport is wider than tall (performance mode) */
export function useIsLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(read);
  useEffect(() => {
    const check = () => setIsLandscape(read());
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  return isLandscape;
}
