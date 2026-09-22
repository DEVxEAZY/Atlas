/** Moving an external agent session under tmux (shared by Hub and Running):
 *  its pid(s) must die first — a duplicate resume corrupts the session —
 *  then the same conversation relaunches detached. Everything that could
 *  make the relaunch fail is checked before anything is stopped. */

import { homedir } from "node:os";
import type { Choice } from "./App";
import type { Session } from "./history";
import type { NativeSession } from "./native/index";
import { resumeIdFromArgv, scanAgents, terminatePids } from "./process";
import { detachedPreflight } from "./tmux";

/** What a migration kills and relaunches, or why it is refused. */
export type Migration =
  | { pids: number[]; choice: Required<Pick<Choice, "dir" | "runtime" | "resume">> }
  | { refuse: string };

type Target = Required<Pick<Choice, "dir" | "runtime" | "resume">>;

function preflighted(pids: number[], choice: Target): Migration {
  const why = detachedPreflight(choice.dir, choice.runtime);
  return why ? { refuse: why } : { pids, choice };
}

/** A history session migrates with its live pids only when every one of
 *  them holds the same resume id: a pid without one (or a second id) would
 *  be stopped and never resumed, so anything else refuses with guidance. */
export function sessionMigration(
  s: Pick<Session, "dir" | "runtime">,
  idleRefusal = "não está rodando — Enter abre a sessão.",
): Migration {
  if (s.runtime === "shell") {
    return { refuse: "shell não tem conversa para retomar — abra uma nova sessão no tmux com n no Hub." };
  }
  const agents = scanAgents([s.runtime]).filter((a) => a.dir === s.dir);
  if (agents.length === 0) return { refuse: idleRefusal };
  const ids = new Set(agents.map((a) => resumeIdFromArgv(a.argv)));
  if (ids.has(null)) {
    return {
      refuse:
        agents.length === 1
          ? "esse processo não tem resume id — encerre com X e reabra a conversa pelo Hub para ir ao tmux."
          : "um processo desse grupo não tem resume id — encerre com X e reabra a conversa pelo Hub para ir ao tmux.",
    };
  }
  if (ids.size > 1) return { refuse: "vários resumes nesse grupo — migre cada conversa pela seção Conversas." };
  const [id] = ids as Set<string>;
  return preflighted(agents.map((a) => a.pid), { dir: s.dir, runtime: s.runtime, resume: id });
}

/** A conversation always migrates by its own id. A live one relaunches in
 *  the directory its process runs in (known to exist; the transcript's
 *  recorded cwd may be gone); an idle one just opens detached in tmux. */
export function convoMigration(c: NativeSession): Migration {
  const agents = scanAgents().filter((a) => resumeIdFromArgv(a.argv) === c.id);
  const dir = agents[0]?.dir ?? c.dir ?? homedir();
  return preflighted(agents.map((a) => a.pid), { dir, runtime: c.harness, resume: c.id });
}

export interface MigrateResult {
  ok: boolean;
  name?: string;
  error?: string;
}

/** Kill, verify, relaunch detached. Aborts (relaunching nothing) when any
 *  pid survives termination. */
export async function runMigration(
  m: Extract<Migration, { pids: number[] }>,
  relaunch: (c: Choice) => MigrateResult,
  onStatus: (msg: string) => void = () => {},
): Promise<MigrateResult> {
  if (m.pids.length > 0) {
    onStatus("encerrando aqui para migrar…");
    const result = await terminatePids(m.pids);
    if (result.alive.length > 0) {
      return { ok: false, error: `não consegui encerrar o PID ${result.alive.join(", ")} — migração abortada.` };
    }
  }
  const r = relaunch(m.choice);
  return r.ok ? r : { ok: false, error: r.error ?? "não consegui criar a sessão tmux." };
}
