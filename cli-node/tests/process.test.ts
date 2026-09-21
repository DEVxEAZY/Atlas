import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  keysForAgents,
  matchBin,
  pidsForKey,
  pidsForResume,
  procStartedAt,
  resumeIdFromArgv,
  resumeIdsForAgents,
  resumeIdsForPids,
  runningKeys,
  runningResumeIds,
  runtimeForCommand,
  scanProcesses,
  terminatePids,
  ttyForPid,
} from "../src/process";

let tmpdirs: string[] = [];
let procs: Bun.Subprocess[] = [];
afterEach(() => {
  for (const p of procs) {
    try {
      p.kill();
    } catch {
      /* already dead */
    }
  }
  procs = [];
  for (const d of tmpdirs) rmSync(d, { recursive: true, force: true });
  tmpdirs = [];
});

describe("process scan", () => {
  test("finds a live process by basename and cwd", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const p = Bun.spawn(["sleep", "30"], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 100));
    const found = scanProcesses(["sleep"]);
    expect(found.get(base)).toContain("sleep");
  });

  test("dead processes vanish from the scan", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const p = Bun.spawn(["sleep", "30"], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 100));
    expect(scanProcesses(["sleep"]).has(base)).toBe(true);
    p.kill();
    await p.exited;
    expect(scanProcesses(["sleep"]).has(base)).toBe(false);
  });

  test("matches a fake harness binary by basename", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const fake = join(base, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const p = Bun.spawn([fake], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 100));
    expect(runningKeys(["codex"])).toContain(`${base}\0codex`);
    expect(scanProcesses().get(base)).toContain("codex");
    expect(scanProcesses(["muse"]).has(base)).toBe(false);
  });

  test("empty names and missing proc root are safe", () => {
    expect(scanProcesses([])).toEqual(new Map());
    expect(scanProcesses(["sleep"], "/tmp/atlas-no-such-proc")).toEqual(new Map());
  });

  test("matchBin covers versioned forms only", () => {
    expect(matchBin("codex", "codex")).toBe(true);
    expect(matchBin("muse-bin-1.3.0", "muse")).toBe(true);
    expect(matchBin("claude.exe", "claude")).toBe(true);
    expect(matchBin("mycodex", "codex")).toBe(false);
    expect(matchBin("code", "codex")).toBe(false);
  });

  test("versioned script name matches through the interpreter", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const fake = join(base, "muse-bin-9");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const p = Bun.spawn([fake], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 100));
    expect(runningKeys(["muse"])).toContain(`${base}\0muse`);
  });

  test("pidsForKey returns the live pid", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const p = Bun.spawn(["sleep", "30"], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 100));
    expect(pidsForKey(base, "sleep")).toContain(p.pid);
    expect(pidsForKey(base, "codex")).not.toContain(p.pid);
  });

  test("resumeIdFromArgv covers the spawn forms", () => {
    expect(resumeIdFromArgv(["codex", "resume", "abc"])).toBe("abc");
    expect(resumeIdFromArgv(["claude", "--resume", "abc"])).toBe("abc");
    expect(resumeIdFromArgv(["claude", "--resume=abc"])).toBe("abc");
    expect(resumeIdFromArgv(["codex", "resume", "--last"])).toBeNull(); // flag, not an id
    expect(resumeIdFromArgv(["codex", "resume"])).toBeNull();
    expect(resumeIdFromArgv(["codex"])).toBeNull();
    expect(resumeIdFromArgv([])).toBeNull();
  });

  const pyTest = test.skipIf(Bun.which("python3") === null);
  pyTest("runningResumeIds sees a live resume", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const fake = join(base, "codex");
    writeFileSync(fake, "import time\ntime.sleep(30)\n");
    const p = Bun.spawn(["python3", fake, "resume", "sess-123"], {
      cwd: base,
      stdout: "ignore",
      stderr: "ignore",
    });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 150));
    expect(runningResumeIds()).toContain("sess-123");
    expect(pidsForResume("sess-123")).toContain(p.pid);
    expect(pidsForResume("sess-999")).toEqual([]);
    expect(runningKeys(["codex"])).toContain(`${base}\0codex`); // bin still matches
  });

  test("terminatePids kills and tolerates the missing", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const p = Bun.spawn(["sleep", "30"], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 100));
    const first = await terminatePids([p.pid], 200);
    expect(first.killed).toContain(p.pid);
    expect(first.alive).toEqual([]);
    const again = await terminatePids([p.pid, 99999999], 50);
    expect(again.alive).toEqual([]); // already gone counts as killed
    expect(again.killed).toContain(p.pid);
  });

  test("runtimeForCommand spots agents in pane commands", () => {
    expect(runtimeForCommand("codex")).toBe("codex");
    expect(runtimeForCommand("muse-bin-1.3.0")).toBe("muse");
    expect(runtimeForCommand("bash")).toBeNull();
    expect(runtimeForCommand("sh")).toBeNull();
    expect(runtimeForCommand("")).toBeNull();
  });

  test("procStartedAt reads live pids", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const p = Bun.spawn(["sleep", "30"], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 50));
    const started = procStartedAt(p.pid);
    expect(typeof started).toBe("number");
    // +1ms: mtimeMs carries a sub-ms fraction while Date.now() truncates,
    // so a pid born in this very millisecond reads ~0.2ms "in the future"
    expect(started!).toBeLessThanOrEqual(Date.now() + 1);
    expect(procStartedAt(99999999)).toBeNull();
  });

  test("keysForAgents and resumeIdsForAgents derive from one scan", () => {
    const agents = [
      { pid: 11, dir: "/w/proj", bin: "codex", argv: ["codex", "resume", "id-1"] },
      { pid: 12, dir: "/w/proj", bin: "codex", argv: ["codex"] },
      { pid: 13, dir: "/w/other", bin: "muse", argv: ["muse", "--resume=id-2"] },
    ];
    expect(keysForAgents(agents)).toEqual(new Set(["/w/proj\0codex", "/w/other\0muse"]));
    expect(resumeIdsForAgents(agents)).toEqual(new Set(["id-1", "id-2"]));
  });

  test("resumeIdsForPids collects distinct argv ids", async () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    const fake = join(base, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const id = "bbbbbbbb-2222-4222-8222-222222222222";
    const p1 = Bun.spawn([fake, "resume", id], { cwd: base, stdout: "ignore", stderr: "ignore" });
    const p2 = Bun.spawn([fake], { cwd: base, stdout: "ignore", stderr: "ignore" });
    procs.push(p1, p2);
    await new Promise((r) => setTimeout(r, 150));
    expect(resumeIdsForPids([p1.pid, p2.pid]).sort()).toEqual([id]);
    expect(resumeIdsForPids([p2.pid])).toEqual([]);
    expect(resumeIdsForPids([])).toEqual([]);
    expect(resumeIdsForPids([99999999])).toEqual([]);
  });

  test("ttyForPid reads fd 0 of a pid", async () => {
    const p = Bun.spawn(["sleep", "30"], { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    procs.push(p);
    await new Promise((r) => setTimeout(r, 50));
    const tty = ttyForPid(p.pid);
    expect(typeof tty).toBe("string"); // /dev/null here, a pty under tmux
    expect(ttyForPid(99999999)).toBeNull();
  });

  test("ttyForPid honors a fixture proc root", () => {
    const base = mkdtempSync(join(tmpdir(), "atlas-proc-"));
    tmpdirs.push(base);
    mkdirSync(join(base, "4242", "fd"), { recursive: true });
    symlinkSync("/dev/pts/7", join(base, "4242", "fd", "0"));
    expect(ttyForPid(4242, base)).toBe("/dev/pts/7");
    expect(ttyForPid(9999, base)).toBeNull();
  });
});
