import React, { type ReactNode } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";
import { getSettings, type Settings } from "../settings";

export function Title({ children }: { children: ReactNode }) {
  return (
    <Box marginBottom={1}>
      <Text wrap="truncate">
        <Text color={theme.secondary} bold>
          Atlas
        </Text>
        <Text dimColor> — {children}</Text>
      </Text>
    </Box>
  );
}

/** Rendered width of a hint set: "key desc" items joined with " · ". */
export function hintsWidth(hints: Array<[string, string]>): number {
  return hints.map(([key, desc]) => `${key} ${desc}`).join(" · ").length;
}

export function HintBar({ hints }: { hints: Array<[string, string]> }) {
  return (
    <Box marginTop={1}>
      <Text wrap="truncate">
        {hints.map(([key, desc], i) => (
          <Text key={key}>
            {i > 0 && <Text dimColor> · </Text>}
            <Text color={theme.peach}>{key}</Text>
            <Text dimColor> {desc}</Text>
          </Text>
        ))}
      </Text>
    </Box>
  );
}

export function StatusLine({ msg }: { msg: string }) {
  if (!msg) return <Box height={1} />;
  return (
    <Text color={theme.amber} wrap="truncate">
      {msg}
    </Text>
  );
}

/** Rows always truncate: a wrapped row makes the frame taller than the
 *  list budget, and an Ink frame taller than the terminal is redrawn with a
 *  full clear every tick — flicker and scrollback garbage on many terminals. */
export function ItemRow({ hot, children }: { hot: boolean; children: ReactNode }) {
  return (
    <Box>
      <Text wrap="truncate" backgroundColor={hot ? theme.highlightBg : undefined}>
        {children}
      </Text>
    </Box>
  );
}

export function HeaderRow({ children }: { children: ReactNode }) {
  return <Text wrap="truncate">{children}</Text>;
}

export function Dim({ children }: { children: ReactNode }) {
  return (
    <Text dimColor wrap="truncate">
      {children}
    </Text>
  );
}

/** Fallbacks when stdout has no size (piped output, test renderer). */
export const DEFAULT_COLS = 100;
export const DEFAULT_ROWS = 24;

/** Absolute floor for the list: tiny terminals degrade gracefully
 *  instead of overflowing. */
export const MIN_LIST_ROWS = 3;

/** Rows the footer painting (Voyage) draws under the hint bar at least:
 *  the sea with the boat. */
export const VOYAGE_ROWS = 1;
/** Rows with the night sky over the sea. */
export const VOYAGE_SKY_ROWS = 2;
/** Rows with a second row of stars in the sky. */
export const VOYAGE_STARS_ROWS = 3;
/** Below this many terminal rows the boat stays docked (not drawn). */
export const VOYAGE_MIN_ROWS = 16;
/** Below this many terminal rows the sky is left out. */
export const SKY_MIN_ROWS = 24;
/** Below this many terminal rows the sky keeps a single row. */
export const STARS_MIN_ROWS = 28;

/** Off when the animation is hidden (A in the Hub) or ATLAS_NO_BOAT is set
 *  (any non-empty value but "0"). */
export function voyageEnabled(
  env: NodeJS.ProcessEnv = process.env,
  settings: Settings = getSettings(),
): boolean {
  const v = env.ATLAS_NO_BOAT;
  return settings.animation && (!v || v === "0");
}

/** Rows the footer painting takes under a screen whose other rows (chrome
 *  plus the minimum content it must show) take `fixedRows`: 3 (two sky
 *  rows and the sea), 2 (sky and sea), 1 (sea only) or 0. It animates, and an Ink frame taller than the
 *  terminal is fully cleared on every render, so it is drawn only where it
 *  can never push the frame past the window. */
export function voyageRowsFor(
  rows: number | undefined,
  fixedRows: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const r = rows || DEFAULT_ROWS;
  if (!voyageEnabled(env) || r < VOYAGE_MIN_ROWS) return 0;
  const spare = r - fixedRows;
  if (r >= STARS_MIN_ROWS && spare >= VOYAGE_STARS_ROWS) return VOYAGE_STARS_ROWS;
  if (r >= SKY_MIN_ROWS && spare >= VOYAGE_SKY_ROWS) return VOYAGE_SKY_ROWS;
  return spare >= VOYAGE_ROWS ? VOYAGE_ROWS : 0;
}

/** Whether the boat fits at all (see voyageRowsFor). */
export function boatFits(
  rows: number | undefined,
  fixedRows: number,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return voyageRowsFor(rows, fixedRows, env) > 0;
}

/** Hub chrome around the list, in rows: header is Title (1 + margin 1)
 *  + filter (1 + margin 1); footer is StatusLine (1) + HintBar (margin 1 + 1)
 *  + the boat when drawn. CHROME_MARGIN is one breathing row on top of the
 *  exact fit. */
const HEADER_ROWS = 4;
const FOOTER_ROWS = 3;
const CHROME_MARGIN = 1;
const HUB_BASE = HEADER_ROWS + FOOTER_ROWS + CHROME_MARGIN;

/** Footer painting rows the Hub draws at this terminal height. */
export function hubVoyageRows(rows: number | undefined, env: NodeJS.ProcessEnv = process.env): number {
  return voyageRowsFor(rows, HUB_BASE + MIN_LIST_ROWS, env);
}

/** Whether the Hub draws the boat at this terminal height. */
export function hubBoat(rows: number | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return hubVoyageRows(rows, env) > 0;
}

/** Non-list rows the Hub chrome occupies at this terminal height. */
export function chromeRows(rows?: number, env: NodeJS.ProcessEnv = process.env): number {
  return HUB_BASE + hubVoyageRows(rows, env);
}

/** Visible list rows (never overflows rows). */
export function listHeightFor(rows: number | undefined, env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(MIN_LIST_ROWS, (rows || DEFAULT_ROWS) - chromeRows(rows, env));
}
