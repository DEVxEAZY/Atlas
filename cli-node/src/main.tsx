/** Atlas launcher: resolve (directory, runtime) then hand the terminal to it. */

import React from "react";
import { existsSync, writeSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { render } from "ink";
import App, { type Choice, type Screen } from "./App";
import { cronMain } from "./cronCli";
import { enableNativeCache } from "./screens/Hub";
import { load, record, type Session } from "./history";
import { runningKeys } from "./process";
import { RUNTIME_ORDER, buildArgv } from "./runtimes";
import {
  ensureMouse,
  execArgv,
  hasSession,
  listAtlasSessions,
  liveEnv,
  matchAtlasSessionDeep,
  planLaunch,
  tmuxBaseName,
  tmuxBin,
  type LaunchPlan,
  type TmuxSession,
} from "./tmux";
import { ago, isDir, shorten } from "./util";
import { G } from "./glyphs";

export interface LaunchOpts {
  dryRun?: boolean;
  resume?: string;
  fresh?: boolean;
  attachTmux?: string;
  /** Come back to Atlas afterwards: wait for the tmux client instead of
   *  becoming it (the TUI loop). */
  stay?: boolean;
}

/** A tmux handoff the TUI loop comes back from: the session it went to,
 *  and whether Atlas was nested (it stayed behind in its own pane). */
export interface Back {
  back: string;
  nested: boolean;
}

/** Hand the terminal to a tmux session: nested Atlas switches the current
 *  client (returns fast); otherwise this process BECOMES the attach-client
 *  via exec — same PID, group and terminal, so the kernel never sees an
 *  orphaned group to SIGHUP. Only returns when exec itself fails.
 *  With `stay`, Atlas instead waits for the client in the foreground (it
 *  never exits first, so nothing is orphaned) and returns on detach. */
function handoff(plan: LaunchPlan, stay = false): number | Back {
  // every attach heals mouse mode (wheel scroll, app mouse events),
  // including sessions created before Atlas set it
  if (plan.name) ensureMouse(plan.name);
  const nested = !!process.env.TMUX;
  if (nested) {
    let code = -1;
    try {
      code = Bun.spawnSync(plan.attachArgv!, { env: liveEnv() }).exitCode;
    } catch {
      /* bad binary: handled below */
    }
    if (code !== 0) {
      console.error(`atlas: não consegui entrar na sessão ${plan.name}.`);
      return 2;
    }
    return stay ? { back: plan.name!, nested } : 0;
  }
  if (stay) {
    let code = -1;
    try {
      code = Bun.spawnSync(plan.attachArgv!, {
        env: liveEnv(),
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }).exitCode;
    } catch {
      /* bad binary: handled below */
    }
    if (code !== 0 && !hasSession(plan.name!)) {
      console.error(`atlas: não consegui entrar na sessão ${plan.name}.`);
      return 2;
    }
    // detached, or the session ended: either way, back to the Hub
    return { back: plan.name!, nested };
  }
  try {
    execArgv(plan.attachArgv![0], plan.attachArgv!);
  } catch (err) {
    console.error(`atlas: ${err instanceof Error ? err.message : err}`);
    return 2;
  }
  console.error(`atlas: não consegui entrar na sessão ${plan.name}.`);
  return 2;
}

function describePlan(plan: LaunchPlan, directory: string): string {
  if (plan.mode === "direct") return `cd ${directory} && exec ${plan.directArgv!.join(" ")}`;
  if (plan.mode === "tmux-attach") return plan.attachArgv!.join(" ");
  return `${plan.createArgv!.join(" ")} && ${plan.attachArgv!.join(" ")}`;
}

/** Absolute form of a user-typed directory: tmux names hash the path, so
 *  `.` and `~/x` must name the same session as their absolute spelling. */
export function absDir(directory: string): string {
  return resolve(directory.replace(/^~(?=\/|$)/, homedir()));
}

export async function launch(
  target: string,
  runtime: string,
  opts: LaunchOpts = {},
): Promise<number> {
  const r = await launchOrBack(target, runtime, opts);
  return typeof r === "number" ? r : 0;
}

async function launchOrBack(
  target: string,
  runtime: string,
  opts: LaunchOpts,
): Promise<number | Back> {
  const directory = absDir(target);
  if (opts.attachTmux) {
    const name = opts.attachTmux;
    const bin = tmuxBin();
    if (!bin) {
      console.error("atlas: tmux não encontrado — impossível entrar na sessão.");
      return 2;
    }
    if (!hasSession(name)) {
      console.error(`atlas: sessão tmux '${name}' não existe mais.`);
      return 2;
    }
    const attachArgv = process.env.TMUX
      ? [bin, "switch-client", "-t", name]
      : [bin, "attach-session", "-t", name];
    if (opts.dryRun) {
      console.log(attachArgv.join(" "));
      return 0;
    }
    return handoff({ mode: "tmux-attach", name, createArgv: null, attachArgv, directArgv: null }, opts.stay);
  }
  if (!isDir(directory)) {
    console.error(`atlas: diretório não existe: ${directory}`);
    return 2;
  }
  const argv = buildArgv(runtime, opts.resume);
  const bin = tmuxBin();
  let plan: LaunchPlan;
  try {
    plan = planLaunch({
      dir: directory,
      runtime,
      argv,
      resume: opts.resume,
      fresh: opts.fresh,
      tmux: bin !== null,
      nested: !!process.env.TMUX,
      exists: hasSession,
      tmuxBin: bin ?? "tmux",
    });
  } catch (err) {
    console.error(`atlas: ${err instanceof Error ? err.message : err}`);
    return 2;
  }
  if (opts.dryRun) {
    console.log(describePlan(plan, directory));
    return 0;
  }
  record(directory, runtime);
  if (plan.mode === "direct") {
    // sync write: exec replaces the image below, flushing nothing
    writeSync(2, "atlas: tmux não encontrado — sessão direta, sem gerenciamento entre terminais.\n");
    process.chdir(directory);
    try {
      execArgv(plan.directArgv![0], plan.directArgv!);
    } catch (err) {
      console.error(`atlas: ${err instanceof Error ? err.message : err}`);
      return 2;
    }
    console.error(`atlas: não consegui iniciar '${runtime}'.`);
    return 2;
  }
  if (plan.mode === "tmux-new") {
    let createdExit = -1;
    let createdErr = "";
    try {
      const created = Bun.spawnSync(plan.createArgv!, { env: liveEnv() });
      createdExit = created.exitCode;
      createdErr = created.stderr.toString().trim();
    } catch {
      /* bad binary: handled below */
    }
    if (createdExit !== 0) {
      // Lost a race with another Atlas (or a stale name): attach if it exists now.
      if (!hasSession(plan.name!)) {
        console.error(
          `atlas: não consegui criar a sessão tmux '${plan.name}'${createdErr ? `:\n${createdErr}` : "."}`,
        );
        return 2;
      }
    }
  }
  return handoff(plan, opts.stay);
}

/** What the Hub says on coming back from a tmux session. */
export function backNotice(b: Back): string {
  return b.nested
    ? `${b.back} abriu no tmux · Ctrl-b L volta para cá.`
    : `Voltou de ${b.back} · a sessão segue rodando no tmux.`;
}

/** The TUI as a loop: every tmux session opened from it comes back here on
 *  detach (Ctrl-b d), or stays reachable with Ctrl-b L when nested. Leaves
 *  on quit, on a launch outside tmux, or on an error. */
async function tui(start?: Screen, dryRun = false): Promise<number> {
  enableNativeCache();
  let notice: string | undefined;
  for (;;) {
    const choice = await pick(start, notice);
    start = undefined;
    if (!choice) return 0;
    const r = await launchOrBack(choice.dir, choice.runtime, {
      dryRun,
      resume: choice.resume,
      fresh: choice.fresh,
      attachTmux: choice.attachTmux,
      stay: !dryRun,
    });
    if (typeof r === "number") return r;
    notice = backNotice(r);
  }
}

export function listSessions(): number {
  const sessions = load();
  if (sessions.length === 0) {
    console.log("Nenhuma sessão registrada.");
    return 0;
  }
  for (const s of sessions) {
    const missing = existsSync(s.dir) ? "" : ` ${G.warn}`;
    console.log(`${s.runtime.padEnd(7)} ${shorten(s.dir)}  · ${ago(s.last_used)} · ${s.uses}x${missing}`);
  }
  return 0;
}

export type Here =
  | { kind: "attach"; name: string; runtime: string }
  | { kind: "running"; session: Session }
  | { kind: "launch"; runtime: string }
  | { kind: "pick" };

/** What `atlas DIR` re-enters, never duplicating: a live Atlas tmux session
 *  for the directory (most recently used runtime first, resumed ones
 *  included), else the management view of an agent already running there
 *  outside tmux, else the last runtime from history, else the picker. */
export function planHere(
  dir: string,
  live: Map<string, TmuxSession> = listAtlasSessions(),
  sessions: Session[] = load(),
  running: Set<string> = runningKeys(),
): Here {
  const mine = sessions.filter((s) => s.dir === dir);
  const used = mine.map((s) => s.runtime);
  for (const runtime of new Set([...used, ...RUNTIME_ORDER])) {
    const name = matchAtlasSessionDeep(live, tmuxBaseName(dir, runtime));
    if (name) return { kind: "attach", name, runtime };
  }
  const busy = mine.find((s) => running.has(`${s.dir}\0${s.runtime}`));
  if (busy) return { kind: "running", session: busy };
  if (used.length > 0) return { kind: "launch", runtime: used[0] };
  return { kind: "pick" };
}

export async function here(target: string, opts: { dryRun?: boolean } = {}): Promise<number> {
  const dir = absDir(target);
  if (!isDir(dir)) {
    console.error(`atlas: diretório não existe: ${target}`);
    return 2;
  }
  const plan = planHere(dir);
  if (plan.kind === "attach")
    return launch(dir, plan.runtime, { dryRun: opts.dryRun, attachTmux: plan.name });
  if (plan.kind === "launch") return launch(dir, plan.runtime, { dryRun: opts.dryRun });
  return tui(
    plan.kind === "running"
      ? { name: "running", target: { kind: "session", session: plan.session } }
      : { name: "runtime", dir, fresh: false },
    opts.dryRun,
  );
}

/** The TUI draws on the alternate screen (like vim/htop): the mouse wheel
 *  can no longer scroll the terminal back through stale frames, and the
 *  shell's screen comes back intact on exit — before any handoff to tmux.
 *  Incremental rendering rewrites only changed lines, so the footer sea can
 *  animate at ~9 fps without repainting the whole screen each frame. */
export const RENDER_OPTIONS = { alternateScreen: true, incrementalRendering: true } as const;

async function pick(start?: Screen, notice?: string): Promise<Choice | null> {
  let choice: Choice | null = null;
  const { waitUntilExit, unmount } = render(
    <App
      start={start}
      notice={notice}
      onDone={(c) => {
        choice = c;
        unmount();
      }}
    />,
    RENDER_OPTIONS,
  );
  await waitUntilExit();
  return choice;
}

export interface Args {
  dir?: string;
  runtime?: string;
  list: boolean;
  dryRun: boolean;
}

export function parseArgs(argv: string[]): Args {
  const out: Args = { list: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-l" || a === "--list") out.list = true;
    else if (a === "--print") out.dryRun = true;
    else if ((a === "-d" || a === "--dir") && i + 1 < argv.length) out.dir = argv[++i];
    else if ((a === "-r" || a === "--runtime") && i + 1 < argv.length) out.runtime = argv[++i];
    else if (a === "-h" || a === "--help") {
      console.log("Uso: atlas [DIR] [--dir DIR --runtime R] [--list] [--print]");
      console.log("Sem flags abre a TUI. Runtimes: codex, claude, muse, shell.");
      console.log("atlas DIR (ex.: atlas .) volta à sessão do diretório: entra na sessão tmux viva,");
      console.log("senão mostra o agente que já roda ali, senão abre o último runtime usado,");
      console.log("senão pergunta o runtime.");
      console.log("Sessões com agente rodando mostram um indicador animado e ficam no topo.");
      console.log("atlas cron agenda um prompt para um agente rodar sozinho (atlas cron --help).");
      process.exit(0);
    } else if (!a.startsWith("-") && out.dir === undefined) out.dir = a;
    else {
      console.error(
        a.startsWith("-") ? `atlas: flag desconhecida: ${a}` : `atlas: um diretório por vez: ${a}`,
      );
      process.exit(2);
    }
  }
  return out;
}

async function main(): Promise<number> {
  // a directory literally named "cron" is still reachable as ./cron
  if (process.argv[2] === "cron") return cronMain(process.argv.slice(3));
  const args = parseArgs(process.argv.slice(2));
  if (args.list) return listSessions();
  if (args.dir && args.runtime)
    return launch(args.dir, args.runtime, { dryRun: args.dryRun });
  if (args.dir) return here(args.dir, { dryRun: args.dryRun });
  if (args.runtime) {
    console.error("atlas: --runtime precisa de um diretório (atlas DIR --runtime R).");
    return 2;
  }
  return tui(undefined, args.dryRun);
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
