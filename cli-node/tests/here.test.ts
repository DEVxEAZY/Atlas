import { describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RENDER_OPTIONS, backNotice, here, launch, parseArgs, planHere } from "../src/main.tsx";
import type { Session } from "../src/history";
import { tmuxBaseName, type TmuxSession } from "../src/tmux";
import { fakeCalls, setupFakeTmux } from "./tmux-fake";

const DIR = "/work/app";

function live(...names: string[]): Map<string, TmuxSession> {
  return new Map(names.map((name) => [name, { name, attached: false, created: 0 }]));
}

function hist(...runtimes: string[]): Session[] {
  // recency order, newest first (as history.load returns)
  return runtimes.map((runtime, i) => ({
    dir: DIR,
    runtime,
    last_used: new Date(Date.UTC(2026, 8, 22, 12 - i)).toISOString(),
    uses: 1,
  }));
}

describe("atlas DIR", () => {
  test("parseArgs takes one positional directory", () => {
    expect(parseArgs(["."])).toMatchObject({ dir: "." });
    expect(parseArgs(["~/x", "--print"])).toMatchObject({ dir: "~/x", dryRun: true });
    expect(parseArgs([".", "-r", "claude"])).toMatchObject({ dir: ".", runtime: "claude" });
  });

  test("a live tmux session for the last runtime wins", () => {
    const plan = planHere(DIR, live(tmuxBaseName(DIR, "codex"), tmuxBaseName(DIR, "claude")), hist("claude", "codex"));
    expect(plan).toEqual({ kind: "attach", name: tmuxBaseName(DIR, "claude"), runtime: "claude" });
  });

  test("resumed and duplicate sessions still count as the directory's session", () => {
    const resumed = `${tmuxBaseName(DIR, "claude")}-r0199aaaa0000`;
    expect(planHere(DIR, live(resumed), hist("claude"))).toMatchObject({ kind: "attach", name: resumed });
    const dup = `${tmuxBaseName(DIR, "codex")}-2`;
    expect(planHere(DIR, live(dup), [])).toMatchObject({ kind: "attach", name: dup, runtime: "codex" });
  });

  test("other directories' sessions never match", () => {
    const plan = planHere(DIR, live(tmuxBaseName("/work/other", "claude")), hist("claude"), new Set());
    expect(plan).toEqual({ kind: "launch", runtime: "claude" });
  });

  test("an agent running outside tmux opens its management view, not a duplicate", () => {
    const plan = planHere(DIR, live(), hist("codex", "claude"), new Set([`${DIR}\0claude`]));
    expect(plan).toMatchObject({ kind: "running", session: { dir: DIR, runtime: "claude" } });
  });

  test("no history and nothing live asks for a runtime", () => {
    expect(planHere(DIR, live(), [], new Set())).toEqual({ kind: "pick" });
  });

  test("--print shows the attach for a live session without attaching", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-here-"));
    const target = join(base, "proj");
    mkdirSync(target);
    const db = join(base, "history.json");
    writeFileSync(db, JSON.stringify(hist("shell").map((s) => ({ ...s, dir: target }))));
    const name = tmuxBaseName(target, "shell");
    const fake = setupFakeTmux([`${name}\t0\t1700000000`]);
    const prevDb = process.env.ATLAS_HISTORY_FILE;
    const prevTmux = process.env.TMUX;
    process.env.ATLAS_HISTORY_FILE = db;
    delete process.env.TMUX;
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await here(target, { dryRun: true })).toBe(0);
      expect(log.mock.calls.at(-1)?.[0]).toBe(`${process.env.ATLAS_TMUX_BIN} attach-session -t ${name}`);
      expect(fakeCalls(fake)).toEqual([]);
    } finally {
      log.mockRestore();
      fake.restore();
      if (prevDb === undefined) delete process.env.ATLAS_HISTORY_FILE;
      else process.env.ATLAS_HISTORY_FILE = prevDb;
      if (prevTmux !== undefined) process.env.TMUX = prevTmux;
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("--print launches the last runtime when nothing is live", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-here-"));
    const target = join(base, "proj");
    mkdirSync(target);
    const db = join(base, "history.json");
    writeFileSync(db, JSON.stringify(hist("shell").map((s) => ({ ...s, dir: target }))));
    const fake = setupFakeTmux();
    const prevDb = process.env.ATLAS_HISTORY_FILE;
    process.env.ATLAS_HISTORY_FILE = db;
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      expect(await here(target, { dryRun: true })).toBe(0);
      expect(log.mock.calls.at(-1)?.[0]).toContain(`new-session -d -s ${tmuxBaseName(target, "shell")}`);
    } finally {
      log.mockRestore();
      fake.restore();
      if (prevDb === undefined) delete process.env.ATLAS_HISTORY_FILE;
      else process.env.ATLAS_HISTORY_FILE = prevDb;
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("relative directories name the same tmux session as their absolute path", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-here-"));
    const target = join(base, "proj");
    mkdirSync(target);
    const fake = setupFakeTmux();
    const cwd = process.cwd();
    const log = spyOn(console, "log").mockImplementation(() => {});
    try {
      process.chdir(target);
      expect(await launch(".", "shell", { dryRun: true })).toBe(0);
      const printed = String(log.mock.calls.at(-1)?.[0]);
      expect(printed).toContain(`-s ${tmuxBaseName(target, "shell")} -c ${target} `);
    } finally {
      process.chdir(cwd);
      log.mockRestore();
      fake.restore();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("the TUI renders on the alternate screen", () => {
    expect(RENDER_OPTIONS).toMatchObject({ alternateScreen: true });
  });

  test("a missing directory fails with 2", async () => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await here("/tmp/atlas-definitely-missing-xyz")).toBe(2);
    } finally {
      err.mockRestore();
    }
  });
});

test("coming back from tmux tells how the session stays reachable", () => {
  expect(backNotice({ back: "atlas-x-shell-1a2b3c", nested: false })).toBe(
    "Voltou de atlas-x-shell-1a2b3c · a sessão segue rodando no tmux.",
  );
  expect(backNotice({ back: "atlas-x-shell-1a2b3c", nested: true })).toContain("Ctrl-b L");
});
