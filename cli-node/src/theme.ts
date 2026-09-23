/** Atlas OLED theme with the sunset neon soft accent pack. */

import { G } from "./glyphs";

export const theme = {
  bg: "#000000",
  surface: "#0D0D0D",
  text: "#F8F4EB",
  secondary: "#FFFFFF",
  dim: "#8A8A8A",
  faint: "#2A2A2A",
  // Sunset neon soft ramp
  peach: "#FFB386",
  coral: "#FF8F6B",
  rose: "#F472A0",
  amber: "#F2C14E",
  danger: "#F87171",
  live: "#7EE787",
  // Footer sea (Voyage): deep trough → swell → crest
  seaDeep: "#1F3447",
  sea: "#3D6A8E",
  seaCrest: "#8CC0E4",
  // Footer sky: moon and its glint on the water, stars at rest and lit
  moon: "#F4E9C8",
  glint: "#A89F7E",
  star: "#56627A",
  starLit: "#DCE6F5",
  highlightBg: "#FFB386",
  highlightFg: "#000000",
} as const;

/** Per-runtime accent from the sunset ramp. */
export const RUNTIME_COLOR: Record<string, string> = {
  codex: theme.peach,
  claude: theme.coral,
  muse: theme.rose,
  shell: theme.dim,
};

export const RUNTIME_ICON: Record<string, string> = G.runtime;

/** Marks sessions Atlas manages in tmux (visible in titles and live rows). */
export const TMUX_MARK = G.tmux;
