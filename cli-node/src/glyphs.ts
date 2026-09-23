/** Every non-ASCII symbol the TUI draws, in two sets.
 *
 *  - `rich` (the default): Atlas's own look. The two symbols that also
 *    exist as emoji (✳, ⚠) carry U+FE0E, which asks for their one-column
 *    text form, so neither is drawn two columns wide over its neighbour.
 *  - `safe` (ATLAS_GLYPHS=safe): ASCII plus WGL4, the set every Windows
 *    console font covers (Consolas, Lucida Console, Cascadia), for
 *    terminals whose fonts lack the rich symbols. */

export interface Glyphs {
  runtime: Record<string, string>;
  tmux: string;
  live: string;
  idle: string;
  domain: string;
  repo: string;
  dir: string;
  warn: string;
  collapsed: string;
  expanded: string;
  use: string;
  ok: string;
  bad: string;
  root: string;
  said: string;
  bullet: string;
  clock: string;
  spinner: string[];
  /** Footer painting. */
  moon: string;
  /** Star glyphs by weight: most are dust, the last ones are bright points
   *  (the last one always shines). */
  stars: string[];
  /** Water by height, trough to crest: the glyph under each column follows
   *  the swell, so the wave's shape travels along the sea. A level of
   *  several characters varies its shape from one stretch of sea to
   *  another (one column each). */
  sea: string[];
  /** Sea life seen under the water now and then, head first when swimming
   *  left: an octopus with wiggling tentacles (two frames) and a squid. */
  octopus: [string, string];
  squid: string;
  /** The boat and whatever rides with it, left to right, one column each:
   *  a cell may carry a zero-width combining mark on a space. */
  ship: Array<{ ch: string; tone: "gull" | "wave" | "boat" }>;
}

/** Variation selector 15: render the preceding symbol as text, not emoji. */
const TEXT = "\uFE0E";

export const RICH: Glyphs = {
  runtime: { codex: "⬢", claude: `✳${TEXT}`, muse: "◈", shell: "▸" },
  tmux: "𖥠",
  live: "◉",
  idle: "○",
  domain: "◆",
  repo: "●",
  dir: "○",
  warn: `⚠${TEXT}`,
  collapsed: "▸",
  expanded: "▾",
  use: "⤷",
  ok: "✓",
  bad: "✗",
  root: "⌂",
  said: "›",
  bullet: "•",
  clock: "◷",
  spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  moon: "☾",
  stars: ["·", "·", "∙", "˖", "˚", "⋆", "✧", "✦"],
  sea: ["_", "‿_", "~∼-", "⁀", "˜"],
  octopus: ["ᗣ∿∿", "ᗣ~∿"],
  squid: "◁≋",
  // gull (U+0F7C, a combining mark riding a space), wave, sailboat, wave
  ship: [
    { ch: " ོ", tone: "gull" },
    { ch: "𓂃", tone: "wave" },
    { ch: "𖠳", tone: "boat" },
    { ch: "𓂃", tone: "wave" },
  ],
};

export const SAFE: Glyphs = {
  runtime: { codex: "◊", claude: "*", muse: "♦", shell: ">" },
  tmux: "≡",
  live: "●",
  idle: "○",
  domain: "■",
  repo: "●",
  dir: "○",
  warn: "!",
  collapsed: "►",
  expanded: "▼",
  use: "→",
  ok: "√",
  bad: "x",
  root: "⌂",
  said: ">",
  bullet: "•",
  clock: "@",
  spinner: ["-", "\\", "|", "/"],
  moon: "●",
  stars: ["·", "·", ".", "°", "+", "*"],
  sea: ["_", "_-", "~-", "~", "^"],
  octopus: ["@~~", "@-~"],
  squid: "<=",
  // gull, then a hull with its mast between two waves: v ~\_|_/~
  ship: [
    { ch: "v", tone: "gull" },
    { ch: "~", tone: "wave" },
    { ch: "\\_|_/", tone: "boat" },
    { ch: "~", tone: "wave" },
  ].flatMap((c) => [...c.ch].map((ch) => ({ ch, tone: c.tone as "gull" | "wave" | "boat" }))),
};

export type GlyphMode = "rich" | "safe";

/** Which set to draw: rich unless ATLAS_GLYPHS asks for the portable one. */
export function glyphMode(env: NodeJS.ProcessEnv = process.env): GlyphMode {
  const v = (env.ATLAS_GLYPHS ?? "").toLowerCase();
  return v === "safe" || v === "ascii" ? "safe" : "rich";
}

/** The set in use for this process. */
export const G: Glyphs = glyphMode() === "rich" ? RICH : SAFE;
