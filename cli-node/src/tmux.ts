/** Atlas-managed tmux sessions: every session Atlas starts lives in tmux,
 *  so any Atlas instance (this terminal or another) can enter, peek at, or
 *  kill it without disturbing the agent. Names are deterministic
 *  (`atlas-<base>-<runtime>-<dirhash>[-r<resume12>][-N]`) so a second Atlas
 *  finds the same session without any bookkeeping. */

import { createHash } from "node:crypto";
import { basename } from "node:path";
import { which } from "bun";
import { dlopen, FFIType, ptr, type Pointer } from "bun:ffi";
import { buildArgv, getRuntime, isAvailable } from "./runtimes";
import { resumeIdFromArgv, ttyForPid, type AgentProc } from "./process";
import { isDir } from "./util";

export const TMUX_PREFIX = "atlas-";
const MAX_SUFFIX = 9;

/** tmux binary: an explicit `ATLAS_TMUX_BIN` wins (tests point it at the
 *  stub; empty means "no tmux"), otherwise resolve from PATH. Note `Bun.which` snapshots PATH at
 *  startup, so runtime PATH games would not work — hence the override. */
export function tmuxBin(): string | null {
  const override = process.env.ATLAS_TMUX_BIN;
  if (override !== undefined) return override || null; // "" = no tmux (direct mode)
  return which("tmux");
}

export function tmuxAvailable(): boolean {
  return tmuxBin() !== null;
}

const usable = new Map<string, boolean>();

/** tmux is configured AND actually runs (`tmux -V`), cached per binary: a
 *  mistyped ATLAS_TMUX_BIN must refuse a migration before anything is
 *  stopped, not after. */
export function tmuxUsable(): boolean {
  const bin = tmuxBin();
  if (!bin) return false;
  const hit = usable.get(bin);
  if (hit !== undefined) return hit;
  let ok = false;
  try {
    ok = Bun.spawnSync([bin, "-V"], { env: liveEnv(), stdout: "ignore", stderr: "ignore" }).exitCode === 0;
  } catch {
    ok = false;
  }
  usable.set(bin, ok);
  return ok;
}

/** Live environment for children: Bun.spawn* reuses the startup
 *  environment, so runtime mutations (tests, overrides) only propagate
 *  when passed explicitly. */
export function liveEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

type ExecVp = (file: string, argv: Pointer) => number;
let execLib: { symbols: { execvp: ExecVp } } | null = null;

function loadExec(): ExecVp {
  if (execLib) return execLib.symbols.execvp;
  let lastErr: unknown = null;
  for (const name of ["libc.so.6", "libc.so", "libSystem.B.dylib"]) {
    try {
      execLib = dlopen(name, {
        execvp: { returns: FFIType.i32, args: [FFIType.cstring, FFIType.ptr] },
      });
      return execLib.symbols.execvp;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`exec indisponível (libc não encontrada): ${String(lastErr)}`);
}

/** Replace this process image (POSIX execvp): same PID, group, terminal —
 *  the true launcher handoff. Spawning tmux attach and exiting instead
 *  orphans the process group, and the kernel's SIGHUP kills the client.
 *  Only returns when the target cannot start (or libc is missing). */
export function execArgv(file: string, argv: string[]): void {
  const execvp = loadExec();
  const bufs = argv.map((a) => Buffer.from(`${a}\0`, "utf-8"));
  const array = new BigUint64Array([...bufs.map((b) => BigInt(ptr(b))), 0n]);
  execvp(file, ptr(array));
  // reached only on failure — keep the buffers alive until here
  void bufs;
  void array;
}

/** tmux names forbid `.` and `:`; keep readable `[A-Za-z0-9_-]` slugs. */
function sanitize(part: string): string {
  const clean = part.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || "s";
}

function dirHash(dir: string): string {
  return createHash("sha1").update(dir).digest("hex").slice(0, 6);
}

/** Deterministic base name for (dir, runtime, resume?). */
export function tmuxBaseName(dir: string, runtime: string, resume?: string): string {
  const parts = [`${TMUX_PREFIX}${sanitize(basename(dir) || "root")}`, sanitize(runtime), dirHash(dir)];
  if (resume) parts.push(`r${resume.replace(/-/g, "").slice(0, 12)}`);
  return parts.join("-");
}

export interface TmuxSession {
  name: string;
  attached: boolean;
  created: number; // ms epoch; 0 when unknown
}

/** Parse `tmux ls -F '#{session_name}\t#{session_attached}\t#{session_created}'`
 *  keeping Atlas sessions only. */
export function parseTmuxLs(out: string): TmuxSession[] {
  const sessions: TmuxSession[] = [];
  for (const line of out.split("\n")) {
    const [name, attached, created] = line.split("\t");
    if (!name || !name.startsWith(TMUX_PREFIX) || attached === undefined) continue;
    sessions.push({ name, attached: attached === "1", created: Number(created) || 0 });
  }
  return sessions;
}

export interface TmuxPane {
  session: string;
  /** Foreground command basename (`pane_current_command`). */
  command: string;
  /** Pane working directory (`pane_current_path`). */
  path: string;
  /** Pane terminal (`pane_tty`, "" when unknown). */
  tty: string;
}

/** Parse `tmux list-panes -a -F '#{session_name}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_tty}'`. */
export function parseTmuxPanes(out: string): TmuxPane[] {
  const panes: TmuxPane[] = [];
  for (const line of out.split("\n")) {
    const [session, command, path, tty] = line.split("\t");
    if (!session || command === undefined || path === undefined) continue;
    panes.push({ session, command, path, tty: tty ?? "" });
  }
  return panes;
}

/** Every pane on the server; empty when tmux is missing or has no server. */
export function listTmuxPanes(): TmuxPane[] {
  const bin = tmuxBin();
  if (!bin) return [];
  try {
    const proc = Bun.spawnSync(
      [bin, "list-panes", "-a", "-F", "#{session_name}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_tty}"],
      { env: liveEnv() },
    );
    if (proc.exitCode !== 0) return [];
    return parseTmuxPanes(proc.stdout.toString());
  } catch {
    return [];
  }
}

/** Run a tmux query without blocking; null on a missing binary or failure. */
async function tmuxQuery(args: string[]): Promise<string | null> {
  const bin = tmuxBin();
  if (!bin) return null;
  try {
    const proc = Bun.spawn([bin, ...args], { env: liveEnv(), stdout: "pipe", stderr: "ignore" });
    const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    return code === 0 ? out : null;
  } catch {
    return null;
  }
}

/** capturePane without blocking (the smart note reads live screens). */
export async function capturePaneAsync(name: string, lines = 200): Promise<string[]> {
  const out = await tmuxQuery(["capture-pane", "-p", "-t", name, "-S", `-${lines}`]);
  if (out === null) return [];
  const rows = out.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (rows.length > 0 && rows[rows.length - 1] === "") rows.pop();
  return rows;
}

/** listTmuxPanes without blocking (the Hub's background refresh). */
export async function listTmuxPanesAsync(): Promise<TmuxPane[]> {
  const out = await tmuxQuery([
    "list-panes",
    "-a",
    "-F",
    "#{session_name}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_tty}",
  ]);
  return out === null ? [] : parseTmuxPanes(out);
}

/** listAtlasSessions without blocking (the Hub's background refresh). */
export async function listAtlasSessionsAsync(): Promise<Map<string, TmuxSession>> {
  const map = new Map<string, TmuxSession>();
  const out = await tmuxQuery(["ls", "-F", "#{session_name}\t#{session_attached}\t#{session_created}"]);
  if (out !== null) for (const s of parseTmuxLs(out)) map.set(s.name, s);
  return map;
}

export interface DetachedLaunch {
  ok: boolean;
  name?: string;
  error?: string;
}

/** Why a detached tmux launch of (dir, runtime) cannot work, or null.
 *  Migration runs this BEFORE stopping anything: a conversation killed for a
 *  relaunch that was never possible is simply lost. */
export function detachedPreflight(dir: string, runtime: string): string | null {
  if (!isDir(dir)) return `diretório não existe: ${dir}`;
  let def;
  try {
    def = getRuntime(runtime);
  } catch {
    return `runtime desconhecido: ${runtime}`;
  }
  if (!isAvailable(def)) return `runtime '${runtime}' não encontrado no PATH.`;
  if (!tmuxBin()) return "tmux não instalado — a migração precisa do tmux.";
  if (!tmuxUsable()) return `tmux não executa (${tmuxBin()}) — confira ATLAS_TMUX_BIN.`;
  return null;
}

/** Create a tmux session and leave it detached (background migrate): never
 *  records history, never attaches. Reuses the session when it exists.
 *  Verifies the session survives a grace period: a runtime that crashes on
 *  start would otherwise vanish silently. */
export function launchDetached(
  dir: string,
  runtime: string,
  resume?: string,
  graceMs = 400,
): DetachedLaunch {
  const why = detachedPreflight(dir, runtime);
  if (why) return { ok: false, error: why };
  const bin = tmuxBin()!;
  let plan;
  try {
    plan = planLaunch({
      dir,
      runtime,
      argv: buildArgv(runtime, resume),
      resume,
      fresh: false,
      tmux: true,
      nested: false,
      exists: hasSession,
      tmuxBin: bin,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (plan.mode === "tmux-attach") return { ok: true, name: plan.name ?? undefined };
  if (plan.mode !== "tmux-new" || !plan.createArgv || !plan.name) {
    return { ok: false, error: "não consegui planejar a sessão tmux." };
  }
  let createdExit = -1;
  try {
    createdExit = Bun.spawnSync(plan.createArgv, { env: liveEnv() }).exitCode;
  } catch {
    /* bad binary: handled below */
  }
  if (createdExit !== 0 && !hasSession(plan.name)) {
    return { ok: false, error: `não consegui criar a sessão tmux '${plan.name}'.` };
  }
  ensureMouse(plan.name); // wheel scroll works the moment the user enters
  if (graceMs > 0) Bun.sleepSync(graceMs);
  if (!hasSession(plan.name)) {
    return { ok: false, error: "o runtime encerrou logo após iniciar no tmux — nada foi migrado." };
  }
  return { ok: true, name: plan.name };
}

/** Live Atlas sessions by name; empty when tmux is missing or has no server. */
export function listAtlasSessions(): Map<string, TmuxSession> {
  const out = new Map<string, TmuxSession>();
  const bin = tmuxBin();
  if (!bin) return out;
  try {
    const proc = Bun.spawnSync(
      [bin, "ls", "-F", "#{session_name}\t#{session_attached}\t#{session_created}"],
      { env: liveEnv() },
    );
    if (proc.exitCode !== 0) return out; // no server running
    for (const s of parseTmuxLs(proc.stdout.toString())) out.set(s.name, s);
  } catch {
    /* tmux vanished mid-call */
  }
  return out;
}

/** Exact base name first, then `-2`..`-9` (intentional duplicates). */
export function matchAtlasSession(
  live: { has(name: string): boolean },
  base: string,
): string | null {
  if (live.has(base)) return base;
  for (let i = 2; i <= MAX_SUFFIX; i++) {
    const name = `${base}-${i}`;
    if (live.has(name)) return name;
  }
  return null;
}

/** Session-name match plus resume-suffixed launches (`<base>-r<id>`): a
 *  history row matches every tmux session its (dir, runtime) owns,
 *  resumed or not. The `-r` anchor keeps other hashes from matching. */
export function matchAtlasSessionDeep(live: Map<string, TmuxSession>, base: string): string | null {
  const direct = matchAtlasSession(live, base);
  if (direct) return direct;
  const prefix = `${base}-r`;
  for (const name of live.keys()) {
    if (name.startsWith(prefix)) return name;
  }
  return null;
}

/** tmux sessions keyed by what the Hub already shows: history keys and resume ids. */
export interface TmuxFallback {
  byKey: Map<string, string>;
  byResume: Map<string, string>;
}

/** Link live agents to their tmux panes by terminal: a process whose fd 0
 *  is a pane pty runs inside that session, whatever the session is named.
 *  Covers foreign sessions Atlas did not create (name matching cannot). */
export function buildTmuxFallback(
  agents: AgentProc[],
  panes: TmuxPane[],
  ttyOf: (pid: number) => string | null = ttyForPid,
): TmuxFallback {
  const byTty = new Map<string, string>();
  for (const p of panes) {
    if (p.tty && !byTty.has(p.tty)) byTty.set(p.tty, p.session);
  }
  const byKey = new Map<string, string>();
  const byResume = new Map<string, string>();
  for (const a of agents) {
    const tty = ttyOf(a.pid);
    const session = tty ? byTty.get(tty) : undefined;
    if (!session) continue;
    const key = `${a.dir}\0${a.bin}`;
    if (!byKey.has(key)) byKey.set(key, session);
    const id = resumeIdFromArgv(a.argv);
    if (id && !byResume.has(id)) byResume.set(id, session);
  }
  return { byKey, byResume };
}

/** Quote one argv word for `sh -c` (tmux runs the command through a shell). */
export function shQuote(word: string): string {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}

export type LaunchMode = "tmux-new" | "tmux-attach" | "direct";

export interface LaunchPlan {
  mode: LaunchMode;
  /** tmux session name (null for direct launches). */
  name: string | null;
  /** `tmux new-session -d …` (tmux-new only). */
  createArgv: string[] | null;
  /** `tmux attach …` (or `switch-client` when nested) for tmux modes. */
  attachArgv: string[] | null;
  /** runtime argv for direct launches. */
  directArgv: string[] | null;
}

export interface PlanOpts {
  dir: string;
  runtime: string;
  argv: string[];
  resume?: string;
  fresh?: boolean;
  tmux: boolean;
  nested: boolean;
  exists: (name: string) => boolean;
  /** tmux binary for the planned argv (defaults to PATH lookup). */
  tmuxBin?: string;
}

/** Decide how a session starts: reuse an existing tmux session when the name
 *  is taken (attach never duplicates), bump `-N` for intentional duplicates
 *  (`fresh`, ignored for resumes — one convo means one session). */
export function planLaunch(opts: PlanOpts): LaunchPlan {
  if (!opts.tmux) {
    return { mode: "direct", name: null, createArgv: null, attachArgv: null, directArgv: opts.argv };
  }
  const base = tmuxBaseName(opts.dir, opts.runtime, opts.resume);
  let name = base;
  if (opts.fresh && !opts.resume) {
    let i = 1;
    while (opts.exists(name)) {
      i++;
      if (i > MAX_SUFFIX) throw new Error(`muitas sessões ativas para ${base}`);
      name = `${base}-${i}`;
    }
  }
  const bin = opts.tmuxBin ?? "tmux";
  const attachArgv = opts.nested
    ? [bin, "switch-client", "-t", name]
    : [bin, "attach-session", "-t", name];
  if (!opts.fresh || opts.resume) {
    if (opts.exists(name)) {
      return { mode: "tmux-attach", name, createArgv: null, attachArgv, directArgv: null };
    }
  }
  return {
    mode: "tmux-new",
    name,
    createArgv: [
      bin,
      "new-session",
      "-d",
      "-s",
      name,
      "-c",
      opts.dir,
      opts.argv.map(shQuote).join(" "),
    ],
    attachArgv,
    directArgv: null,
  };
}

export function hasSession(name: string): boolean {
  const bin = tmuxBin();
  if (!bin) return false;
  try {
    return Bun.spawnSync([bin, "has-session", "-t", name], { env: liveEnv() }).exitCode === 0;
  } catch {
    return false;
  }
}

/** Last `lines` of the session pane, plain text, read-only. */
export function capturePane(name: string, lines = 200): string[] {
  const bin = tmuxBin();
  if (!bin) return [];
  try {
    const proc = Bun.spawnSync([bin, "capture-pane", "-p", "-t", name, "-S", `-${lines}`], {
      env: liveEnv(),
    });
    if (proc.exitCode !== 0) return [];
    const out = proc.stdout.toString().split("\n").map((l) => l.replace(/\s+$/, ""));
    if (out.length > 0 && out[out.length - 1] === "") out.pop();
    return out;
  } catch {
    return [];
  }
}

export function killSession(name: string): boolean {
  const bin = tmuxBin();
  if (!bin) return false;
  try {
    return Bun.spawnSync([bin, "kill-session", "-t", name], { env: liveEnv() }).exitCode === 0;
  } catch {
    return false;
  }
}

/** Turn mouse mode on for one session (wheel scroll, pane focus, app
 *  mouse events). Session-scoped: the rest of the server keeps its own
 *  setting. Best-effort — never fails a launch or attach. */
export function ensureMouse(name: string): void {
  const bin = tmuxBin();
  if (!bin) return;
  try {
    Bun.spawnSync([bin, "set-option", "-t", name, "mouse", "on"], { env: liveEnv() });
  } catch {
    /* tmux vanished mid-call: attach still proceeds without mouse */
  }
}
