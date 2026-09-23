/** Scheduled agent tasks (`atlas cron`), in the shape of Claude Code's
 *  /schedule: a task is a prompt, a directory, a runtime and a schedule.
 *
 *  - `atlas cron add` only files a *pending* proposal; a keypress in Atlas
 *    (C → Agendadas → Enter) installs it. Agents never install on their own.
 *  - The user crontab is the only scheduler (no daemon). Each installed task
 *    is two lines Atlas owns: a `# atlas-cron:<id>` marker and the entry.
 *    Every other line of the crontab is left byte for byte.
 *  - Each fire runs `atlas cron run <id>`, which starts the runtime headless
 *    with explicit permission flags — never the permissive global defaults. */

import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { which } from "bun";

export type CronStatus = "pending" | "active" | "paused";

export interface CronJob {
  id: string;
  name: string;
  /** 5-field cron expression (host timezone). */
  when: string;
  runtime: string;
  dir: string;
  prompt: string;
  status: CronStatus;
  created: string;
  /** Set when installed: argv prefix that runs this Atlas (`<bun> <atlas.js>`
   *  or the compiled binary), resolved to absolute paths. */
  atlas?: string[];
  /** PATH captured when installed: cron's own PATH is /usr/bin:/bin. */
  path?: string;
}

export interface CronLast {
  at: string;
  exit: number;
  ms: number;
}

/** Runtimes a task can run on, with the headless flags each one gets. */
export const CRON_RUNTIMES = ["claude", "codex", "shell"] as const;

// ---------------------------------------------------------------- paths

export function cronDir(): string {
  return process.env.ATLAS_CRON_DIR ?? join(homedir(), ".local", "share", "atlas", "cron");
}

export function cronStateDir(): string {
  return process.env.ATLAS_CRON_STATE_DIR ?? join(homedir(), ".local", "state", "atlas", "cron");
}

export const logPath = (id: string) => join(cronStateDir(), `${id}.log`);
const lockPath = (id: string) => join(cronStateDir(), `${id}.lock`);
const lastPath = (id: string) => join(cronStateDir(), `${id}.last.json`);
const jobPath = (id: string) => join(cronDir(), `${id}.json`);

// ---------------------------------------------------------------- store

function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function loadJobs(): CronJob[] {
  let names: string[];
  try {
    names = readdirSync(cronDir()).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const jobs: CronJob[] = [];
  for (const n of names) {
    try {
      const j = JSON.parse(readFileSync(join(cronDir(), n), "utf-8")) as CronJob;
      if (j && typeof j.id === "string" && typeof j.when === "string") jobs.push(j);
    } catch {
      /* a half-written or foreign file: skip it */
    }
  }
  return jobs.sort((a, b) => a.created.localeCompare(b.created));
}

export function getJob(id: string): CronJob | null {
  try {
    return JSON.parse(readFileSync(jobPath(id), "utf-8")) as CronJob;
  } catch {
    return null;
  }
}

export function saveJob(job: CronJob): void {
  mkdirSync(cronDir(), { recursive: true });
  writeAtomic(jobPath(job.id), JSON.stringify(job, null, 2) + "\n");
}

function deleteJobFile(id: string): void {
  rmSync(jobPath(id), { force: true });
  rmSync(lastPath(id), { force: true });
}

export function lastRun(id: string): CronLast | null {
  try {
    return JSON.parse(readFileSync(lastPath(id), "utf-8")) as CronLast;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- schedule

const FIELDS: Array<[string, number, number]> = [
  ["minuto", 0, 59],
  ["hora", 0, 23],
  ["dia", 1, 31],
  ["mês", 1, 12],
  ["dia da semana", 0, 7],
];

const MACROS: Record<string, string> = {
  "@hourly": "0 * * * *",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@weekly": "0 0 * * 0",
  "@monthly": "0 0 1 * *",
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
};

const DOW: Record<string, number> = {
  dom: 0, domingo: 0, sun: 0, sunday: 0,
  seg: 1, segunda: 1, mon: 1, monday: 1,
  ter: 2, terça: 2, terca: 2, tue: 2, tuesday: 2,
  qua: 3, quarta: 3, wed: 3, wednesday: 3,
  qui: 4, quinta: 4, thu: 4, thursday: 4,
  sex: 5, sexta: 5, fri: 5, friday: 5,
  sáb: 6, sab: 6, sábado: 6, sabado: 6, sat: 6, saturday: 6,
};

function expandField(src: string, lo: number, hi: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of src.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    let a = lo;
    let b = hi;
    if (m[1] !== "*") {
      const [x, y] = m[1].split("-").map(Number);
      a = x;
      b = y ?? (m[2] ? hi : x);
    }
    const step = m[2] ? Number(m[2]) : 1;
    if (a < lo || b > hi || a > b || step < 1) return null;
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

/** A schedule in one of the accepted spellings, as a 5-field cron
 *  expression — or an error message (pt-BR) saying what is wrong. */
export function parseWhen(input: string): { expr: string } | { error: string } {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (MACROS[s]) return { expr: MACROS[s] };
  const time = String.raw`(\d{1,2})(?:[:h](\d{2}))?h?`;
  const hm = (h: string, m?: string): string | null => {
    const H = Number(h);
    const M = m ? Number(m) : 0;
    return H <= 23 && M <= 59 ? `${M} ${H}` : null;
  };
  let m = /^(?:every|a cada) (\d+) ?(m|min|mins|minutos?|h|horas?)$/.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (m[2].startsWith("h")) {
      if (n < 1 || n > 23) return { error: "a cada N horas: N de 1 a 23." };
      return { expr: n === 1 ? "0 * * * *" : `0 */${n} * * *` };
    }
    if (n < 1 || n > 59) return { error: "a cada N minutos: N de 1 a 59." };
    return { expr: n === 1 ? "* * * * *" : `*/${n} * * * *` };
  }
  m = new RegExp(`^(?:daily|todo dia|todos os dias|diariamente)(?: (?:at|às|as))? ${time}$`).exec(s);
  if (m) {
    const t = hm(m[1], m[2]);
    return t ? { expr: `${t} * * *` } : { error: `horário inválido: ${input}` };
  }
  m = new RegExp(`^(?:weekdays|dias úteis|dias uteis)(?: (?:at|às|as))? ${time}$`).exec(s);
  if (m) {
    const t = hm(m[1], m[2]);
    return t ? { expr: `${t} * * 1-5` } : { error: `horário inválido: ${input}` };
  }
  m = new RegExp(`^(?:every|toda|todo) ([a-zçáé]+)(?: (?:at|às|as))? ${time}$`).exec(s);
  if (m && DOW[m[1]] !== undefined) {
    const t = hm(m[2], m[3]);
    return t ? { expr: `${t} * * ${DOW[m[1]]}` } : { error: `horário inválido: ${input}` };
  }
  const parts = s.split(" ");
  if (parts.length === 5) {
    for (let i = 0; i < 5; i++) {
      const [label, lo, hi] = FIELDS[i];
      if (!expandField(parts[i], lo, hi)) return { error: `campo ${label} inválido: ${parts[i]}` };
    }
    return { expr: parts.join(" ") };
  }
  return {
    error:
      `não entendi o horário "${input}". Use uma expressão cron ("0 9 * * 1-5") ou ` +
      `"a cada 30 min", "todo dia 09:00", "dias úteis 18:30", "toda segunda 08:00", "@daily".`,
  };
}

interface Spec {
  min: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  mon: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

function spec(expr: string): Spec | null {
  const p = expr.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const sets = p.map((f, i) => expandField(f, FIELDS[i][1], FIELDS[i][2]));
  if (sets.some((x) => !x)) return null;
  const dow = new Set([...sets[4]!].map((d) => d % 7));
  return {
    min: sets[0]!,
    hour: sets[1]!,
    dom: sets[2]!,
    mon: sets[3]!,
    dow,
    domAny: p[2].startsWith("*"),
    dowAny: p[4].startsWith("*"),
  };
}

/** Next firing strictly after `from` (local time), or null within a year. */
export function nextRun(expr: string, from: Date = new Date()): Date | null {
  const s = spec(expr);
  if (!s) return null;
  const t = new Date(from.getTime());
  t.setSeconds(0, 0);
  t.setMinutes(t.getMinutes() + 1);
  const limit = from.getTime() + 366 * 24 * 3600 * 1000;
  while (t.getTime() <= limit) {
    if (!s.mon.has(t.getMonth() + 1)) {
      t.setMonth(t.getMonth() + 1, 1);
      t.setHours(0, 0);
      continue;
    }
    // Vixie cron: with both day fields restricted, either one matches
    const domOk = s.dom.has(t.getDate());
    const dowOk = s.dow.has(t.getDay());
    const dayOk = s.domAny && s.dowAny ? true : s.domAny ? dowOk : s.dowAny ? domOk : domOk || dowOk;
    if (!dayOk) {
      t.setDate(t.getDate() + 1);
      t.setHours(0, 0);
      continue;
    }
    if (!s.hour.has(t.getHours())) {
      t.setHours(t.getHours() + 1, 0);
      continue;
    }
    if (!s.min.has(t.getMinutes())) {
      t.setMinutes(t.getMinutes() + 1);
      continue;
    }
    return t;
  }
  return null;
}

const DOW_NAME = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const pad = (n: number) => String(n).padStart(2, "0");

/** The schedule in plain pt-BR, falling back to the raw expression. */
export function humanize(expr: string): string {
  const [mi, h, dom, mon, dow] = expr.trim().split(/\s+/);
  const num = (x: string) => /^\d+$/.test(x);
  if (dom === "*" && mon === "*" && dow === "*") {
    if (mi === "*" && h === "*") return "a cada minuto";
    let m = /^\*\/(\d+)$/.exec(mi);
    if (m && h === "*") return `a cada ${m[1]} min`;
    if (num(mi) && h === "*") return mi === "0" ? "de hora em hora" : `de hora em hora, no minuto ${mi}`;
    m = /^\*\/(\d+)$/.exec(h);
    if (num(mi) && m) return `a cada ${m[1]} h`;
  }
  if (!num(mi) || !num(h)) return `cron ${expr}`;
  const at = `às ${pad(Number(h))}:${pad(Number(mi))}`;
  if (mon !== "*") return `cron ${expr}`;
  if (dom === "*" && dow === "*") return `todo dia ${at}`;
  if (dom === "*" && dow === "1-5") return `dias úteis ${at}`;
  if (dom === "*" && /^[0-7]$/.test(dow)) {
    const d = Number(dow) % 7;
    return `${d === 0 || d === 6 ? "todo" : "toda"} ${DOW_NAME[d]} ${at}`;
  }
  if (num(dom) && dow === "*") return `todo dia ${dom} do mês ${at}`;
  return `cron ${expr}`;
}

/** "hoje 09:00", "amanhã 18:30", "seg 23/09 08:00". */
export function whenLabel(d: Date, now: Date = new Date()): string {
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86400000);
  if (diff === 0) return `hoje ${hm}`;
  if (diff === 1) return `amanhã ${hm}`;
  return `${DOW_NAME[d.getDay()].slice(0, 3)} ${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hm}`;
}

// ---------------------------------------------------------------- proposals

function slug(text: string): string {
  const s = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s.split("-").slice(0, 4).join("-").slice(0, 32) || "tarefa";
}

export interface ProposeInput {
  when: string;
  runtime: string;
  dir: string;
  prompt: string;
  name?: string;
}

/** File a pending task. The same task proposed twice returns the first one. */
export function propose(input: ProposeInput): { job: CronJob; existed: boolean } | { error: string } {
  const w = parseWhen(input.when);
  if ("error" in w) return w;
  if (!(CRON_RUNTIMES as readonly string[]).includes(input.runtime))
    return { error: `runtime não suportado para agendar: ${input.runtime} (use ${CRON_RUNTIMES.join(", ")}).` };
  if (!input.prompt.trim()) return { error: "o prompt está vazio." };
  const same = loadJobs().find(
    (j) =>
      j.when === w.expr && j.runtime === input.runtime && j.dir === input.dir && j.prompt === input.prompt,
  );
  if (same) return { job: same, existed: true };
  const name = slug(input.name || input.prompt);
  const job: CronJob = {
    id: `${name}-${crypto.randomUUID().slice(0, 4)}`,
    name,
    when: w.expr,
    runtime: input.runtime,
    dir: input.dir,
    prompt: input.prompt,
    status: "pending",
    created: new Date().toISOString(),
  };
  saveJob(job);
  return { job, existed: false };
}

// ---------------------------------------------------------------- executor

/** The headless argv a task runs, with explicit permissions: the global
 *  configs of the agents are interactive and often permissive, and a
 *  scheduled run nobody watches must not inherit them. */
export function execArgv(job: Pick<CronJob, "runtime" | "prompt">, resolve = whichIn): string[] {
  if (job.runtime === "shell") return ["/bin/sh", "-c", job.prompt];
  const bin = resolve(job.runtime) ?? job.runtime;
  if (job.runtime === "claude")
    // edits inside the directory are allowed; anything else not already on
    // the user's allow list is denied (nobody is there to approve it)
    return [bin, "-p", "--permission-mode", "acceptEdits", "--", job.prompt];
  if (job.runtime === "codex")
    return [bin, "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--", job.prompt];
  throw new Error(`runtime não suportado: ${job.runtime}`);
}

function whichIn(name: string): string | null {
  return which(name);
}

/** argv that runs this very Atlas from cron: the compiled binary alone, or
 *  bun plus the script (npm installs start with `#!/usr/bin/env bun`, and
 *  cron's PATH rarely has bun). */
export function selfArgv(): string[] {
  const main = Bun.main;
  if (main.startsWith("/$bunfs/") || main.startsWith("B:/~BUN/")) return [process.execPath];
  return [process.execPath, main];
}

const shq = (s: string) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);

/** The crontab entry for an installed task. */
export function crontabLine(job: CronJob): string {
  const atlas = job.atlas ?? selfArgv();
  const flock = existsSync("/usr/bin/flock") ? ["/usr/bin/flock", "-n", "-E", "0", lockPath(job.id)] : [];
  const cmd = [...flock, ...atlas, "cron", "run", job.id].map(shq).join(" ");
  // cron turns an unescaped % into a newline
  return `${job.when} ${cmd.replace(/%/g, "\\%")} >> ${shq(logPath(job.id)).replace(/%/g, "\\%")} 2>&1`;
}

export const MARK = "# atlas-cron:";

/** `current` with every Atlas block replaced by one per active job; lines
 *  Atlas did not write are kept as they are. */
export function renderCrontab(current: string, jobs: CronJob[]): string {
  const lines = current.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(MARK)) {
      const id = lines[i].slice(MARK.length).split(/\s/)[0];
      // only swallow the entry below when it is ours
      if (i + 1 < lines.length && lines[i + 1].includes(` cron run ${id} `)) i++;
      continue;
    }
    kept.push(lines[i]);
  }
  for (const j of jobs.filter((x) => x.status === "active")) {
    kept.push(`${MARK}${j.id} ${j.name}`, crontabLine(j));
  }
  return kept.length ? kept.join("\n") + "\n" : "";
}

export function readCrontab(): string {
  const file = process.env.ATLAS_CRONTAB_FILE;
  if (file) return existsSync(file) ? readFileSync(file, "utf-8") : "";
  const r = Bun.spawnSync(["crontab", "-l"], { stderr: "pipe" });
  if (r.exitCode === 0) return r.stdout.toString();
  const err = r.stderr.toString();
  if (/no crontab/i.test(err)) return "";
  throw new Error(`crontab -l falhou: ${err.trim() || `exit ${r.exitCode}`}`);
}

function writeCrontab(text: string): void {
  const file = process.env.ATLAS_CRONTAB_FILE;
  if (file) return writeAtomic(file, text);
  const r = Bun.spawnSync(["crontab", "-"], { stdin: new TextEncoder().encode(text), stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`crontab recusou a escrita: ${r.stderr.toString().trim()}`);
}

/** Make the crontab match the store. Re-reads right before writing and
 *  gives up if someone else changed it in between. */
export function syncCrontab(): void {
  const before = readCrontab();
  const next = renderCrontab(before, loadJobs());
  if (next === before) return;
  if (readCrontab() !== before) throw new Error("o crontab mudou durante a escrita; tente de novo.");
  writeCrontab(next);
}

/** Install a pending (or resume a paused) task. */
export function activate(id: string): CronJob {
  const job = getJob(id);
  if (!job) throw new Error(`tarefa não encontrada: ${id}`);
  const prev = { ...job };
  job.status = "active";
  job.atlas = selfArgv();
  job.path = process.env.PATH;
  saveJob(job);
  try {
    syncCrontab();
  } catch (err) {
    saveJob(prev);
    throw err;
  }
  return job;
}

export function pause(id: string): CronJob {
  const job = getJob(id);
  if (!job) throw new Error(`tarefa não encontrada: ${id}`);
  const prev = { ...job };
  job.status = "paused";
  saveJob(job);
  try {
    syncCrontab();
  } catch (err) {
    saveJob(prev);
    throw err;
  }
  return job;
}

export function removeJob(id: string): void {
  const job = getJob(id);
  if (!job) throw new Error(`tarefa não encontrada: ${id}`);
  deleteJobFile(id);
  try {
    syncCrontab();
  } catch (err) {
    saveJob(job);
    throw err;
  }
}

/** Run a task now, in the foreground (what the crontab entry calls). */
export function runJob(job: CronJob): number {
  const argv = execArgv(job);
  const started = Date.now();
  console.log(`\n=== ${new Date().toISOString()} · ${job.id} · ${job.runtime} · ${job.dir}`);
  let exit = 127;
  try {
    exit = Bun.spawnSync(argv, {
      cwd: job.dir,
      env: { ...process.env, PATH: job.path ?? process.env.PATH ?? "/usr/bin:/bin" },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    }).exitCode;
  } catch (err) {
    console.log(`atlas cron: não consegui iniciar ${argv[0]}: ${err instanceof Error ? err.message : err}`);
  }
  console.log(`=== fim · exit ${exit} · ${Math.round((Date.now() - started) / 1000)} s`);
  mkdirSync(cronStateDir(), { recursive: true });
  writeAtomic(lastPath(job.id), JSON.stringify({ at: new Date().toISOString(), exit, ms: Date.now() - started }));
  return exit;
}

/** Run a task in the background right now (the "R" key), output to its log. */
export function runDetached(job: CronJob): void {
  mkdirSync(cronStateDir(), { recursive: true });
  const fd = openSync(logPath(job.id), "a");
  try {
    const p = Bun.spawn([...(job.atlas ?? selfArgv()), "cron", "run", job.id], {
      stdin: "ignore",
      stdout: fd,
      stderr: fd,
      detached: true,
    });
    p.unref();
  } finally {
    closeSync(fd);
  }
}

export function tailLog(id: string, lines = 40): string {
  try {
    return readFileSync(logPath(id), "utf-8").split("\n").slice(-lines - 1).join("\n");
  } catch {
    return "";
  }
}
