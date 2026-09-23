import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  activate,
  crontabLine,
  cronDir,
  execArgv,
  getJob,
  humanize,
  loadJobs,
  nextRun,
  parseWhen,
  pause,
  propose,
  readCrontab,
  removeJob,
  renderCrontab,
  runJob,
  lastRun,
  type CronJob,
} from "../src/cron";
import { cronMain } from "../src/cronCli";
import { cronRows } from "../src/screens/Crons";

const tab = () => process.env.ATLAS_CRONTAB_FILE!;

afterEach(() => {
  rmSync(cronDir(), { recursive: true, force: true });
  rmSync(tab(), { force: true });
});

const expr = (s: string) => {
  const r = parseWhen(s);
  if ("error" in r) throw new Error(r.error);
  return r.expr;
};

describe("parseWhen", () => {
  test("plain phrases become cron expressions", () => {
    expect(expr("a cada 30 min")).toBe("*/30 * * * *");
    expect(expr("every 15m")).toBe("*/15 * * * *");
    expect(expr("a cada 2 h")).toBe("0 */2 * * *");
    expect(expr("a cada 1 hora")).toBe("0 * * * *");
    expect(expr("todo dia 09:00")).toBe("0 9 * * *");
    expect(expr("Todo dia às 9h")).toBe("0 9 * * *");
    expect(expr("daily 7:05")).toBe("5 7 * * *");
    expect(expr("dias úteis 18:30")).toBe("30 18 * * 1-5");
    expect(expr("toda segunda 08:00")).toBe("0 8 * * 1");
    expect(expr("todo domingo 10h")).toBe("0 10 * * 0");
    expect(expr("@daily")).toBe("0 0 * * *");
    expect(expr("0 9 1 * *")).toBe("0 9 1 * *");
    expect(expr("*/5 8-18 * * 1,3,5")).toBe("*/5 8-18 * * 1,3,5");
  });

  test("bad input says what is wrong", () => {
    for (const bad of ["toda semana", "de manhã", "61 * * * *", "0 24 * * *", "* * * *", "todo dia 25:00", "a cada 90 min"])
      expect("error" in parseWhen(bad)).toBe(true);
    const r = parseWhen("0 9 * 13 *");
    expect("error" in r && r.error).toContain("mês");
  });
});

describe("humanize and nextRun", () => {
  test("common shapes read as pt-BR", () => {
    expect(humanize("*/30 * * * *")).toBe("a cada 30 min");
    expect(humanize("0 */2 * * *")).toBe("a cada 2 h");
    expect(humanize("0 * * * *")).toBe("de hora em hora");
    expect(humanize("0 9 * * *")).toBe("todo dia às 09:00");
    expect(humanize("30 18 * * 1-5")).toBe("dias úteis às 18:30");
    expect(humanize("0 8 * * 1")).toBe("toda segunda às 08:00");
    expect(humanize("0 10 * * 0")).toBe("todo domingo às 10:00");
    expect(humanize("0 9 1 * *")).toBe("todo dia 1 do mês às 09:00");
    expect(humanize("0 9 1 1 *")).toBe("cron 0 9 1 1 *");
  });

  test("next firing, strictly after now", () => {
    const from = new Date(2026, 8, 23, 9, 0, 30); // Wed 23 Sep 2026 09:00:30
    expect(nextRun("0 9 * * *", from)).toEqual(new Date(2026, 8, 24, 9, 0));
    expect(nextRun("*/15 * * * *", from)).toEqual(new Date(2026, 8, 23, 9, 15));
    expect(nextRun("30 18 * * 1-5", new Date(2026, 8, 25, 19, 0))).toEqual(new Date(2026, 8, 28, 18, 30)); // Fri → Mon
    expect(nextRun("0 9 1 * *", from)).toEqual(new Date(2026, 9, 1, 9, 0));
    // both day fields restricted: either matches (Vixie cron)
    expect(nextRun("0 0 1 * 5", from)).toEqual(new Date(2026, 8, 25, 0, 0));
    expect(nextRun("0 0 30 2 *", from)).toBeNull();
  });
});

describe("proposals and the crontab", () => {
  const add = (over: Partial<Parameters<typeof propose>[0]> = {}) => {
    const r = propose({ when: "todo dia 09:00", runtime: "claude", dir: "/tmp", prompt: "revise os PRs", ...over });
    if ("error" in r) throw new Error(r.error);
    return r;
  };

  test("add files a pending task and never touches the crontab", () => {
    const { job } = add();
    expect(job.status).toBe("pending");
    expect(job.id).toMatch(/^revise-os-prs-[0-9a-f]{4}$/);
    expect(readCrontab()).toBe("");
    expect(add().existed).toBe(true); // proposing twice is one task
    expect(loadJobs()).toHaveLength(1);
  });

  test("unsupported runtime or empty prompt is refused", () => {
    expect("error" in propose({ when: "@daily", runtime: "muse", dir: "/tmp", prompt: "x" })).toBe(true);
    expect("error" in propose({ when: "@daily", runtime: "claude", dir: "/tmp", prompt: "  " })).toBe(true);
  });

  test("activate installs, pause and remove take it out, other lines stay", () => {
    writeFileSync(tab(), "MAILTO=\"\"\n0 0 */3 * * /home/me/sync.sh\n");
    const { job } = add();
    activate(job.id);
    let text = readFileSync(tab(), "utf-8");
    expect(text.startsWith('MAILTO=""\n0 0 */3 * * /home/me/sync.sh\n')).toBe(true);
    expect(text).toContain(`# atlas-cron:${job.id} `);
    expect(text).toContain(`0 9 * * * `);
    expect(text).toContain(` cron run ${job.id} >> `);
    expect(getJob(job.id)!.path).toBe(process.env.PATH);

    activate(job.id); // idempotent: still one entry
    expect(readFileSync(tab(), "utf-8").split(`cron run ${job.id} `)).toHaveLength(2);

    pause(job.id);
    text = readFileSync(tab(), "utf-8");
    expect(text).toBe('MAILTO=""\n0 0 */3 * * /home/me/sync.sh\n');
    expect(getJob(job.id)!.status).toBe("paused");

    activate(job.id);
    removeJob(job.id);
    expect(readFileSync(tab(), "utf-8")).toBe('MAILTO=""\n0 0 */3 * * /home/me/sync.sh\n');
    expect(getJob(job.id)).toBeNull();
  });

  test("a marker never swallows a line Atlas did not write", () => {
    const cur = "# atlas-cron:ghost-1234 old\n5 5 * * * /home/me/mine.sh\n";
    expect(renderCrontab(cur, [])).toBe("5 5 * * * /home/me/mine.sh\n");
  });

  test("the entry is locked, logged, and % is escaped", () => {
    const job: CronJob = {
      id: "t-1",
      name: "t",
      when: "0 9 * * *",
      runtime: "shell",
      dir: "/tmp",
      prompt: "x",
      status: "active",
      created: "",
      atlas: ["/opt/bun", "/opt/100%/atlas.js"],
    };
    const line = crontabLine(job);
    expect(line.startsWith("0 9 * * * /usr/bin/flock -n -E 0 ")).toBe(true);
    expect(line).toContain(" /opt/bun /opt/100\\%/atlas.js cron run t-1 >> ");
    expect(line.endsWith(".log 2>&1")).toBe(true);
  });
});

describe("execution", () => {
  test("headless argv with explicit permissions per runtime", () => {
    const r = () => "/bin/agent";
    expect(execArgv({ runtime: "claude", prompt: "-x oi" }, r)).toEqual([
      "/bin/agent", "-p", "--permission-mode", "acceptEdits", "--", "-x oi",
    ]);
    expect(execArgv({ runtime: "codex", prompt: "oi" }, r)).toEqual([
      "/bin/agent", "exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--", "oi",
    ]);
    expect(execArgv({ runtime: "shell", prompt: "echo oi" }, r)).toEqual(["/bin/sh", "-c", "echo oi"]);
  });

  test("run executes in the directory and records the result", () => {
    const r = propose({ when: "@hourly", runtime: "shell", dir: "/tmp", prompt: "test \"$(pwd)\" = /tmp && exit 3" });
    if ("error" in r) throw new Error(r.error);
    const job = activate(r.job.id);
    expect(runJob(job)).toBe(3);
    expect(lastRun(job.id)!.exit).toBe(3);
  });

  test("the CLI refuses to run a task that was never installed", () => {
    const r = propose({ when: "@hourly", runtime: "shell", dir: "/tmp", prompt: "true" });
    if ("error" in r) throw new Error(r.error);
    expect(cronMain(["run", r.job.id])).toBe(9);
    expect(cronMain(["run", "nope"])).toBe(3);
    expect(cronMain(["add", "--when", "toda semana", "x"])).toBe(2);
  });
});

test("the screen groups pending first, then active, then paused", () => {
  const mk = (id: string, status: CronJob["status"]): CronJob => ({
    id, name: id, when: "@daily", runtime: "claude", dir: "/", prompt: "p", status, created: id,
  });
  const rows = cronRows([mk("a", "active"), mk("b", "paused"), mk("c", "pending")]);
  expect(rows.map((r) => (r.t === "header" ? r.label : r.job.id))).toEqual([
    "Aguardando confirmação · 1", "c", "Ativas · 1", "a", "Pausadas · 1", "b",
  ]);
});
