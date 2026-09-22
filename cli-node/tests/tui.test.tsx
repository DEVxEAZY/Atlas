import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, chmodSync, mkdtempSync, mkdirSync, readlinkSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import App, { type Choice } from "../src/App";
import DirPicker from "../src/screens/DirPicker";
import Hub from "../src/screens/Hub";
import Running from "../src/screens/Running";
import Runtime from "../src/screens/Runtime";
import { load, record } from "../src/history";
import { pidsForKey, runningKeys, runningResumeIds } from "../src/process";
import { isTmpDir } from "../src/rows";
import type { NativeSession } from "../src/native/index";
import { KEY, LIVE_SPIN_RE, burst, key, mount, sleep, waitFor, waitFrame } from "./ink-helpers";
import { setupFakeTmux, type FakeTmux } from "./tmux-fake";

let tmpdirs: string[] = [];
let fakeTmux: FakeTmux[] = [];
afterEach(() => {
  for (const d of tmpdirs) rmSync(d, { recursive: true, force: true });
  tmpdirs = [];
  for (const f of fakeTmux.reverse()) f.restore();
  fakeTmux = [];
  delete process.env.ATLAS_HISTORY_FILE;
  delete process.env.ATLAS_ROOTS;
  delete process.env.TMUX_TMPDIR;
  delete process.env.ATLAS_CLAUDE_HOME;
  delete process.env.ATLAS_CODEX_HOME;
  delete process.env.ATLAS_MUSE_HOME;
});

function setupEnv(): { rootA: string; rootB: string } {
  const base = mkdtempSync(join(tmpdir(), "atlas-tui-"));
  tmpdirs.push(base);
  const rootA = join(base, "@a");
  const rootB = join(base, "@b");
  mkdirSync(join(rootA, "proj"), { recursive: true });
  mkdirSync(join(rootB, "other"), { recursive: true });
  process.env.ATLAS_HISTORY_FILE = join(base, "history.json");
  process.env.ATLAS_ROOTS = `${rootA}:${rootB}`;
  // hermetic tmux lists: an existing-but-empty socket dir means "no server"
  // (tmux falls back to /tmp when TMUX_TMPDIR does not exist at all)
  mkdirSync(join(base, "notmux"), { recursive: true });
  process.env.TMUX_TMPDIR = join(base, "notmux");
  // …and a present-but-empty tmux, so migration preflights pass on any box
  fakeTmux.push(setupFakeTmux());
  const empty = join(base, "empty-native");
  mkdirSync(empty, { recursive: true });
  process.env.ATLAS_CLAUDE_HOME = empty;
  process.env.ATLAS_CODEX_HOME = empty;
  process.env.ATLAS_MUSE_HOME = empty;
  return { rootA, rootB };
}

/** Wait until a spawned fake is past exec: detectable AND no longer the `bun`
 *  image. A mount-time scan landing mid-exec (empty cmdline) would miss it. */
async function waitForLive(pid: number, key: string): Promise<void> {
  await waitFor(() => {
    if (!runningKeys().has(key)) return false;
    try {
      return basename(readlinkSync(`/proc/${pid}/exe`)) !== "bun";
    } catch {
      return false; // mid-exec: exe link unreadable
    }
  });
}

describe("tui", () => {
  test("hub starts collapsed with domains", async () => {
    const { rootA } = setupEnv();
    record(join(rootA, "proj"), "codex");
    const app = mount(<App onDone={() => {}} />);
    try {
      const frame = await waitFrame(app, (f) => f.includes("Recentes"));
      expect(frame).toContain("▸ Recentes");
      expect(frame).toContain("@a");
      expect(frame).not.toContain("proj");
    } finally {
      app.unmount();
    }
  });

  test("enter expands recents and opens session", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, KEY.enter); // expand (toggle row focused)
      await waitFrame(app, (f) => f.includes("proj"));
      await key(app, KEY.down); // first session row
      await key(app, KEY.enter); // open
      await waitFor(() => done !== undefined);
      expect(done).toEqual({ dir: target, runtime: "codex" });
    } finally {
      app.unmount();
    }
  });

  test("atlas DIR without history starts on the runtime picker", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    let done: Choice | null | undefined;
    const app = mount(
      <App start={{ name: "runtime", dir: target, fresh: false }} onDone={(c) => (done = c)} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("runtime ·") && f.includes("Terminal"));
      await key(app, KEY.up, 5); // up past the agents lands on the first one
      await key(app, KEY.down, 3); // Terminal is always available
      await key(app, KEY.enter);
      await waitFor(() => done !== undefined);
      expect(done).toEqual({ dir: target, runtime: "shell", fresh: false });
    } finally {
      app.unmount();
    }
  });

  test("esc from a start screen falls back to the hub", async () => {
    const { rootA } = setupEnv();
    const app = mount(
      <App start={{ name: "runtime", dir: join(rootA, "proj"), fresh: false }} onDone={() => {}} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("runtime ·"));
      await key(app, KEY.esc);
      await waitFrame(app, (f) => f.includes("Recentes"));
    } finally {
      app.unmount();
    }
  });

  test("filter narrows recents", async () => {
    const { rootA, rootB } = setupEnv();
    record(join(rootA, "proj"), "codex");
    record(join(rootB, "other"), "muse");
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, "/");
      await key(app, "other");
      const frame = await waitFrame(app, (f) => f.includes("other"));
      expect(frame).toContain("other");
      expect(frame).not.toContain("proj");
    } finally {
      app.unmount();
    }
  });

  test("ctrl+c quits", async () => {
    setupEnv();
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, KEY.ctrlC);
      await waitFor(() => done !== undefined);
      expect(done).toBeNull();
    } finally {
      app.unmount();
    }
  });

  test("runtime preselects last runtime for dir", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "muse");
    let picked: string | undefined;
    const app = mount(
      <Runtime dir={target} onPick={(r) => (picked = r)} onBack={() => {}} onQuit={() => {}} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Agentes"));
      await key(app, KEY.enter);
      await waitFor(() => picked !== undefined);
      expect(picked).toBe("muse");
    } finally {
      app.unmount();
    }
  });

  test("conversas expand and resume native session", async () => {
    setupEnv();
    const fix = join(import.meta.dir, "fixtures");
    // pin convo order: updatedAt comes from mtimes, which depend on checkout
    // timing — make 1111 strictly newer so "first convo" is deterministic
    const now = new Date();
    utimesSync(
      join(fix, "claude/projects/-test-proj/22222222-2222-2222-2222-222222222222.jsonl"),
      now,
      new Date(now.getTime() - 60000),
    );
    utimesSync(
      join(fix, "claude/projects/-test-proj/11111111-1111-1111-1111-111111111111.jsonl"),
      now,
      now,
    );
    process.env.ATLAS_CLAUDE_HOME = join(fix, "claude");
    process.env.ATLAS_CODEX_HOME = join(fix, "codex");
    process.env.ATLAS_MUSE_HOME = join(fix, "muse");
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("Conversas"));
      await key(app, KEY.down); // conversas toggle
      await key(app, KEY.enter); // expand
      await waitFrame(app, (f) => f.includes("arrumar o bug"));
      await key(app, KEY.down); // first convo
      await key(app, KEY.enter); // resume
      await waitFor(() => done !== undefined);
      expect(done).toEqual({
        dir: "/home/dev/@development/Atlas",
        runtime: "claude",
        resume: "11111111-1111-1111-1111-111111111111",
      });
    } finally {
      app.unmount();
    }
  });

  test("conversas ver todas expands and collapses per harness", async () => {
    setupEnv();
    const fix = join(import.meta.dir, "fixtures");
    const base = mkdtempSync(join(tmpdir(), "atlas-expand-"));
    tmpdirs.push(base);
    const claudeHome = join(base, "claude");
    cpSync(join(fix, "claude"), claudeHome, { recursive: true });
    const slugDir = join(claudeHome, "projects", "-test-proj");
    const now = Date.now();
    for (let i = 0; i < 13; i++) {
      const id = `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`;
      writeFileSync(
        join(slugDir, `${id}.jsonl`),
        `${JSON.stringify({ type: "user", cwd: `/home/dev/wibble-${i}`, message: `wibble-extra-${i}` })}\n`,
      );
      const mtime = new Date(now - (13 - i) * 1000);
      utimesSync(join(slugDir, `${id}.jsonl`), mtime, mtime);
    }
    const old = new Date(now - 100000);
    for (const name of [
      "11111111-1111-1111-1111-111111111111.jsonl",
      "22222222-2222-2222-2222-222222222222.jsonl",
    ]) {
      utimesSync(join(slugDir, name), old, old);
    }
    process.env.ATLAS_CLAUDE_HOME = claudeHome;
    process.env.ATLAS_CODEX_HOME = join(fix, "codex");
    process.env.ATLAS_MUSE_HOME = join(fix, "muse");
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("Conversas"));
      await key(app, KEY.down); // conversas toggle
      await key(app, KEY.enter); // expand section
      const top = await waitFrame(app, (f) => f.includes("12 de 14"));
      expect(top).toContain("12 de 14");
      await key(app, KEY.down, 13); // scroll to …ver todas row
      const collapsed = await waitFrame(app, (f) => f.includes("ver todas (14)"));
      expect(collapsed).not.toContain("wibble-extra-0");
      expect(collapsed).not.toContain("arrumar o bug");
      await key(app, KEY.enter); // load full history
      expect(app.lastFrame()).toContain("carregando");
      await sleep(60); // let the full scan finish
      const expanded = await waitFrame(app, (f) => f.includes("wibble-extra-0"));
      expect(expanded).toContain("ver menos");
      expect(expanded).toContain("arrumar o bug");
      expect(expanded).not.toContain("ver todas");
      await key(app, KEY.down, 2); // ver menos row (14 visible: the /tmp convo hides)
      await key(app, KEY.enter); // collapse
      await key(app, KEY.up, 2); // recenter the list window on …ver todas
      const collapsedAgain = await waitFrame(app, (f) => f.includes("ver todas (14)"));
      expect(collapsedAgain).not.toContain("wibble-extra-0");
      expect(collapsedAgain).not.toContain("arrumar o bug");
      await key(app, KEY.up, 13); // scroll back to the claude header
      const topAgain = await waitFrame(app, (f) => f.includes("12 de 14"));
      expect(topAgain).toContain("12 de 14");
      // filter searches loaded items, not just the capped view
      await key(app, "/");
      await key(app, "arrumar");
      const filtered = await waitFrame(app, (f) => f.includes("arrumar o bug"));
      expect(filtered).toContain("arrumar o bug");
    } finally {
      app.unmount();
    }
  }, 60000);

  test("rapid down+enter opens the session (no stale selection)", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, KEY.enter); // expand
      await waitFrame(app, (f) => f.includes("proj"));
      await burst(app, KEY.down, KEY.enter); // fast: no render between
      await waitFor(() => done !== undefined);
      expect(done).toEqual({ dir: target, runtime: "codex" });
    } finally {
      app.unmount();
    }
  });

  test("rapid down+enter in dirpicker picks the second row", async () => {
    const { rootA, rootB } = setupEnv();
    let picked: string | undefined;
    const app = mount(
      <DirPicker
        title="Nova"
        candidates={[
          { path: rootA, domain: "@a", kind: "domain" },
          { path: rootB, domain: "@b", kind: "domain" },
        ]}
        onPick={(d) => (picked = d)}
        onBack={() => {}}
        onQuit={() => {}}
      />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Nova"));
      await burst(app, KEY.down, KEY.enter);
      await waitFor(() => picked !== undefined);
      expect(picked).toBe(rootB);
    } finally {
      app.unmount();
    }
  });

  test("rapid down+enter in runtime picks the second runtime", async () => {
    const { rootA } = setupEnv();
    let picked: string | undefined;
    const app = mount(
      <Runtime dir={join(rootA, "proj")} onPick={(r) => (picked = r)} onBack={() => {}} onQuit={() => {}} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Agentes"));
      await burst(app, KEY.down, KEY.enter);
      await waitFor(() => picked !== undefined);
      expect(picked).toBe("claude");
    } finally {
      app.unmount();
    }
  });

  test("running sessions spin and pin to the top", async () => {
    const { rootA, rootB } = setupEnv();
    const target = join(rootA, "proj");
    const other = join(rootB, "other");
    record(target, "codex"); // older…
    await sleep(10); // distinct ms timestamps: recency must strictly prefer `other`
    record(other, "shell"); // …but newer, so pinning must reorder
    // fake live agent: a `codex` process sitting in target
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    // Hub snapshots running procs at mount: wait until past exec first
    await waitForLive(proc.pid, `${target}\0codex`);
    const app = mount(<App onDone={() => {}} />);
    try {
      // recents auto-expand: the running session shows with no keypress
      const frame = await waitFrame(app, (f) => f.includes("proj") && f.includes("other"));
      expect(frame).toMatch(LIVE_SPIN_RE); // live session spins
      expect(frame.indexOf("proj")).toBeLessThan(frame.indexOf("other")); // pinned first
      await sleep(250);
      expect(app.lastFrame() ?? "").toMatch(LIVE_SPIN_RE);
    } finally {
      app.unmount();
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("T T in the hub migrates a live session into tmux", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "cccccccc-3333-4333-8333-333333333333";
    record(target, "muse");
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let migrated: Choice | undefined;
    let opened: Choice | undefined;
    const noop = () => {};
    try {
      await waitForLive(proc.pid, `${target}\0muse`);
      const app = mount(
        <Hub
          onMigrate={(c) => {
            migrated = c;
            return { ok: true, name: "atlas-proj-muse-x" };
          }}
          domains={[]}
          onOpen={(c) => (opened = c)}
          onViewRunning={noop}
          onNewSession={noop}
          onDrill={noop}
          onQuit={noop}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("agora"));
        await key(app, "T"); // the live row under agora is selected
        await waitFrame(app, (f) => f.includes("T de novo para migrar"));
        await key(app, "T");
        await waitFor(() => migrated !== undefined);
        expect(migrated).toEqual({ dir: target, runtime: "muse", resume: id });
        await waitFrame(app, (f) => f.includes("no tmux em 2º plano: atlas-proj-muse-x"));
        await waitFor(() => {
          try {
            process.kill(proc.pid, 0);
            return false;
          } catch {
            return true;
          }
        });
        expect(opened).toBeUndefined(); // background: never attaches
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("T T in the hub opens an idle convo detached in tmux", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "12121212-1212-4212-8212-121212121212";
    const home = join(rootA, "..", "claude-idle");
    mkdirSync(join(home, "projects", "p"), { recursive: true });
    writeFileSync(
      join(home, "projects", "p", `${id}.jsonl`),
      JSON.stringify({ type: "user", cwd: target, message: { role: "user", content: "retomar em segundo plano" } }) + "\n",
    );
    process.env.ATLAS_CLAUDE_HOME = home;
    let migrated: Choice | undefined;
    const noop = () => {};
    const app = mount(
      <Hub
        onMigrate={(c) => {
          migrated = c;
          return { ok: true, name: "atlas-x" };
        }}
        domains={[]}
        onOpen={noop}
        onViewRunning={noop}
        onNewSession={noop}
        onDrill={noop}
        onQuit={noop}
      />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Conversas"));
      await key(app, KEY.down); // convos toggle
      await key(app, KEY.enter); // expand
      if (isTmpDir(target)) {
        // the temp project lives under /tmp, hidden by default: reveal it
        await waitFrame(app, (f) => f.includes("mostrar conversas de /tmp"));
        await key(app, KEY.down, 3); // clamp onto the /tmp toggle (last row)
        await key(app, KEY.enter);
      }
      await waitFrame(app, (f) => f.includes("retomar em segundo plano"));
      if (isTmpDir(target)) {
        await key(app, KEY.down); // back onto the toggle…
        await key(app, KEY.up); // …then up to the convo
      } else await key(app, KEY.down); // straight from the section toggle
      await key(app, "T");
      await waitFrame(app, (f) => f.includes("T de novo para abrir no tmux em 2º plano"));
      await key(app, "T");
      await waitFor(() => migrated !== undefined);
      expect(migrated).toEqual({ dir: target, runtime: "claude", resume: id });
    } finally {
      app.unmount();
    }
  });

  test("moving the cursor disarms T: a later lone T only asks again", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "13131313-1313-4313-8313-131313131313";
    const home = join(rootA, "..", "claude-arm");
    mkdirSync(join(home, "projects", "p"), { recursive: true });
    writeFileSync(
      join(home, "projects", "p", `${id}.jsonl`),
      JSON.stringify({ type: "user", cwd: target, message: { role: "user", content: "não mexa ainda" } }) + "\n",
    );
    process.env.ATLAS_CLAUDE_HOME = home;
    let migrated = false;
    const noop = () => {};
    const app = mount(
      <Hub
        onMigrate={() => {
          migrated = true;
          return { ok: true };
        }}
        domains={[]}
        onOpen={noop}
        onViewRunning={noop}
        onNewSession={noop}
        onDrill={noop}
        onQuit={noop}
      />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Conversas"));
      await key(app, KEY.down); // convos toggle
      await key(app, KEY.enter); // expand
      if (isTmpDir(target)) {
        // the temp project lives under /tmp, hidden by default: reveal it
        await waitFrame(app, (f) => f.includes("mostrar conversas de /tmp"));
        await key(app, KEY.down, 3); // clamp onto the /tmp toggle (last row)
        await key(app, KEY.enter);
      }
      await waitFrame(app, (f) => f.includes("não mexa ainda"));
      if (isTmpDir(target)) {
        await key(app, KEY.down); // back onto the toggle…
        await key(app, KEY.up); // …then up to the convo
      } else await key(app, KEY.down); // straight from the section toggle
      await key(app, "T"); // arm
      await waitFrame(app, (f) => f.includes("T de novo"));
      await key(app, KEY.up); // move away…
      await key(app, KEY.down); // …and back
      await key(app, "T"); // must arm again, not fire
      await waitFrame(app, (f) => f.includes("T de novo"));
      await sleep(100);
      expect(migrated).toBe(false);
    } finally {
      app.unmount();
    }
  });

  test("without tmux, T refuses before stopping anything and the hint is hidden", async () => {
    const { rootA } = setupEnv();
    process.env.ATLAS_TMUX_BIN = ""; // no tmux (the fake's restore puts it back)
    const target = join(rootA, "proj");
    const id = "14141414-1414-4414-8414-141414141414";
    record(target, "muse");
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let migrated = false;
    const noop = () => {};
    try {
      await waitForLive(proc.pid, `${target}\0muse`);
      const app = mount(
        <Hub
          onMigrate={() => {
            migrated = true;
            return { ok: true };
          }}
          domains={[]}
          onOpen={noop}
          onViewRunning={noop}
          onNewSession={noop}
          onDrill={noop}
          onQuit={noop}
        />,
      );
      try {
        const frame = await waitFrame(app, (f) => f.includes("agora"));
        expect(frame).not.toContain("T tmux");
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("tmux não instalado"));
        await key(app, "T");
        await sleep(300);
        expect(migrated).toBe(false);
        expect(() => process.kill(proc.pid, 0)).not.toThrow(); // still alive
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("T refuses a group where one process has no resume id, stopping nothing", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "15151515-1515-4515-8515-151515151515";
    record(target, "muse");
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const withId = Bun.spawn([fake, "resume", id], { cwd: target, stdout: "ignore", stderr: "ignore" });
    const bare = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let migrated = false;
    const noop = () => {};
    try {
      await waitForLive(withId.pid, `${target}\0muse`);
      await waitFor(() => pidsForKey(target, "muse").length === 2);
      const app = mount(
        <Hub
          onMigrate={() => {
            migrated = true;
            return { ok: true };
          }}
          domains={[]}
          onOpen={noop}
          onViewRunning={noop}
          onNewSession={noop}
          onDrill={noop}
          onQuit={noop}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("agora"));
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("um processo desse grupo não tem resume id"));
        await key(app, "T");
        await sleep(300);
        expect(migrated).toBe(false);
        expect(() => process.kill(withId.pid, 0)).not.toThrow();
        expect(() => process.kill(bare.pid, 0)).not.toThrow();
      } finally {
        app.unmount();
      }
    } finally {
      for (const p of [withId, bare]) {
        try {
          p.kill();
        } catch {
          /* already dead */
        }
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("a live convo relaunches in its process cwd, not the transcript's", async () => {
    const { rootA, rootB } = setupEnv();
    const recorded = join(rootA, "proj"); // exists, but the agent runs elsewhere
    const actual = join(rootB, "other");
    const id = "16161616-1616-4616-8616-161616161616";
    const home = join(rootA, "..", "claude-cwd");
    mkdirSync(join(home, "projects", "p"), { recursive: true });
    writeFileSync(
      join(home, "projects", "p", `${id}.jsonl`),
      JSON.stringify({ type: "user", cwd: recorded, message: { role: "user", content: "rodando em outro lugar" } }) + "\n",
    );
    process.env.ATLAS_CLAUDE_HOME = home;
    const fake = join(actual, "claude");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "--resume", id], { cwd: actual, stdout: "ignore", stderr: "ignore" });
    let migrated: Choice | undefined;
    const noop = () => {};
    try {
      await waitFor(() => runningResumeIds().has(id));
      const app = mount(
        <Hub
          onMigrate={(c) => {
            migrated = c;
            return { ok: true, name: "atlas-x" };
          }}
          domains={[]}
          onOpen={noop}
          onViewRunning={noop}
          onNewSession={noop}
          onDrill={noop}
          onQuit={noop}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("agora") && f.includes("rodando em outro lugar"));
        await key(app, "T"); // the live convo leads the agora section
        await waitFrame(app, (f) => f.includes("T de novo para migrar"));
        await key(app, "T");
        await waitFor(() => migrated !== undefined);
        expect(migrated).toEqual({ dir: actual, runtime: "claude", resume: id });
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("a tmux that does not run refuses T before stopping anything", async () => {
    const { rootA } = setupEnv();
    process.env.ATLAS_TMUX_BIN = join(rootA, "no-such-tmux"); // configured, not runnable
    const target = join(rootA, "proj");
    const id = "17171717-1717-4717-8717-171717171717";
    record(target, "muse");
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let migrated = false;
    const noop = () => {};
    try {
      await waitForLive(proc.pid, `${target}\0muse`);
      const app = mount(
        <Hub
          onMigrate={() => {
            migrated = true;
            return { ok: true };
          }}
          domains={[]}
          onOpen={noop}
          onViewRunning={noop}
          onNewSession={noop}
          onDrill={noop}
          onQuit={noop}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("agora"));
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("tmux não executa"));
        await key(app, "T");
        await sleep(300);
        expect(migrated).toBe(false);
        expect(() => process.kill(proc.pid, 0)).not.toThrow();
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("Running: T on a session that died after opening says so, without pointing at Enter", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", "18181818-1818-4818-8818-181818181818"], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
    });
    const noop = () => {};
    try {
      await waitForLive(proc.pid, `${target}\0muse`);
      const app = mount(
        <Running
          target={{ kind: "session", session: { dir: target, runtime: "muse", last_used: new Date().toISOString(), uses: 1 } }}
          onBack={noop}
          onQuit={noop}
          onLaunch={noop}
          onAttach={noop}
          onMigrate={() => ({ ok: true })}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("já está rodando"));
        proc.kill();
        await waitFor(() => pidsForKey(target, "muse").length === 0);
        await key(app, "T");
        const frame = await waitFrame(app, (f) => f.includes("o processo já encerrou"));
        expect(frame).not.toContain("Enter abre");
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("Running: esc is ignored mid-migration and the screen pops exactly once", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "19191919-1919-4919-8919-191919191919";
    const fake = join(target, "muse");
    // ignores SIGTERM: termination takes the full grace period, then SIGKILL
    writeFileSync(fake, "#!/bin/sh\ntrap '' TERM\nwhile :; do sleep 1; done\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], { cwd: target, stdout: "ignore", stderr: "ignore" });
    const events: string[] = [];
    try {
      await waitFor(() => runningResumeIds().has(id));
      const convo: NativeSession = { harness: "muse", id, dir: target, preview: null, updatedAt: Date.now(), file: join(target, "s.jsonl") };
      const app = mount(
        <Running
          target={{ kind: "convo", convo }}
          onBack={() => events.push("back")}
          onQuit={() => events.push("quit")}
          onLaunch={() => {}}
          onAttach={() => {}}
          onMigrate={() => {
            events.push("relaunch");
            return { ok: true };
          }}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes(`resume: ${id}`));
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("T de novo"));
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("encerrando aqui para migrar"));
        await key(app, KEY.esc); // mid-flight: must not leave
        await waitFor(() => events.includes("relaunch"), 8000);
        await waitFor(() => events.includes("back"));
        await sleep(100);
        expect(events).toEqual(["relaunch", "back"]);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill(9);
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("T in the hub refuses rows with nothing to move", async () => {
    const { rootA } = setupEnv();
    record(join(rootA, "proj"), "shell");
    const noop = () => {};
    let migrated = false;
    const app = mount(
      <Hub
        onMigrate={() => {
          migrated = true;
          return { ok: true };
        }}
        domains={[{ domain: "@a", repos: 1 }]}
        onOpen={noop}
        onViewRunning={noop}
        onNewSession={noop}
        onDrill={noop}
        onQuit={noop}
      />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, "T"); // on the Recentes toggle
      await waitFrame(app, (f) => f.includes("nada para levar ao tmux"));
      await key(app, KEY.enter); // expand
      await key(app, KEY.down); // the shell session
      await key(app, "T");
      await waitFrame(app, (f) => f.includes("shell não tem conversa"));
      await key(app, "T");
      expect(migrated).toBe(false);
    } finally {
      app.unmount();
    }
  });

  test("long rows truncate so the frame never outgrows the terminal", async () => {
    const { rootA } = setupEnv();
    const deep = join(rootA, "a-very-long-project-directory-name", "with", "nested", "folders", "inside");
    mkdirSync(deep, { recursive: true });
    record(deep, "claude");
    const home = join(rootA, "..", "claude-long");
    mkdirSync(join(home, "projects", "p"), { recursive: true });
    for (let i = 0; i < 20; i++) {
      writeFileSync(
        join(home, "projects", "p", `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000.jsonl`),
        JSON.stringify({
          type: "user",
          // outside /tmp: the Hub hides /tmp conversations by default
          cwd: "/work/a-very-long-project-directory-name/with/nested/folders/inside",
          message: { role: "user", content: `pedido longo número ${i} ` + "com bastante texto ".repeat(6) },
        }) + "\n",
      );
    }
    process.env.ATLAS_CLAUDE_HOME = home;
    const noop = () => {};
    const app = mount(
      <Hub onMigrate={() => ({ ok: true })} domains={[]} onOpen={noop} onViewRunning={noop} onNewSession={noop} onDrill={noop} onQuit={noop} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Conversas"));
      await key(app, KEY.enter); // expand recents
      await key(app, KEY.down, 2); // convos toggle
      await key(app, KEY.enter); // expand
      const frame = await waitFrame(app, (f) => f.includes("pedido longo"));
      const lines = frame.split("\n");
      expect(lines.length).toBeLessThanOrEqual(24); // DEFAULT_ROWS: the list is sized for it
      for (const line of lines) expect([...line].length).toBeLessThanOrEqual(100);
    } finally {
      app.unmount();
    }
  });

  test("hub hides /tmp convos unless toggled", async () => {
    setupEnv();
    const fix = join(import.meta.dir, "fixtures");
    process.env.ATLAS_CLAUDE_HOME = join(fix, "claude");
    process.env.ATLAS_CODEX_HOME = join(fix, "codex");
    process.env.ATLAS_MUSE_HOME = join(fix, "muse");
    const noop = () => {};
    const app = mount(
      <Hub onMigrate={() => ({ ok: true })} domains={[]} onOpen={noop} onViewRunning={noop} onNewSession={noop} onDrill={noop} onQuit={noop} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Conversas"));
      await key(app, KEY.down); // convos toggle
      await key(app, KEY.enter); // expand
      const hidden = await waitFrame(app, (f) => f.includes("arrumar o bug"));
      expect(hidden).not.toContain("revisar o deploy"); // the /tmp convo
      expect(hidden).toContain("mostrar conversas de /tmp");
      await key(app, KEY.down, 15); // clamp onto the toggle row (last row)
      await key(app, KEY.enter);
      const shown = await waitFrame(app, (f) => f.includes("revisar o deploy"));
      expect(shown).toContain("ocultar conversas de /tmp");
      await key(app, KEY.down, 15);
      await key(app, KEY.enter);
      await waitFrame(
        app,
        (f) => !f.includes("revisar o deploy") && f.includes("mostrar conversas de /tmp"),
      );
    } finally {
      app.unmount();
    }
  });

  test("hub shows live items in agora first", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "nowproj");
    mkdirSync(target, { recursive: true });
    record(target, "codex");
    const fix = join(import.meta.dir, "fixtures");
    process.env.ATLAS_CLAUDE_HOME = join(fix, "claude");
    process.env.ATLAS_CODEX_HOME = join(fix, "codex");
    process.env.ATLAS_MUSE_HOME = join(fix, "muse");
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    const id = "11111111-1111-1111-1111-111111111111";
    const fakeResume = join(target, "muse");
    writeFileSync(fakeResume, "#!/bin/sh\nsleep 30\n");
    chmodSync(fakeResume, 0o755);
    const resumeProc = Bun.spawn([fakeResume, "resume", id], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
    });
    await waitForLive(proc.pid, `${target}\0codex`);
    await waitFor(() => runningResumeIds().has(id));
    const app = mount(<App onDone={() => {}} />);
    try {
      const frame = await waitFrame(app, (f) => f.includes("◉ agora"));
      expect(frame).toContain("◉ agora  ·  2");
      // quick access duplicates: live rows show in agora and in their section
      expect(frame.split("nowproj").length - 1).toBe(2);
      expect(frame.split("arrumar o bug").length - 1).toBe(2);
      // cursor lands on the first live row: Enter opens it without moving
      await key(app, KEY.enter);
      await waitFrame(app, (f) => f.includes("Sessão em execução"));
    } finally {
      app.unmount();
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      try {
        resumeProc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
      rmSync(fakeResume, { force: true });
    }
  });

  test("hub kills a live process row with X X", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    // fake live agent: a `codex` process sitting in target
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    await waitForLive(proc.pid, `${target}\0codex`);
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("proj"));
      // snap lands on the agora row: no Down needed
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("X de novo"));
      await key(app, "X");
      await waitFor(() => {
        try {
          process.kill(proc.pid, 0);
          return false;
        } catch {
          return true;
        }
      });
      const frame = await waitFrame(app, (f) => f.includes("encerrado:"));
      expect(frame).toContain("codex");
    } finally {
      app.unmount();
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("hub live refresh pins sessions started after mount", async () => {
    const { rootA, rootB } = setupEnv();
    const target = join(rootA, "proj");
    const other = join(rootB, "other");
    record(target, "codex");
    await sleep(10);
    record(other, "shell");
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, KEY.enter);
      const before = await waitFrame(app, (f) => f.includes("proj") && f.includes("other"));
      expect(before.indexOf("other")).toBeLessThan(before.indexOf("proj")); // recency first
      // start the agent after mount: live refresh must pin it without reopening
      const fake = join(target, "codex");
      writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
      chmodSync(fake, 0o755);
      const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
      try {
        await waitForLive(proc.pid, `${target}\0codex`);
        const after = await waitFrame(
          app,
          (f) => f.includes("proj") && f.includes("other") && f.indexOf("proj") < f.indexOf("other"),
        );
        expect(after).toMatch(LIVE_SPIN_RE);
      } finally {
        try {
          proc.kill();
        } catch {
          /* already dead */
        }
        rmSync(fake, { force: true });
      }
    } finally {
      app.unmount();
    }
  });

  test("hub auto-expands recents when a session is running", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    try {
      await waitForLive(proc.pid, `${target}\0codex`);
      const app = mount(<App onDone={() => {}} />);
      try {
        // no keypress: recents already open on the live session
        const frame = await waitFrame(app, (f) => f.includes("▾ Recentes"));
        expect(frame).toContain("proj");
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("r cycles the runtime and persists it", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, KEY.enter);
      await waitFrame(app, (f) => f.includes("proj"));
      await key(app, KEY.down); // session row
      await key(app, "r");
      await waitFrame(app, (f) => f.includes("claude"));
      const saved = load().find((s) => s.dir === target);
      expect(saved?.runtime).toBe("claude");
      expect(saved?.uses).toBe(1); // rekey, not a fresh record bump
    } finally {
      app.unmount();
    }
  });

  test("typing in the list jumps into the filter", async () => {
    const { rootA, rootB } = setupEnv();
    record(join(rootA, "proj"), "codex");
    record(join(rootB, "other"), "muse");
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      for (const ch of ["m", "u", "s", "e"]) await key(app, ch);
      const frame = await waitFrame(app, (f) => f.includes("other") && !f.includes("proj"));
      expect(frame).toContain("1 resultado");
    } finally {
      app.unmount();
    }
  });

  test("opening a running session peeks without spawning", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let done: Choice | null | undefined;
    try {
      await waitForLive(proc.pid, `${target}\0codex`);
      const app = mount(<App onDone={(c) => (done = c)} />);
      try {
        // auto-expanded on the live session; enter peeks instead of spawning
        await waitFrame(app, (f) => f.includes("proj"));
        await key(app, KEY.enter); // snap sits on the agora row
        const view = await waitFrame(app, (f) => f.includes("em execução"));
        expect(view).toContain(`PID ${proc.pid}`);
        expect(view).toContain("voltar sem matar");
        expect(done).toBeUndefined(); // nothing launched
        // esc goes back to a normally reloaded Hub; the original keeps living
        await key(app, KEY.esc);
        const back = await waitFrame(app, (f) => f.includes("proj") && f.includes("Recentes"));
        expect(back).toContain("proj");
        expect(runningKeys().has(`${target}\0codex`)).toBe(true);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("X X in the running view really ends the session", async () => {
    const { rootA, rootB } = setupEnv();
    const target = join(rootA, "proj");
    const other = join(rootB, "other");
    record(target, "codex");
    await sleep(10);
    record(other, "shell");
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    try {
      await waitForLive(proc.pid, `${target}\0codex`);
      const app = mount(<App onDone={() => {}} />);
      try {
        await waitFrame(app, (f) => f.includes("proj") && f.includes("other"));
        await key(app, KEY.enter); // snap sits on the agora row
        await waitFrame(app, (f) => f.includes("em execução"));
        await key(app, "X");
        await waitFrame(app, (f) => f.includes("de novo")); // arm confirmation
        await key(app, "X");
        // back at a collapsed Hub (nothing running anymore)
        await waitFor(() => !runningKeys().has(`${target}\0codex`));
        const back = await waitFrame(app, (f) => f.includes("▸ Recentes · 2"));
        expect(back).not.toMatch(LIVE_SPIN_RE); // no live spinner in the list rows
        await sleep(400); // let the remounted Hub attach input before driving it
        await key(app, KEY.enter); // expand: recency order, session unpinned
        const open = await waitFrame(
          app,
          (f) =>
            f.includes("proj") && f.includes("other") && f.indexOf("other") < f.indexOf("proj"),
        );
        expect(open).not.toMatch(LIVE_SPIN_RE);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  const pyTuiTest = test.skipIf(Bun.which("python3") === null);
  pyTuiTest("opening a live convo peeks at its log", async () => {
    const { rootA } = setupEnv();
    const fix = join(import.meta.dir, "fixtures");
    process.env.ATLAS_CLAUDE_HOME = join(fix, "claude");
    process.env.ATLAS_CODEX_HOME = join(fix, "codex");
    process.env.ATLAS_MUSE_HOME = join(fix, "muse");
    const id = "01a0bbbb-cccc-dddd-eeee-ffffffffffff"; // codex "consertar o login"
    const fake = join(rootA, "codex");
    writeFileSync(fake, "import time\ntime.sleep(30)\n");
    const proc = Bun.spawn(["python3", fake, "resume", id], {
      cwd: rootA,
      stdout: "ignore",
      stderr: "ignore",
    });
    let done: Choice | null | undefined;
    try {
      await waitFor(() => runningResumeIds().has(id));
      const app = mount(<App onDone={(c) => (done = c)} />);
      try {
        // convos auto-expand on the live resume; filter to the one convo
        await waitFrame(app, (f) => f.includes("Conversas"));
        await key(app, KEY.down, 2); // scroll the codex convo into view
        await waitFrame(app, (f) => f.includes("consertar o login"));
        for (const ch of "consertar o login") await key(app, ch);
        const filtered = await waitFrame(
          app,
          (f) => f.includes("consertar o login") && !f.includes("arrumar o bug"),
        );
        expect(filtered).toContain("1 resultado");
        expect(filtered).toMatch(LIVE_SPIN_RE); // live convo spins
        await key(app, KEY.up, 4); // clamp to the agora convo row
        await key(app, KEY.enter);
        const view = await waitFrame(app, (f) => f.includes("em execução"));
        expect(view).toContain("consertar o login"); // read-only log peek
        expect(view).toContain(`resume: ${id}`);
        expect(done).toBeUndefined(); // duplicate resume refused
        // esc goes back without touching the original ("Conversas" only matches the Hub,
        // never the peek — a bare consertar match would resolve while still in the view)
        await key(app, KEY.esc);
        await waitFrame(app, (f) => f.includes("Conversas")); // back at the Hub
        await key(app, KEY.down, 2); // scroll the codex convo back into view
        await waitFrame(app, (f) => f.includes("consertar o login"));
        expect(runningResumeIds().has(id)).toBe(true);
        // X X ends it for real
        for (const ch of "consertar o login") await key(app, ch);
        await waitFrame(app, (f) => f.includes("1 resultado"));
        await key(app, KEY.up, 4); // clamp to the agora convo row
        await key(app, KEY.enter);
        await waitFrame(app, (f) => f.includes("em execução"));
        await key(app, "X");
        await waitFrame(app, (f) => f.includes("de novo"));
        await key(app, "X");
        await waitFor(() => !runningResumeIds().has(id));
        const back = await waitFrame(app, (f) => f.includes("▸ Conversas · 5"));
        expect(back).toContain("▸ Recentes · nenhuma");
        expect(back).not.toMatch(LIVE_SPIN_RE);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  }, 30000);

  test("a long live transcript never makes the management view taller than the terminal", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "ffffffff-6666-4666-8666-666666666666";
    const log = join(target, `${id}.jsonl`);
    writeFileSync(
      log,
      Array.from({ length: 40 }, (_, i) =>
        JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { content: `mensagem ${i + 1} ` + "y".repeat(140) } }),
      ).join("\n") + "\n",
    );
    const fake = join(target, "claude");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "--resume", id], { cwd: target, stdout: "ignore", stderr: "ignore" });
    const noop = () => {};
    try {
      await waitFor(() => runningResumeIds().has(id));
      const app = mount(
        <Running
          target={{ kind: "convo", convo: { harness: "claude", id, dir: target, preview: null, updatedAt: Date.now(), file: log } }}
          onBack={noop}
          onQuit={noop}
          onLaunch={noop}
          onAttach={noop}
          onMigrate={() => ({ ok: true })}
        />,
      );
      try {
        const frame = await waitFrame(app, (f) => f.includes("mensagem 40"));
        const lines = frame.split("\n");
        expect(lines.length).toBeLessThanOrEqual(24);
        for (const line of lines) expect([...line].length).toBeLessThanOrEqual(100);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("T T migrates an external convo into tmux", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "aaaaaaaa-1111-4111-8111-111111111111";
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
    });
    let migrated: Choice | undefined;
    let launched: Choice | undefined;
    let backed = false;
    try {
      await waitFor(() => runningResumeIds().has(id));
      const convo: NativeSession = {
        harness: "muse",
        id,
        dir: target,
        preview: "migrar-me",
        updatedAt: Date.now(),
        file: join(target, "session.jsonl"),
      };
      const app = mount(
        <Running
          target={{ kind: "convo", convo }}
          onBack={() => (backed = true)}
          onQuit={() => {}}
          onLaunch={(c) => (launched = c)}
          onAttach={() => {}}
          onMigrate={(c) => {
            migrated = c;
            return { ok: true };
          }}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes(`resume: ${id}`));
        expect(app.lastFrame()).toContain("migrar p/ tmux");
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("T de novo"));
        await key(app, "T");
        await waitFor(() => migrated !== undefined);
        expect(migrated).toEqual({ dir: target, runtime: "muse", resume: id });
        expect(launched).toBeUndefined(); // background: never attaches
        await waitFor(() => {
          try {
            process.kill(proc.pid, 0);
            return false;
          } catch {
            return true;
          }
        });
        await waitFor(() => backed); // back to Hub: 𖥠 shows there
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("T on a died convo revives straight into tmux", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "bbbbbbbb-2222-4222-8222-222222222222";
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
    });
    let migrated: Choice | undefined;
    let backed = false;
    try {
      await waitFor(() => runningResumeIds().has(id));
      const convo: NativeSession = {
        harness: "muse",
        id,
        dir: target,
        preview: "reviver-me",
        updatedAt: Date.now(),
        file: join(target, "session.jsonl"),
      };
      const app = mount(
        <Running
          target={{ kind: "convo", convo }}
          onBack={() => (backed = true)}
          onQuit={() => {}}
          onLaunch={() => {}}
          onAttach={() => {}}
          onMigrate={(c) => {
            migrated = c;
            return { ok: true };
          }}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes(`resume: ${id}`));
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("T de novo"));
        proc.kill();
        await waitFor(() => !runningResumeIds().has(id));
        await key(app, "T");
        await waitFor(() => migrated !== undefined);
        expect(migrated).toEqual({ dir: target, runtime: "muse", resume: id });
        await waitFor(() => backed);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("failed migrate stays with an error", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "cccccccc-3333-4333-8333-333333333333";
    const fake = join(target, "muse");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
    });
    let backed = false;
    try {
      await waitFor(() => runningResumeIds().has(id));
      const convo: NativeSession = {
        harness: "muse",
        id,
        dir: target,
        preview: "falhar-me",
        updatedAt: Date.now(),
        file: join(target, "session.jsonl"),
      };
      const app = mount(
        <Running
          target={{ kind: "convo", convo }}
          onBack={() => (backed = true)}
          onQuit={() => {}}
          onLaunch={() => {}}
          onAttach={() => {}}
          onMigrate={() => ({ ok: false, error: "tmux quebrou" })}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes(`resume: ${id}`));
        await key(app, "T");
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("tmux quebrou"));
        await sleep(200);
        expect(backed).toBe(false);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("T T migrates a session via its resume id", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const id = "aaaaaaaa-1111-4111-8111-111111111111";
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake, "resume", id], {
      cwd: target,
      stdout: "ignore",
      stderr: "ignore",
    });
    let migrated: Choice | undefined;
    let backed = false;
    try {
      await waitForLive(proc.pid, `${target}\0codex`);
      const app = mount(
        <Running
          target={{
            kind: "session",
            session: { dir: target, runtime: "codex", last_used: new Date().toISOString(), uses: 1 },
          }}
          onBack={() => (backed = true)}
          onQuit={() => {}}
          onLaunch={() => {}}
          onAttach={() => {}}
          onMigrate={(c) => {
            migrated = c;
            return { ok: true };
          }}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("em execução"));
        expect(app.lastFrame()).toContain("migrar p/ tmux");
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("T de novo"));
        await key(app, "T");
        await waitFor(() => migrated !== undefined);
        expect(migrated).toEqual({ dir: target, runtime: "codex", resume: id });
        await waitFor(() => {
          try {
            process.kill(proc.pid, 0);
            return false;
          } catch {
            return true;
          }
        });
        await waitFor(() => backed);
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("T refuses a session without resume id", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const fake = join(target, "codex");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let migrated: Choice | undefined;
    let backed = false;
    try {
      await waitForLive(proc.pid, `${target}\0codex`);
      const app = mount(
        <Running
          target={{
            kind: "session",
            session: { dir: target, runtime: "codex", last_used: new Date().toISOString(), uses: 1 },
          }}
          onBack={() => (backed = true)}
          onQuit={() => {}}
          onLaunch={() => {}}
          onAttach={() => {}}
          onMigrate={(c) => {
            migrated = c;
            return { ok: true };
          }}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("em execução"));
        expect(app.lastFrame()).toContain("migrar p/ tmux");
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("não tem resume id"));
        expect(app.lastFrame() ?? "").not.toContain("T de novo");
        await key(app, "T");
        await sleep(200);
        expect(migrated).toBeUndefined();
        expect(backed).toBe(false);
        expect(() => process.kill(proc.pid, 0)).not.toThrow(); // untouched
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("T refuses shell sessions", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    const fake = join(target, "shell");
    writeFileSync(fake, "#!/bin/sh\nsleep 30\n");
    chmodSync(fake, 0o755);
    const proc = Bun.spawn([fake], { cwd: target, stdout: "ignore", stderr: "ignore" });
    let migrated: Choice | undefined;
    try {
      await waitFor(() => pidsForKey(target, "shell").includes(proc.pid));
      const app = mount(
        <Running
          target={{
            kind: "session",
            session: { dir: target, runtime: "shell", last_used: new Date().toISOString(), uses: 1 },
          }}
          onBack={() => {}}
          onQuit={() => {}}
          onLaunch={() => {}}
          onAttach={() => {}}
          onMigrate={(c) => {
            migrated = c;
            return { ok: true };
          }}
        />,
      );
      try {
        await waitFrame(app, (f) => f.includes("em execução"));
        await key(app, "T");
        await waitFrame(app, (f) => f.includes("não tem conversa"));
        expect(migrated).toBeUndefined();
        expect(() => process.kill(proc.pid, 0)).not.toThrow();
      } finally {
        app.unmount();
      }
    } finally {
      try {
        proc.kill();
      } catch {
        /* already dead */
      }
      rmSync(fake, { force: true });
    }
  });

  test("running view on an ended session offers to launch", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    let launched: Choice | undefined;
    let back = false;
    const app = mount(
      <Running
        target={{
          kind: "session",
          session: { dir: target, runtime: "codex", last_used: new Date().toISOString(), uses: 1 },
        }}
        onBack={() => (back = true)}
        onQuit={() => {}}
        onLaunch={(c) => (launched = c)}
        onAttach={() => {}}
        onMigrate={() => ({ ok: true })}
      />,
    );
    try {
      // nothing alive for this key: the ended variant with a launch escape hatch
      await waitFrame(app, (f) => f.includes("Sessão encerrada"));
      await key(app, KEY.enter);
      await waitFor(() => launched !== undefined);
      expect(launched).toEqual({ dir: target, runtime: "codex" });
      expect(back).toBe(false);
    } finally {
      app.unmount();
    }
  });

  test("hub shows no mascot art", async () => {
    const { rootA } = setupEnv();
    record(join(rootA, "proj"), "codex");
    const app = mount(<App onDone={() => {}} />);
    try {
      const frame = await waitFrame(app, (f) => f.includes("Recentes"));
      expect(frame).not.toContain("░▓░█░▓░");
      expect(frame).not.toContain("░▒▒▓▓▓▒▒░");
      expect(frame).not.toContain("▒▒▒▒███▒▒▒▒");
      expect(frame).not.toContain("▒▒███▒▒");
      expect(frame).toContain("▸ Recentes · 1"); // layout intact
    } finally {
      app.unmount();
    }
  });

  test("new session via free path reaches runtime", async () => {
    const { rootA } = setupEnv();
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, "n");
      await waitFrame(app, (f) => f.includes("Nova sessão"));
      await key(app, join(rootA, "proj"));
      await key(app, KEY.enter); // choose free path
      await waitFrame(app, (f) => f.includes("Agentes"));
      await key(app, KEY.enter); // first available runtime
      await waitFor(() => done !== undefined);
      expect(done).toEqual({ dir: join(rootA, "proj"), runtime: "codex", fresh: true });
    } finally {
      app.unmount();
    }
  });
});
