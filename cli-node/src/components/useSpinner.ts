/** Animated spinner frame. Ticks only while enabled so idle screens cost zero. */
import { useEffect, useState } from "react";

export const SPIN_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function useSpinner(enabled: boolean, ms = 100): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setN((v) => v + 1), ms);
    return () => clearInterval(t);
  }, [enabled, ms]);
  return SPIN_FRAMES[n % SPIN_FRAMES.length];
}
