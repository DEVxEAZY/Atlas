import React, { type ReactNode } from "react";
import { Box, Text } from "ink";
import { theme } from "../theme";

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

/** Rows the sailing-boat footer (Voyage) draws under the hint bar. */
export const VOYAGE_ROWS = 2;
/** Below this many terminal rows the boat stays docked (not drawn). */
export const VOYAGE_MIN_ROWS = 18;

/** Off when ATLAS_NO_BOAT is set (any non-empty value but "0"). */
export function voyageEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ATLAS_NO_BOAT;
  return !v || v === "0";
}

/** Rows the boat takes at this terminal height — 0 when it is docked, so
 *  list budgets reserve exactly what Voyage draws. */
export function voyageRows(rows: number | undefined, env: NodeJS.ProcessEnv = process.env): number {
  return voyageEnabled(env) && (rows || DEFAULT_ROWS) >= VOYAGE_MIN_ROWS ? VOYAGE_ROWS : 0;
}

/** Hub chrome around the list, in rows: header is Title (1 + margin 1)
 *  + filter (1 + margin 1); footer is StatusLine (1) + HintBar (margin 1 + 1)
 *  + the boat when drawn. CHROME_MARGIN is one breathing row on top of the
 *  exact fit. */
const HEADER_ROWS = 4;
const FOOTER_ROWS = 3;
const CHROME_MARGIN = 1;

/** Non-list rows the Hub chrome occupies at this terminal height. */
export function chromeRows(rows?: number): number {
  return HEADER_ROWS + FOOTER_ROWS + voyageRows(rows) + CHROME_MARGIN;
}

/** Visible list rows (never overflows rows). */
export function listHeightFor(rows: number | undefined): number {
  return Math.max(MIN_LIST_ROWS, (rows || DEFAULT_ROWS) - chromeRows(rows));
}
