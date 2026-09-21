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
import { isDir } from "./util";

export const TMUX_PREFIX = "atlas-";
const MAX_SUFFIX = 9;

/** tmux binary: an explicit `ATLAS_TMUX_BIN` wins (tests point it at the
 *  stub), otherwise resolve from PATH. Note `Bun.which` snapshots PATH at
 *  startup, so runtime PATH games would not work — hence the override. */
export function tmuxBin(): string | null {
  return process.env.ATLAS_TMUX_BIN ?? which("tmux");
}

export function tmuxAvailable(): boolean {
  return tmuxBin() !== null;
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
}

/** Parse `tmux list-panes -a -F '#{session_name}\t#{pane_current_command}\t#{pane_current_path}'`. */
export function parseTmuxPanes(out: string): TmuxPane[] {
  const panes: TmuxPane[] = [];
  for (const line of out.split("\n")) {
    const [session, command, path] = line.split("\t");
    if (!session || command === undefined || path === undefined) continue;
    panes.push({ session, command, path });
  }
  return panes;
}

/** Every pane on the server; empty when tmux is missing or has no server. */
export function listTmuxPanes(): TmuxPane[] {
  const bin = tmuxBin();
  if (!bin) return [];
  try {
    const proc = Bun.spawnSync(
      [bin, "list-panes", "-a", "-F", "#{session_name}\t#{pane_current_command}\t#{pane_current_path}"],
      { env: liveEnv() },
    );
    if (proc.exitCode !== 0) return [];
    return parseTmuxPanes(proc.stdout.toString());
  } catch {
    return [];
  }
}

export interface DetachedLaunch {
  ok: boolean;
  name?: string;
  error?: string;
}

/** Create a tmux session and leave it detached (background migrate): never
 *  records history, never attaches. Reuses the session when it exists. */
export function launchDetached(dir: string, runtime: string, resume?: string): DetachedLaunch {
  if (!isDir(dir)) return { ok: false, error: `diretório não existe: ${dir}` };
  let def;
  try {
    def = getRuntime(runtime);
  } catch {
    return { ok: false, error: `runtime desconhecido: ${runtime}` };
  }
  if (!isAvailable(def)) {
    return { ok: false, error: `runtime '${runtime}' não encontrado no PATH.` };
  }
  const bin = tmuxBin();
  if (!bin) return { ok: false, error: "tmux não instalado — a migração precisa do tmux." };
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
  if (plan.mode === "tmux-attach") return { ok: true, name: plan.name };
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
