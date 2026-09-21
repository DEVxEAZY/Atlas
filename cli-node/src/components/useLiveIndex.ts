/** Selection state readable synchronously inside input handlers.
 *
 * React state updates are async: back-to-back keys (Down, Down, Enter typed
 * fast) would otherwise act on a stale index. The ref is the source of truth
 * for handlers; the state mirrors it for rendering.
 */
import { useCallback, useRef, useState } from "react";

export type IndexSetter = (
  v: number | null | ((prev: number | null) => number | null),
) => void;

export function useLiveIndex(initial: number | null): [
  number | null,
  React.MutableRefObject<number | null>,
  IndexSetter,
] {
  const [index, setState] = useState(initial);
  const ref = useRef<number | null>(initial);
  const setIndex = useCallback<IndexSetter>((v) => {
    const next = typeof v === "function" ? (v as (p: number | null) => number | null)(ref.current) : v;
    ref.current = next;
    setState(next);
  }, []);
  return [index, ref, setIndex];
}
