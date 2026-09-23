/** Live-process detection: which directories have an agent running in them.
 *
 * Reads /proc directly (Linux): for each pid, match the executable basename
 * against known harness binaries and read its cwd. No dependencies, a few ms.
 */

import { readdirSync, readFileSync, readlinkSync, statSync } from "node:fs";
import { readdir, readFile, readlink } from "node:fs/promises";
import { basename, join } from "node:path";

export const HARNESS_BINS = ["codex", "claude", "muse"] as const;

/** Interpreters to see through: `sh script`, `env node script`, … */
const INTERPRETERS = new Set([
  "sh",
  "bash",
  "dash",
  "zsh",
  "fish",
  "node",
  "bun",
  "deno",
  "env",
  "python",
  "python3",
  "ruby",
  "perl",
]);

/** Exact match plus versioned forms (`muse-bin-1.3.0`, `claude.exe`). */
export function matchBin(candidate: string, name: string): boolean {
  return candidate === name || candidate.startsWith(`${name}-`) || candidate.startsWith(`${name}.`);
}

/** Harness runtime for a command basename (tmux pane, `ps` line), if any. */
export function runtimeForCommand(command: string): string | null {
  return HARNESS_BINS.find((b) => matchBin(command, b)) ?? null;
}

/** Candidate basenames for a pid: exe link, argv[0], and through interpreters. */
function candidates(exe: string | null, argv: string[]): string[] {
  const out: string[] = [];
  if (exe) out.push(basename(exe));
  for (let i = 0; i < Math.min(argv.length, 4); i++) {
    const base = basename(argv[i]);
    if (!base) continue;
    out.push(base);
    if (!INTERPRETERS.has(base)) break;
  }
  return out;
}

/** Detailed live-agent hit: pid + cwd + matched bin + full argv. */
export interface AgentProc {
  pid: number;
  dir: string;
  bin: string;
  argv: string[];
}

/** One /proc walk returning every pid whose exe/argv matches a harness bin. */
export function scanAgents(
  names: readonly string[] = HARNESS_BINS,
  procRoot: string = "/proc",
): AgentProc[] {
  const out: AgentProc[] = [];
  if (names.length === 0) return out;
  let entries: string[];
  try {
    entries = readdirSync(procRoot);
  } catch {
    return out;
  }
  for (const pid of entries) {
    if (!/^\d+$/.test(pid)) continue;
    let exe: string | null = null;
    let argv: string[] = [];
    try {
      exe = readlinkSync(join(procRoot, pid, "exe"));
    } catch {
      /* kernel threads, gone, or unreadable */
    }
    try {
      argv = readFileSync(join(procRoot, pid, "cmdline"), "utf-8").split("\0");
    } catch {
      /* gone */
    }
    if (!exe && argv.length === 0) continue;
    const cands = candidates(exe, argv);
    const hit = names.find((n) => cands.some((c) => matchBin(c, n)));
    if (!hit) continue;
    let cwd: string;
    try {
      cwd = readlinkSync(join(procRoot, pid, "cwd"));
    } catch {
      continue;
    }
    out.push({ pid: Number(pid), dir: cwd, bin: hit, argv: argv.filter((a) => a !== "") });
  }
  return out;
}

/** scanAgents without blocking: the same walk with async reads, so the
 *  Hub's background refresh never stalls a keypress. */
export async function scanAgentsAsync(
  names: readonly string[] = HARNESS_BINS,
  procRoot: string = "/proc",
): Promise<AgentProc[]> {
  if (names.length === 0) return [];
  let entries: string[];
  try {
    entries = await readdir(procRoot);
  } catch {
    return [];
  }
  const found = await Promise.all(
    entries
      .filter((pid) => /^\d+$/.test(pid))
      .map(async (pid): Promise<AgentProc | null> => {
        const [exe, cmdline] = await Promise.all([
          readlink(join(procRoot, pid, "exe")).catch(() => null),
          readFile(join(procRoot, pid, "cmdline"), "utf-8").catch(() => null),
        ]);
        const argv = cmdline === null ? [] : cmdline.split("\0");
        if (!exe && argv.length === 0) return null;
        const cands = candidates(exe, argv);
        const hit = names.find((n) => cands.some((c) => matchBin(c, n)));
        if (!hit) return null;
        const cwd = await readlink(join(procRoot, pid, "cwd")).catch(() => null);
        if (cwd === null) return null;
        return { pid: Number(pid), dir: cwd, bin: hit, argv: argv.filter((x) => x !== "") };
      }),
  );
  return found.filter((a): a is AgentProc => a !== null);
}

/** "dir\0bin" keys for an agent list (one /proc walk feeds every index). */
export function keysForAgents(agents: AgentProc[]): Set<string> {
  const out = new Set<string>();
  for (const a of agents) out.add(`${a.dir}\0${a.bin}`);
  return out;
}

/** Resume ids referenced by an agent list. */
export function resumeIdsForAgents(agents: AgentProc[]): Set<string> {
  const out = new Set<string>();
  for (const a of agents) {
    const id = resumeIdFromArgv(a.argv);
    if (id) out.add(id);
  }
  return out;
}

/** Map of dir -> harness names with a live process there.
 *  Records the wanted runtime name (so `muse-bin-1.3` counts as `muse`).
 *  Pass custom names (e.g. ["sleep"]) in tests. */
export function scanProcesses(
  names: readonly string[] = HARNESS_BINS,
  procRoot: string = "/proc",
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const a of scanAgents(names, procRoot)) {
    const set = out.get(a.dir) ?? new Set<string>();
    set.add(a.bin);
    out.set(a.dir, set);
  }
  return out;
}

/** "dir\0runtime" keys for history sessions with a live agent process. */
export function runningKeys(names: readonly string[] = HARNESS_BINS): Set<string> {
  return keysForAgents(scanAgents(names));
}

/** PIDs of live agents for one history key. */
export function pidsForKey(
  dir: string,
  runtime: string,
  procRoot: string = "/proc",
): number[] {
  return scanAgents([runtime], procRoot)
    .filter((a) => a.dir === dir)
    .map((a) => a.pid);
}

/** Resume id referenced by an argv (`resume <id>`, `--resume <id|=id>`), if any. */
export function resumeIdFromArgv(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "resume" || a === "--resume") {
      const v = argv[i + 1];
      if (v && !v.startsWith("-")) return v;
    } else if (a.startsWith("--resume=")) {
      const v = a.slice("--resume=".length);
      if (v) return v;
    }
  }
  return null;
}

/** Resume ids with a live harness process (a duplicate resume corrupts the session). */
export function runningResumeIds(
  names: readonly string[] = HARNESS_BINS,
  procRoot: string = "/proc",
): Set<string> {
  return resumeIdsForAgents(scanAgents(names, procRoot));
}

/** PIDs currently holding one resume id. */
export function pidsForResume(
  id: string,
  names: readonly string[] = HARNESS_BINS,
  procRoot: string = "/proc",
): number[] {
  return scanAgents(names, procRoot)
    .filter((a) => resumeIdFromArgv(a.argv) === id)
    .map((a) => a.pid);
}

/** Distinct resume ids held by pids, from their argv (empty = none held). */
export function resumeIdsForPids(pids: number[], procRoot: string = "/proc"): string[] {
  if (pids.length === 0) return [];
  const wanted = new Set(pids);
  const ids = new Set<string>();
  for (const a of scanAgents(HARNESS_BINS, procRoot)) {
    if (!wanted.has(a.pid)) continue;
    const id = resumeIdFromArgv(a.argv);
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Start time of a pid (ms epoch) via /proc mtime; null when unknown. */
export function procStartedAt(pid: number, procRoot: string = "/proc"): number | null {
  try {
    return statSync(join(procRoot, String(pid))).mtimeMs;
  } catch {
    return null;
  }
}

/** Controlling terminal of a pid via fd 0 (`/dev/pts/N`), if readable.
 *  Matches `pane_tty` from tmux: the link between a process and the
 *  (possibly foreign-named) tmux session holding it. */
export function ttyForPid(pid: number, procRoot: string = "/proc"): string | null {
  try {
    return readlinkSync(join(procRoot, String(pid), "fd", "0"));
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const tick = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** SIGTERM, then SIGKILL after grace. Missing PIDs count as killed. */
export async function terminatePids(
  pids: number[],
  graceMs = 1000,
): Promise<{ killed: number[]; alive: number[] }> {
  const targets = [...new Set(pids)];
  for (const pid of targets) {
    if (!pidAlive(pid)) continue;
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* raced with exit */
    }
  }
  const t0 = Date.now();
  while (Date.now() - t0 < graceMs) {
    if (targets.every((p) => !pidAlive(p))) break;
    await tick(50);
  }
  for (const pid of targets) {
    if (!pidAlive(pid)) continue;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* raced with exit */
    }
  }
  for (let i = 0; i < 4 && !targets.every((p) => !pidAlive(p)); i++) await tick(50);
  return {
    killed: targets.filter((p) => !pidAlive(p)),
    alive: targets.filter((p) => pidAlive(p)),
  };
}
