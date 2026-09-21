import { scanClaude } from "./claude";
import { scanCodex } from "./codex";
import { scanMuse } from "./muse";
import { nativeHome, type Harness, type NativeSession } from "./types";

export type { Harness, NativeSession };
export { NATIVE_PARSE_LIMIT, NATIVE_SHOW_LIMIT } from "./types";

export const HARNESS_ORDER: Harness[] = ["claude", "codex", "muse"];

export function loadNativeSessions(limit?: number): NativeSession[] {
  const out: NativeSession[] = [];
  const scans = [
    () => scanClaude(nativeHome("claude"), limit),
    () => scanCodex(nativeHome("codex"), limit),
    () => scanMuse(nativeHome("muse"), limit),
  ];
  for (const scan of scans) {
    try {
      out.push(...scan().items);
    } catch {
      continue;
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

export function loadNativeTotals(): Record<Harness, number> {
  const totals: Record<Harness, number> = { claude: 0, codex: 0, muse: 0 };
  try {
    totals.claude = scanClaude(nativeHome("claude"), 0).total;
  } catch {
    /* ignore */
  }
  try {
    totals.codex = scanCodex(nativeHome("codex"), 0).total;
  } catch {
    /* ignore */
  }
  try {
    totals.muse = scanMuse(nativeHome("muse"), 0).total;
  } catch {
    /* ignore */
  }
  return totals;
}

export function scanHarness(harness: Harness, limit: number): NativeSession[] {
  switch (harness) {
    case "claude":
      return scanClaude(nativeHome("claude"), limit).items;
    case "codex":
      return scanCodex(nativeHome("codex"), limit).items;
    case "muse":
      return scanMuse(nativeHome("muse"), limit).items;
  }
}
