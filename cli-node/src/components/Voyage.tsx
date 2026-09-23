/** Footer mascot: a little sailboat with a gull between two waves
 *  (ོ𓂃𖠳𓂃) sailing a one-row sea, an endless "loading" loop. The sea swells
 *  every tick while the boat moves one column every BOAT_EVERY ticks, and it
 *  wraps around the strip: it sails off the right edge while its bow comes
 *  back in on the left, never jumping. Owns its tick state, so only this
 *  component re-renders each step — never the screen above it. */
import React, { useEffect, useState } from "react";
import { Text } from "ink";
import { theme } from "../theme";
import { useTermSize } from "./useTermSize";

/** Gull (U+0F7C, a combining mark: 0 columns), wave, sailboat, wave. */
export const VOYAGE_MOTIF = "ོ𓂃𖠳𓂃";
/** Terminal columns the motif takes: the gull rides on the cell before it. */
export const VOYAGE_MOTIF_COLS = 3;
/** Cells the motif claims on the strip: the gull's space plus its 3 columns. */
export const VOYAGE_SHIP_CELLS = VOYAGE_MOTIF_COLS + 1;
/** Narrower strips draw nothing: the boat needs some sea around it. */
export const VOYAGE_MIN_WIDTH = VOYAGE_SHIP_CELLS + 4;
export const VOYAGE_MAX_WIDTH = 64;
/** Frame period; the sea moves every frame. */
export const VOYAGE_TICK_MS = 110;
/** Frames per column the boat advances (~4.5 columns a second). */
export const BOAT_EVERY = 2;

export type Tone = "gull" | "wave" | "boat" | "wake" | "crest" | "swell" | "trough";

export interface Cell {
  /** One terminal column (the gull cell is a space plus its combining mark). */
  ch: string;
  tone: Tone;
}

export const TONE_COLOR: Record<Tone, string> = {
  gull: theme.dim,
  wave: theme.seaCrest,
  boat: theme.peach,
  wake: theme.text,
  crest: theme.seaCrest,
  swell: theme.sea,
  trough: theme.seaDeep,
};

/** Sea height in [-1, 1] at column x, frame t: two swells of different
 *  length and speed, so the pattern never visibly repeats. */
export function swell(x: number, t: number): number {
  return (Math.sin(x * 0.42 - t * 0.22) + 0.6 * Math.sin(x * 0.17 + t * 0.09 + 1.3)) / 1.6;
}

export function seaCell(x: number, t: number): Cell {
  const h = swell(x, t);
  if (h > 0.3) return { ch: "~", tone: "crest" };
  if (h > -0.2) return { ch: "~", tone: "swell" };
  if (h > -0.55) return { ch: "-", tone: "trough" };
  return { ch: " ", tone: "trough" };
}

/** Column of the gull's cell at frame `tick` on a strip `width` wide. */
export function shipAt(width: number, tick: number): number {
  const step = Math.floor(tick / BOAT_EVERY);
  return ((step % width) + width) % width;
}

/** Frame at `tick` for a strip `width` columns wide: exactly `width` cells,
 *  or null when too narrow to sail. The ship's cells wrap around the strip. */
export function voyageCells(width: number, tick: number): Cell[] | null {
  const w = Math.floor(width);
  if (!(w >= VOYAGE_MIN_WIDTH)) return null;
  const cells = Array.from({ length: w }, (_, x) => seaCell(x, tick));
  const at = shipAt(w, tick);
  const [gull, wave, boat] = [...VOYAGE_MOTIF];
  const ship: Cell[] = [
    { ch: ` ${gull}`, tone: "gull" },
    { ch: wave, tone: "wave" },
    { ch: boat, tone: "boat" },
    { ch: wave, tone: "wave" },
  ];
  ship.forEach((c, i) => (cells[(at + i) % w] = c));
  // foam trailing the stern, fading out
  cells[(at - 1 + w) % w] = { ch: "~", tone: "wake" };
  cells[(at - 2 + w) % w] = { ch: "~", tone: "crest" };
  return cells;
}

/** Adjacent cells of one tone merged into styled runs (fewer escape codes). */
export function runs(cells: Cell[]): { text: string; tone: Tone }[] {
  const out: { text: string; tone: Tone }[] = [];
  for (const c of cells) {
    const last = out[out.length - 1];
    if (last && last.tone === c.tone) last.text += c.ch;
    else out.push({ text: c.ch, tone: c.tone });
  }
  return out;
}

/** `show` comes from the screen's own budget (chrome.boatFits): only the
 *  screen knows whether one more row still fits the window. */
export default function Voyage({ show, ms = VOYAGE_TICK_MS }: { show: boolean; ms?: number }) {
  const [tick, setTick] = useState(0);
  const { columns } = useTermSize();
  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [show, ms]);
  // root padding takes 4 columns
  const cells = show ? voyageCells(Math.min(VOYAGE_MAX_WIDTH, columns - 4), tick) : null;
  if (!cells) return null;
  return (
    <Text wrap="truncate">
      {runs(cells).map((r, i) => (
        <Text key={i} color={TONE_COLOR[r.tone]}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}
