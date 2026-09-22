/** Footer mascot: a little sailboat with a gull between two waves
 *  (ོ𓂃𖠳𓂃) drifting across one row, an endless "loading" loop. Owns its
 *  tick state, so only this component re-renders each step — never the
 *  screen above it. */
import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "../theme";
import { useTermSize } from "./useTermSize";

/** Gull (U+0F7C, a combining mark: 0 columns), wave, sailboat, wave. */
export const VOYAGE_MOTIF = "ོ𓂃𖠳𓂃";
/** Terminal columns the motif takes: the gull rides on the cell before it. */
export const VOYAGE_MOTIF_COLS = 3;
export const VOYAGE_MAX_WIDTH = 64;

export interface VoyageFrame {
  /** Leading spaces; the gull combines onto the last one, so this is ≥ 1. */
  lead: number;
  /** Trailing spaces up to the strip width. */
  trail: number;
}

/** Frame at `tick` for a strip `width` columns wide: the motif advances one
 *  column per tick from the left edge to the right one, then starts over.
 *  lead + VOYAGE_MOTIF_COLS + trail === width whenever the motif fits. */
export function voyageFrame(width: number, tick: number): VoyageFrame | null {
  const w = Math.max(0, Math.floor(width));
  const lap = w - VOYAGE_MOTIF_COLS; // positions 1..lap
  if (lap < 1) return null; // too narrow to sail
  const lead = 1 + (((tick % lap) + lap) % lap);
  return { lead, trail: w - lead - VOYAGE_MOTIF_COLS };
}

/** `show` comes from the screen's own budget (chrome.boatFits): only the
 *  screen knows whether one more row still fits the window. */
export default function Voyage({ show, ms = 250 }: { show: boolean; ms?: number }) {
  const [tick, setTick] = useState(0);
  const { columns } = useTermSize();
  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [show, ms]);
  // root padding takes 4 columns
  const f = show ? voyageFrame(Math.min(VOYAGE_MAX_WIDTH, columns - 4), tick) : null;
  if (!f) return null;
  const [gull, wave, boat] = [...VOYAGE_MOTIF];
  return (
    <Text wrap="truncate">
      {/* spaces + gull in one run: no escape code between the combining
          mark and the cell it rides on */}
      <Text color={theme.dim}>{`${" ".repeat(f.lead)}${gull}${wave}`}</Text>
      <Text color={theme.peach}>{boat}</Text>
      <Text color={theme.dim}>{`${wave}${" ".repeat(f.trail)}`}</Text>
    </Text>
  );
}
