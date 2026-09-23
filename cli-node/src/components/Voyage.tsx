/** Footer painting: a still night scene in two rows, where only light moves.
 *
 *  - Sky: a crescent moon in the top-left corner and sparse stars on fixed
 *    columns, mostly empty space; a second, fainter row of stars above the
 *    sea when there is room. Stars only twinkle, by colour, each on its own
 *    slow period. Sky rows are drawn only when the screen has room.
 *  - Sea: two swells of different length travel slowly across it. Each
 *    column's glyph follows the water's height (_ ‿ ~ ⁀ ˜), so light wave
 *    shapes drift along, and its colour follows a gradient from deep blue
 *    to foam; the moon's reflection glints on the water under it.
 *  - Boat: a little sailboat with a gull between two waves (ོ𓂃𖠳𓂃, or
 *    `v~\_|_/~` with portable glyphs) rides at anchor near the right edge,
 *    balancing the moon on the left, or sails: one column every 400 ms,
 *    wrapping around the strip, so it leaves on the right as its bow comes
 *    back on the left. The footer always sails; A in the Hub hides it.
 *
 *  Owns its tick state, so only this component re-renders each step, never
 *  the screen above it. */
import React from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { G, type Glyphs } from "../glyphs";
import { useTermSize } from "./useTermSize";
import { FRAME_MS, useFrame } from "./clock";

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
/** Frames per column while the boat sails: one column every 400 ms, a
 *  calm drift about 25 s across a full-width strip. */
export const SAIL_EVERY = 2;

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
  | "glintSoft"
  | "wake"
  | "life";

export interface Cell {
  /** One terminal column (the gull cell is a space plus its combining mark). */
  ch: string;
  tone: Tone;
  /** Exact colour, when it is a blend rather than the tone's own colour. */
  color?: string;
}

// ---- colour blending: every change on the water is a gradient, never a jump

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `a` blended toward `b` by t in [0, 1], quantised to 1/16 so that
 *  neighbouring cells share colours and merge into few styled runs. */
export function mix(a: string, b: string, t: number): string {
  const q = Math.round(Math.min(1, Math.max(0, t)) * 16) / 16;
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * q).toString(16).padStart(2, "0");
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`.toUpperCase();
}

/** Deep water to foam, by position in [0, 1]. */
const SEA_STOPS: Array<[number, string]> = [
  [0, theme.seaDeep],
  [0.45, theme.sea],
  [0.8, theme.seaCrest],
  [1, theme.text],
];

/** The colour of water at height h in [-1, 1]: a continuous gradient, so a
 *  wave brightens and fades through every shade in between. */
export function seaColor(h: number): string {
  const p = Math.min(1, Math.max(0, (h + 1) / 2));
  for (let i = 1; i < SEA_STOPS.length; i++) {
    const [p1, c1] = SEA_STOPS[i];
    if (p <= p1) {
      const [p0, c0] = SEA_STOPS[i - 1];
      return mix(c0, c1, (p - p0) / (p1 - p0));
    }
  }
  return theme.text;
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
  wake: theme.text,
  life: theme.rose,
};

/** Sea life: an octopus or a squid swimming under the surface. */
export interface Creature {
  kind: "octopus" | "squid";
  /** Column of its first character; it may be partly off either edge. */
  x: number;
  text: string;
}

/** ATLAS_SEA_LIFE=often: something every minute, to watch it without the wait. */
const LIFE_OFTEN = process.env.ATLAS_SEA_LIFE === "often";
/** Frames per sea-life slot (about four minutes at 5 fps). */
const LIFE_SLOT = LIFE_OFTEN ? 300 : 1200;
/** Share of slots in which something swims by: rare, never on a schedule. */
const LIFE_CHANCE = LIFE_OFTEN ? 1 : 0.35;
/** Frames per column a creature swims: slower than the boat. */
const LIFE_STEP = 3;
const LIFE_COLOR: Record<Creature["kind"], string> = { octopus: theme.rose, squid: theme.squid };

/** The same creature facing right: characters reversed, arrows turned. */
function mirror(text: string): string {
  const turn: Record<string, string> = { "◁": "▷", "<": ">", "▷": "◁", ">": "<" };
  return [...text].reverse().map((c) => turn[c] ?? c).join("");
}

/** What swims under the sea at frame `tick`, if anything. Whether a slot
 *  has a creature, which one, when in the slot and which way it goes all
 *  come from this run's seed. */
export function creatureAt(width: number, tick: number, g: Glyphs = G): Creature | null {
  const w = Math.floor(width);
  const slot = Math.floor(tick / LIFE_SLOT);
  const r = (k: number) => grain(slot * 13 + k, 4321 ^ seaSeed);
  if (r(0) > LIFE_CHANCE) return null;
  const kind = r(1) < 0.5 ? "octopus" : "squid";
  const toLeft = r(2) < 0.5;
  const len = [...(kind === "octopus" ? g.octopus[0] : g.squid)].length;
  const duration = (w + len) * LIFE_STEP;
  const start = Math.floor(r(3) * Math.max(1, LIFE_SLOT - duration));
  const age = tick - slot * LIFE_SLOT - start;
  if (age < 0 || age >= duration) return null;
  const step = Math.floor(age / LIFE_STEP);
  // an octopus pulses its tentacles as it swims
  const body = kind === "octopus" ? g.octopus[step % 2] : g.squid;
  return {
    kind,
    x: toLeft ? w - step : -len + step,
    text: toLeft ? body : mirror(body),
  };
}

/** Swell phase per frame, tuned for the shared clock's frame period. */
const SWELL_A = 0.18;
const SWELL_B = 0.07;

/** This run's sea: a random seed per process, so the water never plays the
 *  same sequence twice. Tests pin it with setSeaSeed. */
let seaSeed = (Math.random() * 0x7fffffff) | 0;

export function setSeaSeed(seed: number): void {
  seaSeed = seed | 0;
}

/** Smooth 2-D value noise in [0, 1): random lattice values, eased between,
 *  so it is continuous in x and in time (no column ever flickers). */
function noise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ease = (f: number) => f * f * (3 - 2 * f);
  const at = (i: number, j: number) => grain(i + j * 7919, salt ^ seaSeed);
  const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * ease(fx);
  const low = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * ease(fx);
  return top + (low - top) * ease(fy);
}

/** Frames per wave-group slot: each slot may raise one choppy group. */
const GROUP_FRAMES = 70;

/** Choppy wave groups: now and then a patch of short waves rises somewhere
 *  at random, drifts either way at its own speed and fades out. Two slot
 *  layers, offset by half a slot, so groups overlap and never keep time. */
function groups(x: number, t: number): number {
  let sum = 0;
  for (const layer of [0, 1]) {
    const shifted = t + layer * (GROUP_FRAMES / 2);
    const slot = Math.floor(shifted / GROUP_FRAMES);
    const age = (shifted - slot * GROUP_FRAMES) / GROUP_FRAMES; // 0..1
    const r = (k: number) => grain(slot * 31 + layer * 17 + k, 900 ^ seaSeed);
    if (r(0) > 0.65) continue; // a calm slot
    const centre = r(1) * 64 + (r(2) - 0.5) * 0.6 * (age * GROUP_FRAMES); // drifts either way
    const width = 3 + r(3) * 5;
    const amp = 0.35 + r(4) * 0.45;
    const envelope = Math.sin(Math.PI * age) ** 2; // rises and fades, no pop
    const d = (x - centre) / width;
    sum += amp * envelope * Math.exp(-d * d) * Math.sin(x * (0.8 + r(5) * 0.6) - t * 0.35 + r(6) * 6.28);
  }
  return sum;
}

/** Sea height in [-1, 1] at column x, frame t: a long swell whose length
 *  breathes slowly, a slower cross swell, smooth noise, and the odd choppy
 *  group, all continuous in time and seeded per run, so the pattern cannot
 *  be predicted and never visibly repeats. */
export function swell(x: number, t: number): number {
  const k = 0.42 + 0.1 * Math.sin(t * 0.011 + seaSeed); // wavelength drifts
  const long = Math.sin(x * k - t * SWELL_A + 4 * noise(t * 0.01, 0.5, 11));
  const cross = 0.5 * Math.sin(x * 0.17 + t * SWELL_B + 1.3);
  const texture = 0.6 * (noise(x * 0.23 + t * 0.04, t * 0.03, 23) * 2 - 1);
  return Math.tanh((long + cross + texture + groups(x, t)) * 0.75);
}

/** A fixed pseudo-random value in [0, 1) for column x: star places and the
 *  sea's texture are a function of the column alone, so they never move. */
function grain(x: number, salt = 0): number {
  let h = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(salt + 7, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** The glyph for water at height h in [-1, 1]: troughs low (_ ‿), crests
 *  high (⁀ ˜). Levels with several shapes pick one by a slow noise over x
 *  (`x`, `t` given), so stretches of sea differ in form, and change it
 *  gradually. As the swell travels the shapes travel with it. */
export function seaGlyph(h: number, g: Glyphs = G, x = 0, t = 0): string {
  const ramp = g.sea;
  const p = Math.min(0.999, Math.max(0, (h + 1) / 2));
  const level = ramp[Math.floor(p * ramp.length)];
  if (level.length === 1) return level;
  const pick = noise(x * 0.12, t * 0.02, 41);
  return [...level][Math.min(level.length - 1, Math.floor(pick * level.length))];
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
/** Frames a twinkle takes to brighten and as many to fade. */
const TWINKLE_RAMP = 3;

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
    // a twinkle ramps up and back down over a few frames, never a blink
    const at = (((tick + phase) % period) + period) % period;
    const glow = ch === stars[stars.length - 1] ? 1 : Math.max(0, 1 - Math.abs(at - TWINKLE_RAMP) / TWINKLE_RAMP);
    if (glow <= 0) return { ch, tone: "star" };
    return { ch, tone: glow > 0.5 ? "starLit" : "star", color: mix(theme.star, theme.starLit, glow) };
  });
}

/** The sea row at frame `tick` for a strip `width` columns wide: exactly
 *  `width` cells, or null when too narrow. Glyphs never change between
 *  frames; only their colours do. */
/** Column of the ship's first cell while sailing: one column every
 *  SAIL_EVERY frames from the left edge, wrapping around a strip `width`
 *  wide. */
export function sailAt(width: number, tick: number): number {
  const w = Math.floor(width);
  const step = Math.floor(tick / SAIL_EVERY);
  return ((step % w) + w) % w;
}

export function voyageCells(width: number, tick: number, g: Glyphs = G, sail = false): Cell[] | null {
  const w = Math.floor(width);
  if (!(w >= VOYAGE_MIN_WIDTH)) return null;
  const boatTick = tick;
  const cells = Array.from({ length: w }, (_, x): Cell => {
    const h = swell(x, tick);
    return { ch: seaGlyph(h, g, x, tick), tone: seaTone(x, tick), color: seaColor(h) };
  });
  // the moon's path on the water: brightest right under it, shimmering
  // with the swell, fading at the edges
  for (let x = 0; x <= MOON_COL + 2; x++) {
    const near = Math.abs(x - MOON_COL) <= 1;
    const lift = (swell(x, tick) + 1) / 2;
    cells[x].tone = near && lift > 0.4 ? "glint" : "glintSoft";
    cells[x].color = mix(seaColor(swell(x, tick)), theme.moon, (near ? 0.55 : 0.3) + 0.35 * lift);
  }
  // now and then something swims by under the surface, muted by the water
  const life = creatureAt(w, boatTick, g);
  if (life) {
    [...life.text].forEach((ch, i) => {
      const x = life.x + i;
      if (x < 0 || x >= w) return;
      cells[x] = { ch, tone: "life", color: mix(seaColor(swell(x, tick)), LIFE_COLOR[life.kind], 0.6) };
    });
  }
  const n = g.ship.length;
  const at = sail ? sailAt(w, boatTick) : shipAt(w, g);
  const foam = (x: number, strength: number) => {
    const c = cells[((x % w) + w) % w];
    c.tone = "wake";
    c.color = mix(c.color ?? TONE_COLOR[c.tone], theme.text, strength);
  };
  if (sail) {
    // a wake of foam trailing the stern, breathing with the swell and
    // fading out; a light bow wave just ahead of her
    const WAKE = [0.75, 0.5, 0.32, 0.18, 0.08];
    WAKE.forEach((s, d) => foam(at - 1 - d, s * (0.8 + 0.2 * Math.sin(boatTick * 0.7 - d))));
    foam(at + n, 0.3);
  } else {
    // at anchor, a slow ripple against the hull on both sides
    const r = 0.12 + 0.12 * Math.sin(tick * 0.5);
    foam(at - 1, r);
    foam(at + n, r);
  }
  // the ship itself; her little waves catch the light of the water under her
  g.ship.forEach((c, i) => {
    const x = (at + i) % w;
    const cell: Cell = { ...c };
    if (c.tone === "wave") cell.color = mix(theme.seaCrest, theme.text, 0.25 + 0.3 * ((swell(x, tick) + 1) / 2));
    cells[x] = cell;
  });
  return cells;
}

/** Adjacent cells of one colour merged into styled runs (fewer escape codes). */
export function runs(cells: Cell[]): { text: string; color: string }[] {
  const out: { text: string; color: string }[] = [];
  for (const c of cells) {
    const color = c.color ?? TONE_COLOR[c.tone];
    const last = out[out.length - 1];
    if (last && last.color === color) last.text += c.ch;
    else out.push({ text: c.ch, color });
  }
  return out;
}

function Row({ cells }: { cells: Cell[] }) {
  return (
    <Text wrap="truncate">
      {runs(cells).map((r, i) => (
        <Text key={i} color={r.color}>
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
  const { columns } = useTermSize();
  // root padding takes 4 columns
  const width = Math.min(VOYAGE_MAX_WIDTH, columns - 4);
  const sea = show ? voyageCells(width, tick, G, true) : null;
  if (!sea) return null;
  const sky = rows >= 2 ? skyCells(width, tick) : null;
  const low = rows >= 3 ? skyCells(width, tick, G, 1) : null;
  return (
    <Box flexDirection="column">
      {sky && <Row cells={sky} />}
      {low && <Row cells={low} />}
      <Row cells={sea} />
    </Box>
  );
}
