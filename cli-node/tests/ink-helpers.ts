/** Shared helpers for Ink TUI tests (ink-testing-library + stdin sequences). */
import { render } from "ink-testing-library";
import type { ReactElement } from "react";

export type InkApp = ReturnType<typeof render>;

export const KEY = {
  up: "\x1B[A",
  down: "\x1B[B",
  left: "\x1B[D",
  right: "\x1B[C",
  enter: "\r",
  esc: "\x1B",
  tab: "\t",
  ctrlC: "\x03",
} as const;

export function mount(tree: ReactElement): InkApp {
  return render(tree);
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/** Live-row spinner: the glyph sits right after the 2-space root padding at
 *  a list-row start. Anchored so it only matches list rows, never the
 *  mascot art beside them. */
export const LIVE_SPIN_RE = /^  [⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] /m;

/** Send raw input and let Ink flush it. */
export async function key(app: InkApp, data: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    app.stdin.write(data);
    await sleep(15);
  }
}

/** Fire several inputs back-to-back with no render in between (fast typing). */
export async function burst(app: InkApp, ...datas: string[]): Promise<void> {
  for (const d of datas) app.stdin.write(d);
  await sleep(40);
}

/** Poll lastFrame until pred passes or timeout. */
export async function waitFrame(
  app: InkApp,
  pred: (f: string) => boolean,
  timeoutMs = 8000,
): Promise<string> {
  const t0 = Date.now();
  for (;;) {
    const f = app.lastFrame() ?? "";
    if (pred(f)) return f;
    if (Date.now() - t0 > timeoutMs)
      throw new Error(`ink frame timeout; last frame:\n${f}`);
    await sleep(15);
  }
}

/** Wait until cond passes or timeout. */
export async function waitFor(
  cond: () => boolean,
  timeoutMs = 8000,
): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error("waitFor timeout");
    await sleep(15);
  }
}
