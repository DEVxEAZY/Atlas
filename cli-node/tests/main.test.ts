import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgv, launch, listSessions, parseArgs } from "../src/main.tsx";
import { load } from "../src/history";
import { tmuxBaseName } from "../src/tmux";
import { fakeCalls, setupFakeTmux } from "./tmux-fake";

/** Run launch() in a child bun (launch execs, so in-process would replace
 *  the test runner). envOverride undefined values delete the variable. */
function runLaunch(
  target: string,
  runtime: string,
  db: string,
  extraArgs: string[] = [],
  envOverride: Record<string, string | undefined> = {},
): { exitCode: number; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const [k, v] of Object.entries(envOverride)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  const proc = Bun.spawnSync(
    [
      process.execPath,
      join(import.meta.dir, "fixtures", "launch-probe.ts"),
      target,
      runtime,
      db,
      ...extraArgs,
    ],
    { env },
  );
  return { exitCode: proc.exitCode, stderr: proc.stderr.toString() };
}

describe("main", () => {
  test("parseArgs flags", () => {
    expect(parseArgs([])).toEqual({ list: false, dryRun: false });
    expect(parseArgs(["--list"])).toMatchObject({ list: true });
    expect(parseArgs(["-d", "/x", "-r", "codex"])).toMatchObject({ dir: "/x", runtime: "codex" });
    expect(parseArgs(["--dir", "/x", "--runtime", "muse", "--print"])).toMatchObject({
      dir: "/x",
      runtime: "muse",
      dryRun: true,
    });
  });

  test("buildArgv resume per harness", () => {
    const codex = buildArgv("codex", "abc");
    expect(codex.slice(-2)).toEqual(["resume", "abc"]);
    const muse = buildArgv("muse", "abc");
    expect(muse.slice(-2)).toEqual(["resume", "abc"]);
    const claude = buildArgv("claude", "abc");
    expect(claude.slice(-2)).toEqual(["--resume", "abc"]);
  });

  test("buildArgv shell uses SHELL", () => {
    const prev = process.env.SHELL;
    process.env.SHELL = "/bin/bash";
    try {
      expect(buildArgv("shell")).toEqual(["/bin/bash"]);
    } finally {
      if (prev === undefined) delete process.env.SHELL;
      else process.env.SHELL = prev;
    }
  });

  test("launch dry-run prints and does not record", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const prev = process.env.ATLAS_HISTORY_FILE;
    const db = join(base, "history.json");
    process.env.ATLAS_HISTORY_FILE = db;
    try {
      const target = join(base, "proj");
      await Bun.$`mkdir -p ${target}`.quiet();
      const code = await launch(target, "shell", { dryRun: true });
      expect(code).toBe(0);
      const { existsSync } = await import("node:fs");
      expect(existsSync(db)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.ATLAS_HISTORY_FILE;
      else process.env.ATLAS_HISTORY_FILE = prev;
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("launch missing dir returns 2", async () => {
    expect(await launch("/tmp/atlas-definitely-missing-xyz", "shell")).toBe(2);
  });

  test("launch creates a tmux session, records, then execs attach", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const target = join(base, "proj");
    await Bun.$`mkdir -p ${target}`.quiet();
    const db = join(base, "history.json");
    const fake = setupFakeTmux();
    try {
      const name = tmuxBaseName(target, "shell");
      const { exitCode } = runLaunch(target, "shell", db, [], { TMUX: undefined });
      expect(exitCode).toBe(0);
      const calls = fakeCalls(fake);
      expect(calls[0]).toBe(
        `new-session -d -s ${name} -c ${target} '${process.env.SHELL ?? "/bin/sh"}'`,
      );
      expect(calls).toContain(`attach-session -t ${name}`);
      expect(load(db).some((s) => s.dir === target && s.runtime === "shell")).toBe(true);
    } finally {
      fake.restore();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("launch reuses an existing tmux session without creating", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const target = join(base, "proj");
    await Bun.$`mkdir -p ${target}`.quiet();
    const db = join(base, "history.json");
    const name = tmuxBaseName(target, "shell");
    const fake = setupFakeTmux([`${name}\t1\t1700000000`]);
    try {
      expect(runLaunch(target, "shell", db, [], { TMUX: undefined }).exitCode).toBe(0);
      expect(fakeCalls(fake)).toEqual([`attach-session -t ${name}`]);
    } finally {
      fake.restore();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("launch inside tmux switches the client instead of attaching", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const target = join(base, "proj");
    await Bun.$`mkdir -p ${target}`.quiet();
    const db = join(base, "history.json");
    const fake = setupFakeTmux();
    try {
      const { exitCode } = runLaunch(target, "shell", db, [], {
        TMUX: "/tmp/fake-tmux-sock,123,0",
      });
      expect(exitCode).toBe(0);
      const name = tmuxBaseName(target, "shell");
      expect(fakeCalls(fake)).toEqual([
        expect.stringContaining(`new-session -d -s ${name} -c ${target}`),
        `switch-client -t ${name}`,
      ]);
    } finally {
      fake.restore();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("launch without tmux execs the runtime directly", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const target = join(base, "proj");
    await Bun.$`mkdir -p ${target}`.quiet();
    const db = join(base, "history.json");
    const emptyBin = mkdtempSync(join(tmpdir(), "atlas-emptybin-"));
    try {
      // fresh child PATH without tmux: which() resolves null at startup
      const { exitCode, stderr } = runLaunch(target, "shell", db, [], {
        PATH: emptyBin,
        ATLAS_TMUX_BIN: undefined,
      });
      expect(exitCode).toBe(0); // exec'd sh exits on EOF stdin
      expect(stderr).toContain("sessão direta");
      expect(load(db).some((s) => s.dir === target && s.runtime === "shell")).toBe(true);
    } finally {
      rmSync(base, { recursive: true, force: true });
      rmSync(emptyBin, { recursive: true, force: true });
    }
  });

  test("launch attachTmux enters without recording", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const target = join(base, "proj");
    await Bun.$`mkdir -p ${target}`.quiet();
    const db = join(base, "history.json");
    const name = tmuxBaseName(target, "shell");
    const fake = setupFakeTmux([`${name}\t0\t1700000000`]);
    try {
      const { exitCode } = runLaunch(target, "shell", db, [name], { TMUX: undefined });
      expect(exitCode).toBe(0);
      expect(fakeCalls(fake)).toEqual([`attach-session -t ${name}`]);
      expect(existsSync(db)).toBe(false);
    } finally {
      fake.restore();
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("launch with a bogus tmux override fails cleanly", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const target = join(base, "proj");
    await Bun.$`mkdir -p ${target}`.quiet();
    const db = join(base, "history.json");
    try {
      const { exitCode, stderr } = runLaunch(target, "shell", db, [], {
        TMUX: undefined,
        ATLAS_TMUX_BIN: "/nonexistent/atlas-no-tmux",
      });
      expect(exitCode).toBe(2);
      expect(stderr).toContain("não consegui criar a sessão tmux");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("listSessions empty", () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
    const prev = process.env.ATLAS_HISTORY_FILE;
    process.env.ATLAS_HISTORY_FILE = join(base, "history.json");
    try {
      expect(listSessions()).toBe(0);
    } finally {
      if (prev === undefined) delete process.env.ATLAS_HISTORY_FILE;
      else process.env.ATLAS_HISTORY_FILE = prev;
      rmSync(base, { recursive: true, force: true });
    }
  });
});
