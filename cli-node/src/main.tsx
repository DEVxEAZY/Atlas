/** Atlas launcher: resolve (directory, runtime) then hand the terminal to it. */

import React from "react";
import { existsSync, writeSync } from "node:fs";
import { render } from "ink";
import App, { type Choice } from "./App";
import { load, record } from "./history";
import { buildArgv } from "./runtimes";
import {
  ensureMouse,
  execArgv,
  hasSession,
  liveEnv,
  planLaunch,
  tmuxBin,
  type LaunchPlan,
} from "./tmux";
import { ago, isDir, shorten } from "./util";

export interface LaunchOpts {
  dryRun?: boolean;
  resume?: string;
  fresh?: boolean;
  attachTmux?: string;
}

/** Hand the terminal to a tmux session: nested Atlas switches the current
 *  client (returns fast); otherwise this process BECOMES the attach-client
 *  via exec — same PID, group and terminal, so the kernel never sees an
 *  orphaned group to SIGHUP. Only returns when exec itself fails. */
function handoff(plan: LaunchPlan): number {
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
    return 0;
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

export async function launch(
  directory: string,
  runtime: string,
  opts: LaunchOpts = {},
): Promise<number> {
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
    return handoff({ mode: "tmux-attach", name, createArgv: null, attachArgv, directArgv: null });
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
  return handoff(plan);
}

export function listSessions(): number {
  const sessions = load();
  if (sessions.length === 0) {
    console.log("Nenhuma sessão registrada.");
    return 0;
  }
  for (const s of sessions) {
    const missing = existsSync(s.dir) ? "" : " ⚠";
    console.log(`${s.runtime.padEnd(7)} ${shorten(s.dir)}  · ${ago(s.last_used)} · ${s.uses}x${missing}`);
  }
  return 0;
}

async function pick(): Promise<Choice | null> {
  let choice: Choice | null = null;
  const { waitUntilExit, unmount } = render(
    <App
      onDone={(c) => {
        choice = c;
        unmount();
      }}
    />,
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
      console.log("Uso: atlas [--dir DIR --runtime R] [--list] [--print]");
      console.log("Sem flags abre a TUI. Runtimes: codex, claude, muse, shell.");
      console.log("Sessões com agente rodando mostram um indicador animado e ficam no topo.");
      process.exit(0);
    } else {
      console.error(`atlas: flag desconhecida: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) return listSessions();
  if (args.dir && args.runtime)
    return launch(args.dir, args.runtime, { dryRun: args.dryRun });
  if (args.dir || args.runtime) {
    console.error("atlas: use --dir e --runtime juntos, ou nenhum (abre a TUI).");
    return 2;
  }
  const choice = await pick();
  if (!choice) return 0;
  return launch(choice.dir, choice.runtime, {
    dryRun: args.dryRun,
    resume: choice.resume,
    fresh: choice.fresh,
    attachTmux: choice.attachTmux,
  });
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
