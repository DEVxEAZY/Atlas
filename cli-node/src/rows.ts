/** Sectioned-row models shared by the screens (renderer-free, unit-tested). */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { Session } from "./history";
import { HARNESS_ORDER, NATIVE_SHOW_LIMIT, type Harness, type NativeSession } from "./native/index";
import { splitDomain, type Candidate } from "./repos";
import { RUNTIME_ICON } from "./theme";
import { ago, shorten } from "./util";

export const HARNESS_LABEL: Record<Harness, string> = {
  claude: "Claude",
  codex: "Codex",
  muse: "Muse",
};

export type SessionRow = { t: "header"; label: string } | { t: "session"; session: Session };

export function sessionDisplay(s: Session): string {
  const [domain, rel] = splitDomain(s.dir);
  if (domain === null) return shorten(s.dir);
  return rel || domain;
}

export function sessionLabel(s: Session): string {
  const missing = existsSync(s.dir) ? "" : " ⚠";
  return `${s.runtime} ${sessionDisplay(s)} · ${ago(s.last_used)} · ${s.uses}x${missing}`;
}

export function matchSession(s: Session, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${s.runtime} ${s.dir} ${sessionDisplay(s)}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function sessionRows(
  sessions: Session[],
  isRunning: (s: Session) => boolean = () => false,
): SessionRow[] {
  const groups = new Map<string, Session[]>();
  for (const s of sessions) {
    const [domain] = splitDomain(s.dir);
    const key = domain ?? "outros";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    // groups with a live session pin to the top, then most recent activity
    const ra = a[1].some(isRunning) ? 0 : 1;
    const rb = b[1].some(isRunning) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const ma = Math.max(...a[1].map((s) => Date.parse(s.last_used)));
    const mb = Math.max(...b[1].map((s) => Date.parse(s.last_used)));
    return mb - ma;
  });
  const rows: SessionRow[] = [];
  for (const [domain, items] of ordered) {
    items.sort(
      (a, b) =>
        Number(!isRunning(a)) - Number(!isRunning(b)) ||
        Date.parse(b.last_used) - Date.parse(a.last_used),
    );
    rows.push({
      t: "header",
      label: `${domain}  ·  ${items.length} ${items.length === 1 ? "sessão" : "sessões"}`,
    });
    for (const s of items) rows.push({ t: "session", session: s });
  }
  return rows;
}

export type PickRow =
  | { t: "free"; path: string }
  | { t: "header"; label: string }
  | { t: "candidate"; candidate: Candidate };

export function filterCandidates(cands: Candidate[], query: string): Candidate[] {
  const q = query.trim().toLowerCase();
  if (!q) return cands;
  const words = q.split(/\s+/);
  const scored: Array<[number, Candidate]> = [];
  for (const c of cands) {
    const [, rel] = splitDomain(c.path);
    const name = c.path.split("/").pop()!.toLowerCase();
    const hay = `${c.path} ${rel} ${c.domain}`.toLowerCase();
    if (!words.every((w) => hay.includes(w))) continue;
    scored.push([name.startsWith(words[0]) ? 0 : words[0] && name.includes(words[0]) ? 1 : 2, c]);
  }
  scored.sort((a, b) => a[0] - b[0] || (a[1].path < b[1].path ? -1 : 1));
  return scored.map(([, c]) => c);
}

export function candidateDisplay(c: Candidate): string {
  if (c.kind === "domain") return "⌂ raiz do domínio";
  const [, rel] = splitDomain(c.path);
  return rel || c.path.split("/").pop()!;
}

export function expandPath(typed: string): string | null {
  const t = typed.trim();
  if (!t) return null;
  const expanded = t.startsWith("~") ? join(homedir(), t.slice(1)) : t;
  const abs = isAbsolute(expanded) ? expanded : join(process.cwd(), expanded);
  try {
    return existsSync(abs) ? abs : null;
  } catch {
    return null;
  }
}

export function pickRows(cands: Candidate[], query: string): PickRow[] {
  const rows: PickRow[] = [];
  const free = expandPath(query);
  if (free) rows.push({ t: "free", path: free });
  const groups = new Map<string, Candidate[]>();
  for (const c of filterCandidates(cands, query)) {
    if (!groups.has(c.domain)) groups.set(c.domain, []);
    groups.get(c.domain)!.push(c);
  }
  for (const domain of [...groups.keys()].sort()) {
    const items = groups.get(domain)!.sort((a, b) => {
      const ka = a.kind === "repo" ? 0 : 1;
      const kb = b.kind === "repo" ? 0 : 1;
      return ka - kb || candidateDisplay(a).localeCompare(candidateDisplay(b));
    });
    const repos = items.filter((i) => i.kind === "repo").length;
    const dirs = items.filter((i) => i.kind === "dir").length;
    const parts: string[] = [];
    if (repos) parts.push(`${repos} ${repos === 1 ? "repo" : "repos"}`);
    if (dirs) parts.push(`${dirs} ${dirs === 1 ? "pasta" : "pastas"}`);
    rows.push({ t: "header", label: `${domain}  ·  ${parts.join(" · ")}` });
    for (const c of items) rows.push({ t: "candidate", candidate: c });
  }
  return rows;
}

export type ConvoRow = { t: "header"; label: string } | { t: "convo"; convo: NativeSession };

export type ConvoExpandMode = "more" | "less" | "loading";

/** Selectable per-harness row appended after a capped group (never a header). */
export interface ConvoExpand {
  t: "expand";
  harness: Harness;
  mode: ConvoExpandMode;
  total: number;
}

export function convoExpandLabel(e: Pick<ConvoExpand, "mode" | "total">): string {
  if (e.mode === "loading") return "… carregando…";
  if (e.mode === "less") return "… ver menos";
  return `… ver todas (${e.total})`;
}

export function convoDisplay(c: NativeSession): string {
  if (!c.dir) return "—";
  const [domain, rel] = splitDomain(c.dir);
  if (!domain) return shorten(c.dir);
  return rel || domain;
}

/** Scratch dirs stay out of Conversas unless asked for. */
export function isTmpDir(dir: string | null | undefined): boolean {
  return !!dir && (dir === "/tmp" || dir.startsWith("/tmp/"));
}

export function matchConvo(c: NativeSession, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = `${c.harness} ${c.id} ${c.dir ?? ""} ${c.preview ?? ""}`.toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export function convoRows(
  convos: NativeSession[],
  perHarness: number = NATIVE_SHOW_LIMIT,
): ConvoRow[] {
  const rows: ConvoRow[] = [];
  for (const h of HARNESS_ORDER) {
    const items = convos
      .filter((c) => c.harness === h)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (items.length === 0) continue;
    const shown = items.slice(0, perHarness);
    const count = shown.length < items.length ? `${shown.length} de ${items.length}` : `${items.length}`;
    rows.push({ t: "header", label: `${RUNTIME_ICON[h]} ${HARNESS_LABEL[h]}  ·  ${count}` });
    for (const c of shown) rows.push({ t: "convo", convo: c });
  }
  return rows;
}

export interface RowLike {
  t: string;
}

/** Move a highlight index by delta, skipping header rows. Returns null when no items. */
export function moveIndex<T extends RowLike>(rows: T[], index: number, delta: number): number | null {
  if (delta === 0) return firstItemIndex(rows);
  const step = delta > 0 ? 1 : -1;
  let i = index;
  for (let n = 0; n < rows.length; n++) {
    i += step;
    if (i < 0 || i >= rows.length) return clampItem(rows, index);
    if (rows[i].t !== "header") return i;
  }
  return clampItem(rows, index);
}

function clampItem<T extends RowLike>(rows: T[], fallback: number): number | null {
  if (rows[fallback] && rows[fallback].t !== "header") return fallback;
  return firstItemIndex(rows);
}

export function firstItemIndex<T extends RowLike>(rows: T[]): number | null {
  const i = rows.findIndex((r) => r.t !== "header");
  return i === -1 ? null : i;
}

export function lastItemIndex<T extends RowLike>(rows: T[]): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].t !== "header") return i;
  }
  return null;
}

/** Visible [start, end) slice keeping index on screen. */
export function windowSlice(count: number, index: number | null, height: number): [number, number] {
  if (count <= height) return [0, count];
  const i = index ?? 0;
  const start = Math.max(0, Math.min(i - Math.floor(height / 3), count - height));
  return [start, start + height];
}
