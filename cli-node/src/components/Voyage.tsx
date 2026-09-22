/** Footer mascot: a little ASCII boat sailing on a scrolling sea, an
 *  endless "loading" loop. Owns its tick state, so only this component
 *  re-renders each frame — never the screen above it. */
import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "../theme";
import { useTermSize } from "./useTermSize";

export const VOYAGE_MAX_WIDTH = 64;
const SEA = "~-~~-~~~--~-~~";
const SAIL = "|\\";
const HULL = "\\___/";

export interface VoyageFrame {
  /** Sky row: blank except the sail. */
  sky: string;
  /** Sea row split around the hull, so each part can take its own color. */
  seaLeft: string;
  hull: string;
  seaRight: string;
}

/** Frame at `tick` for a strip `width` columns wide. The sea scrolls one
 *  column per tick; the boat advances every other tick, sails in from the
 *  left edge, out the right, and around again. */
export function voyageFrame(width: number, tick: number): VoyageFrame {
  const w = Math.max(0, width);
  const sea = (i: number) => SEA[(((i + tick) % SEA.length) + SEA.length) % SEA.length];
  const lap = w + HULL.length;
  const x = (Math.floor(tick / 2) % lap) - HULL.length; // hull's left column
  const sky = Array.from({ length: w }, (_, i) => {
    const s = i - (x + 1);
    return s >= 0 && s < SAIL.length ? SAIL[s] : " ";
  }).join("");
  const from = Math.max(0, x);
  const to = Math.min(w, x + HULL.length);
  const seaRow = (a: number, b: number) =>
    Array.from({ length: Math.max(0, b - a) }, (_, k) => sea(a + k)).join("");
  return {
    sky,
    seaLeft: seaRow(0, from),
    hull: to > from ? HULL.slice(from - x, to - x) : "",
    seaRight: seaRow(Math.max(from, to), w),
  };
}

/** `show` comes from the screen's own budget (chrome.boatFits): only the
 *  screen knows whether two more rows still fit the window. */
export default function Voyage({ show, ms = 140 }: { show: boolean; ms?: number }) {
  const [tick, setTick] = useState(0);
  const { columns } = useTermSize();
  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [show, ms]);
  if (!show) return null;
  // root padding takes 4 columns
  const width = Math.min(VOYAGE_MAX_WIDTH, columns - 4);
  const f = voyageFrame(width, tick);
  return (
    <>
      <Text color={theme.text} wrap="truncate">
        {f.sky}
      </Text>
      <Text wrap="truncate">
        <Text color={theme.dim}>{f.seaLeft}</Text>
        <Text color={theme.peach}>{f.hull}</Text>
        <Text color={theme.dim}>{f.seaRight}</Text>
      </Text>
    </>
  );
}
