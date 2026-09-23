/** Footer painting: a still night scene in two rows, where only light moves.
 *
 *  - Sky: a crescent moon in the top-left corner and sparse stars on fixed
 *    columns, mostly empty space; a second, fainter row of stars above the
 *    sea when there is room. Stars only twinkle, by colour, each on its own
 *    slow period. Sky rows are drawn only when the screen has room.
 *  - Sea: every column keeps its glyph; what moves is colour. Two swells of
 *    different length travel across it, lifting each wave from deep blue
 *    through blue to white foam at the crests, and the moon's reflection
 *    glints on the water under it.
 *  - Boat: a little sailboat with a gull between two waves (ོ𓂃𖠳𓂃, or
 *    `v~\_|_/~` with portable glyphs) rides at anchor near the right edge,
 *    balancing the moon on the left. With the sail setting on (A in the
 *    Hub) it sails instead: one column every frame, wrapping around the
 *    strip, so it leaves on the right as its bow comes back on the left.
 *
 *  Owns its tick state, so only this component re-renders each step, never
 *  the screen above it. */
import React, { useEffect } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { G, type Glyphs } from "../glyphs";
import { useTermSize } from "./useTermSize";
import { FRAME_MS, setFramePeriod, useFrame } from "./clock";
import { useSettings } from "../settings";

/** The rich motif: gull (U+0F7C, a combining mark: 0 columns), wave,
 *  sailboat, wave. */
export const VOYAGE_MOTIF = "ོ𓂃𖠳𓂃";
/** Terminal columns the rich motif takes: the gull rides on the cell before it. */
export const VOYAGE_MOTIF_COLS = 3;
/** Open water kept between the boat and the right edge. */
export const SHIP_MARGIN = 2;
/** Narrower strips draw nothing: the scene needs some sea to read. Sized
 *  for the longest ship of either glyph set, so both switch at one width. */
export const VOYAGE_MIN_WIDTH = 8 + SHIP_MARGIN + 6;
export const VOYAGE_MAX_WIDTH = 64;
/** Frame period: the light on the water changes every frame of the shared
 *  clock (spinners tick on the same frames). */
export const VOYAGE_TICK_MS = FRAME_MS;
/** Frame period while the boat sails: one column every 125 ms reads as a
 *  steady glide rather than steps. The sea keeps its own pace. */
export const SAIL_FRAME_MS = 125;

export type Tone =
  | "gull"
  | "wave"
  | "boat"
  | "foam"
  | "crest"
  | "swell"
  | "trough"
  | "sky"
  | "moon"
  | "star"
  | "starLit"
  | "glint"
  | "glintSoft";

export interface Cell {
  /** One terminal column (the gull cell is a space plus its combining mark). */
  ch: string;
  tone: Tone;
}

export const TONE_COLOR: Record<Tone, string> = {
  gull: theme.dim,
  wave: theme.seaCrest,
  boat: theme.peach,
  foam: theme.text,
  crest: theme.seaCrest,
  swell: theme.sea,
  trough: theme.seaDeep,
  sky: theme.seaDeep,
  moon: theme.moon,
  star: theme.star,
  starLit: theme.starLit,
  glint: theme.moon,
  glintSoft: theme.glint,
};

/** Swell phase per frame, tuned for the shared clock's frame period. */
const SWELL_A = 0.3;
const SWELL_B = 0.12;

/** Sea height in [-1, 1] at column x, frame t: two swells of different
 *  length and speed, so the pattern never visibly repeats. */
export function swell(x: number, t: number): number {
  return (Math.sin(x * 0.42 - t * SWELL_A) + 0.6 * Math.sin(x * 0.17 + t * SWELL_B + 1.3)) / 1.6;
}

/** A fixed pseudo-random value in [0, 1) for column x: star places and the
 *  sea's texture are a function of the column alone, so they never move. */
function grain(x: number, salt = 0): number {
  let h = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The glyph a sea column always shows: mostly ripples, some flat water. */
export function seaGlyph(x: number): string {
  return grain(x, 5) < 0.3 ? "-" : "~";
}

/** The colour of the water at column x, frame t: foam on the highest crests. */
export function seaTone(x: number, t: number): Tone {
  const h = swell(x, t);
  if (h > 0.72) return "foam";
  if (h > 0.3) return "crest";
  if (h > -0.2) return "swell";
  return "trough";
}

/** The moon's column: the top-left corner, one column in. */
export const MOON_COL = 1;

/** Column of the ship's first cell: the boat rides near the right edge. */
export function shipAt(width: number, g: Glyphs = G): number {
  return Math.max(0, Math.floor(width) - g.ship.length - SHIP_MARGIN);
}

/** Share of sky columns that hold a star. */
const STAR_DENSITY = 0.11;
/** Frames between a star's twinkles, and how many frames each one lasts. */
const TWINKLE_MIN = 16;
const TWINKLE_SPAN = 22;
const TWINKLE_LEN = 2;

/** The lower star row is sparser: depth, not a second copy of the first. */
const LOW_STAR_DENSITY = 0.07;

/** A sky row at frame `tick`: `layer` 0 is the top row, with the moon;
 *  layer 1 is a fainter row of other stars under it. Stars keep their
 *  columns; only their colour changes over time. */
export function skyCells(width: number, tick: number, g: Glyphs = G, layer = 0): Cell[] | null {
  const w = Math.floor(width);
  if (!(w >= VOYAGE_MIN_WIDTH)) return null;
  const salt = layer * 10;
  const density = layer === 0 ? STAR_DENSITY : LOW_STAR_DENSITY;
  return Array.from({ length: w }, (_, x): Cell => {
    if (layer === 0 && x === MOON_COL) return { ch: g.moon, tone: "moon" };
    // keep a halo of empty sky around the moon
    if (Math.abs(x - MOON_COL) <= 3 - layer || grain(x, salt) >= density) return { ch: " ", tone: "sky" };
    const stars = layer === 0 ? g.stars : g.stars.slice(0, -1); // no bright points low down
    const ch = stars[Math.floor(grain(x, salt + 1) * stars.length)];
    const period = TWINKLE_MIN + Math.floor(grain(x, salt + 2) * TWINKLE_SPAN);
    const phase = Math.floor(grain(x, salt + 3) * period);
    const lit = ch === stars[stars.length - 1] || (((tick + phase) % period) + period) % period < TWINKLE_LEN;
    return { ch, tone: lit ? "starLit" : "star" };
  });
}

/** The sea row at frame `tick` for a strip `width` columns wide: exactly
 *  `width` cells, or null when too narrow. Glyphs never change between
 *  frames; only their colours do. */
/** Column of the ship's first cell while sailing: one column per frame,
 *  from the left edge, wrapping around a strip `width` wide. */
export function sailAt(width: number, tick: number): number {
  const w = Math.floor(width);
  return ((tick % w) + w) % w;
}

/** Sea and sky time for frame `tick`: in frames of the resting clock, so
 *  the water flows at one pace whether the boat sails or not. */
export function seaTime(tick: number, sail: boolean): number {
  return sail ? (tick * SAIL_FRAME_MS) / FRAME_MS : tick;
}

export function voyageCells(width: number, tick: number, g: Glyphs = G, sail = false): Cell[] | null {
  const w = Math.floor(width);
  if (!(w >= VOYAGE_MIN_WIDTH)) return null;
  const boatTick = tick;
  tick = seaTime(tick, sail);
  const cells = Array.from({ length: w }, (_, x): Cell => ({ ch: seaGlyph(x), tone: seaTone(x, tick) }));
  // the moon's path on the water: brightest right under it, shimmering
  // with the swell, fading at the edges
  for (let x = 0; x <= MOON_COL + 2; x++) {
    const near = Math.abs(x - MOON_COL) <= 1;
    cells[x].tone = near && swell(x, tick) > -0.2 ? "glint" : "glintSoft";
  }
  const at = sail ? sailAt(w, boatTick) : shipAt(w, g);
  // wrapping: the stern still on the right while the bow is back on the left
  g.ship.forEach((c, i) => (cells[(at + i) % w] = { ...c }));
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

function Row({ cells }: { cells: Cell[] }) {
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

/** `rows` comes from the screen's own budget (chrome.voyageRowsFor): 0
 *  draws nothing, 1 the sea, 2 the moon's sky over the sea, 3 a second row
 *  of stars between them. Only the screen knows how many rows still fit. */
export default function Voyage({ rows }: { rows: number }) {
  const show = rows > 0;
  const tick = useFrame(show);
  const { sail } = useSettings();
  useEffect(() => setFramePeriod(sail ? SAIL_FRAME_MS : FRAME_MS), [sail]);
  const { columns } = useTermSize();
  // root padding takes 4 columns
  const width = Math.min(VOYAGE_MAX_WIDTH, columns - 4);
  const sea = show ? voyageCells(width, tick, G, sail) : null;
  if (!sea) return null;
  const skyTick = Math.floor(seaTime(tick, sail));
  const sky = rows >= 2 ? skyCells(width, skyTick) : null;
  const low = rows >= 3 ? skyCells(width, skyTick, G, 1) : null;
  return (
    <Box flexDirection="column">
      {sky && <Row cells={sky} />}
      {low && <Row cells={low} />}
      <Row cells={sea} />
    </Box>
  );
}
