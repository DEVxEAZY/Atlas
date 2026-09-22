/** State readable synchronously inside input handlers.
 *
 * React state updates are async: back-to-back keys (Down, Down, Enter typed
 * fast, or several keys coalesced into one stdin read) would otherwise act
 * on a stale value. The ref is the source of truth for handlers; the state
 * mirrors it for rendering.
 */
import { useCallback, useRef, useState } from "react";

export type LiveSetter<T> = (v: T | ((prev: T) => T)) => void;

export function useLive<T>(initial: T): [T, React.MutableRefObject<T>, LiveSetter<T>] {
  const [value, setState] = useState(initial);
  const ref = useRef<T>(initial);
  const set = useCallback<LiveSetter<T>>((v) => {
    const next = typeof v === "function" ? (v as (p: T) => T)(ref.current) : v;
    ref.current = next;
    setState(next);
  }, []);
  return [value, ref, set];
}

export type IndexSetter = LiveSetter<number | null>;

export function useLiveIndex(initial: number | null): [
  number | null,
  React.MutableRefObject<number | null>,
  IndexSetter,
] {
  return useLive<number | null>(initial);
}
