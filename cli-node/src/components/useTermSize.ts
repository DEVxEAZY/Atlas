/** Terminal size that re-renders on resize. Ink re-lays out on resize but
 *  never re-renders components, so budgets read once from stdout go stale
 *  while the footer boat keeps ticking — a shrunk window then overflows
 *  and Ink fully clears on every tick. Falls back to DEFAULT_COLS/ROWS
 *  (never the host terminal) so test renderers stay deterministic. */
import { useEffect, useState } from "react";
import { useStdout } from "ink";
import { DEFAULT_COLS, DEFAULT_ROWS } from "./chrome";

export interface TermSize {
  columns: number;
  rows: number;
}

export function useTermSize(): TermSize {
  const { stdout } = useStdout();
  const read = (): TermSize => ({
    columns: stdout?.columns || DEFAULT_COLS,
    rows: stdout?.rows || DEFAULT_ROWS,
  });
  const [size, setSize] = useState(read);
  useEffect(() => {
    if (!stdout?.on) return;
    const onResize = () =>
      setSize((prev) => {
        const next = read();
        return next.columns === prev.columns && next.rows === prev.rows ? prev : next;
      });
    stdout.on("resize", onResize);
    return () => {
      stdout.off?.("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stdout]);
  return size;
}
