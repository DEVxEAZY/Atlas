/** One animation clock for the whole TUI. Every animated leaf (spinners,
 *  the footer painting) advances on the same tick, so React batches them
 *  into one commit and Ink draws one frame per tick, not one per timer.
 *  The interval runs only while something is subscribed. */
import { useEffect, useState } from "react";

/** Frame period for every animation (5 fps). Each frame makes Ink rebuild
 *  the whole screen, so this rate is most of an idle TUI's CPU. */
export const FRAME_MS = 200;
/** How long animations hold still after a keypress. */
export const INPUT_HOLD_MS = 350;

let frame = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let holdUntil = 0;

function tick(): void {
  if (Date.now() < holdUntil) return;
  frame++;
  for (const s of subscribers) s(frame);
}


/** Keys first: animations skip their frames for a moment after input, so
 *  every keypress gets a redraw of its own instead of queueing behind one. */
export function holdForInput(ms = INPUT_HOLD_MS): void {
  holdUntil = Date.now() + ms;
}
const subscribers = new Set<(n: number) => void>();

function subscribe(fn: (n: number) => void): () => void {
  subscribers.add(fn);
  if (!timer) {
    timer = setInterval(tick, FRAME_MS);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The shared frame number; ticks only while `enabled`. */
export function useFrame(enabled = true): number {
  const [n, setN] = useState(frame);
  useEffect(() => (enabled ? subscribe(setN) : undefined), [enabled]);
  return n;
}
