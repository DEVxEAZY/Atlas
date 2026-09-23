/** `atlas cron …`: the command-line side of scheduled tasks. Agents use
 *  `add` (a pending proposal) and `list`; installing is a keypress in Atlas. */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import SKILL from "../../skills/atlas-cron/SKILL.md" with { type: "text" };
import {
  CRON_RUNTIMES,
  getJob,
  humanize,
  lastRun,
  loadJobs,
  nextRun,
  propose,
  removeJob,
  runJob,
  tailLog,
  whenLabel,
  type CronJob,
} from "./cron";
import { absDir } from "./main";
import { shorten } from "./util";

export const CRON_HELP = `Uso:
  atlas cron add --when QUANDO [--dir DIR] [--runtime R] [--name NOME] "PROMPT"
  atlas cron list [--json]
  atlas cron log ID
  atlas cron rm ID
  atlas cron skill [--install]

Uma tarefa agendada é um prompt que um agente roda num diretório, num horário.
'add' só cria uma proposta: abra o Atlas, aperte C e Enter na tarefa para instalar.

QUANDO: "a cada 30 min", "a cada 2 h", "todo dia 09:00", "dias úteis 18:30",
        "toda segunda 08:00", "@daily" ou uma expressão cron ("0 9 * * 1-5").
Runtimes: ${CRON_RUNTIMES.join(", ")} (padrão claude; em shell o prompt é um comando).`;

export const STATUS_LABEL: Record<CronJob["status"], string> = {
  pending: "pendente",
  active: "ativa",
  paused: "pausada",
};

function describe(job: CronJob): string {
  const next = job.status === "active" ? nextRun(job.when) : null;
  return `${humanize(job.when)}${next ? ` · próxima ${whenLabel(next)}` : ""}`;
}

/** Skill targets: Claude Code always, Codex when it is set up here. */
function skillDirs(): string[] {
  const home = homedir();
  const out = [join(home, ".claude", "skills", "atlas-cron")];
  if (existsSync(join(home, ".codex"))) out.push(join(home, ".codex", "skills", "atlas-cron"));
  return out;
}

/** Write the atlas-cron skill where the agents look for it; returns the files. */
export function installSkill(): string[] {
  return skillDirs().map((dir) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), SKILL);
    return join(dir, "SKILL.md");
  });
}

export function cronMain(argv: string[]): number {
  const [cmd, ...rest] = argv;
  const flags: Record<string, string | true> = {};
  const pos: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--") {
      pos.push(...rest.slice(i + 1));
      break;
    }
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(a);
    if (!m) pos.push(a);
    else if (m[2] !== undefined) flags[m[1]] = m[2];
    else if (["json", "install"].includes(m[1])) flags[m[1]] = true;
    else if (i + 1 < rest.length) flags[m[1]] = rest[++i];
    else {
      console.error(`atlas cron: --${m[1]} precisa de um valor.`);
      return 2;
    }
  }
  const str = (k: string) => (typeof flags[k] === "string" ? (flags[k] as string) : undefined);

  if (!cmd || cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(CRON_HELP);
    return 0;
  }

  if (cmd === "add") {
    const when = str("when");
    const prompt = pos.join(" ").trim();
    if (!when || !prompt) {
      console.error('atlas cron: add precisa de --when e do prompt. Ex.: atlas cron add --when "todo dia 09:00" "…"');
      return 2;
    }
    const r = propose({
      when,
      prompt,
      runtime: str("runtime") ?? "claude",
      dir: absDir(str("dir") ?? "."),
      name: str("name"),
    });
    if ("error" in r) {
      console.error(`atlas cron: ${r.error}`);
      return 2;
    }
    const { job, existed } = r;
    if (flags.json) {
      console.log(JSON.stringify({ ...job, human: humanize(job.when), existed }));
      return 0;
    }
    console.log(`${existed ? "Já proposta" : "Proposta criada"}: ${job.id} (${STATUS_LABEL[job.status]})`);
    console.log(`  quando  ${humanize(job.when)}  [${job.when}]`);
    const next = nextRun(job.when);
    if (next) console.log(`  1ª vez  ${whenLabel(next)} (depois de instalada)`);
    console.log(`  onde    ${shorten(job.dir)} · ${job.runtime}`);
    if (job.status === "pending") console.log("Para instalar: abra o Atlas, aperte C e Enter na tarefa.");
    return 0;
  }

  if (cmd === "list" || cmd === "ls") {
    const jobs = loadJobs();
    if (flags.json) {
      console.log(
        JSON.stringify(
          jobs.map((j) => ({ ...j, human: humanize(j.when), next: nextRun(j.when)?.toISOString() ?? null, last: lastRun(j.id) })),
          null,
          2,
        ),
      );
      return 0;
    }
    if (jobs.length === 0) {
      console.log("Nenhuma tarefa agendada.");
      return 0;
    }
    for (const j of jobs) {
      const last = lastRun(j.id);
      console.log(`${j.id}  ${STATUS_LABEL[j.status]}  ${describe(j)}`);
      console.log(`  ${j.runtime} · ${shorten(j.dir)}${last ? ` · última: exit ${last.exit}` : ""}`);
      console.log(`  ${j.prompt.replace(/\s+/g, " ").slice(0, 100)}`);
    }
    return 0;
  }

  if (cmd === "log" || cmd === "rm" || cmd === "run") {
    const id = pos[0];
    const job = id ? getJob(id) : null;
    if (!job) {
      console.error(`atlas cron: tarefa não encontrada: ${id ?? "(sem id)"}`);
      return 3;
    }
    if (cmd === "log") {
      console.log(tailLog(job.id) || "(sem execuções ainda)");
      return 0;
    }
    if (cmd === "rm") {
      removeJob(job.id);
      console.log(`Removida: ${job.id}`);
      return 0;
    }
    // run: what the crontab entry calls; only installed tasks run
    if (job.status !== "active") {
      console.error(`atlas cron: ${job.id} está ${STATUS_LABEL[job.status]} — instale no Atlas (C) antes.`);
      return 9;
    }
    return runJob(job);
  }

  if (cmd === "skill") {
    if (!flags.install) {
      console.log(SKILL);
      return 0;
    }
    for (const file of installSkill()) console.log(`Skill instalada: ${shorten(file)}`);
    return 0;
  }

  console.error(`atlas cron: comando desconhecido: ${cmd}\n\n${CRON_HELP}`);
  return 2;
}
