/** Rendered-frame fit: at every terminal height a screen can fit, the real
 *  Ink frame must never be taller than the window. An overflowing frame is
 *  fully cleared and redrawn on every render, and the footer boat renders
 *  every 140 ms — that is the flicker/scroll bug this guards. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React, { type ReactElement } from "react";
import { render } from "ink";
import { MIN_LIST_ROWS } from "../src/components/chrome";
import { record } from "../src/history";
import type { NativeSession } from "../src/native/index";
import { pidsForKey, runningResumeIds } from "../src/process";
import Hub from "../src/screens/Hub";
import Running, { runningChromeRows, type RunningTarget, type RunningVariant } from "../src/screens/Running";
import { tmuxBaseName } from "../src/tmux";
import { KEY, sleep, waitFor } from "./ink-helpers";
import { setupFakeTmux, type FakeTmux } from "./tmux-fake";

class Out extends EventEmitter {
  isTTY = true;
  frames: string[] = [];
  constructor(
    public columns: number,
    public rows: number,
  ) {
    super();
  }
  write = (f: string) => {
    this.frames.push(f);
    return true;
  };
}

class In extends EventEmitter {
  isTTY = true;
  private data: string | null = null;
  write = (d: string) => {
    this.data = d;
    this.emit("readable");
    this.emit("data", d);
  };
  read = () => {
    const d = this.data;
    this.data = null;
    return d;
  };
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
}

function mountSized(tree: ReactElement, columns: number, rows: number) {
  const stdout = new Out(columns, rows);
  const stdin = new In();
  const inst = render(tree, {
    stdout: stdout as never,
    stderr: new Out(columns, rows) as never,
    stdin: stdin as never,
    debug: true, // every render writes the whole frame
    exitOnCtrlC: false,
    patchConsole: false,
  });
  return {
    ...inst,
    stdout,
    stdin,
    lastFrame: () => stdout.frames[stdout.frames.length - 1] ?? "",
  };
}

async function waitFrame(app: { lastFrame: () => string }, pred: (f: string) => boolean): Promise<string> {
  await waitFor(() => pred(app.lastFrame()));
  return app.lastFrame();
}

const lines = (frame: string) => frame.replace(/\n$/, "").split("\n").length;
const noop = () => {};

let base = "";
let fake: FakeTmux;
let procs: Array<ReturnType<typeof Bun.spawn>> = [];
const env: Record<string, string | undefined> = {};

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), "atlas-fit-"));
  for (const k of ["ATLAS_HISTORY_FILE", "ATLAS_ROOTS", "ATLAS_CLAUDE_HOME", "ATLAS_CODEX_HOME", "ATLAS_MUSE_HOME", "ATLAS_NO_BOAT"])
    env[k] = process.env[k];
  delete process.env.ATLAS_NO_BOAT; // the boat must be on for this to mean anything
  process.env.ATLAS_HISTORY_FILE = join(base, "history.json");
  process.env.ATLAS_ROOTS = join(base, "@a");
  const empty = join(base, "empty");
  mkdirSync(empty, { recursive: true });
  process.env.ATLAS_CLAUDE_HOME = empty;
  process.env.ATLAS_CODEX_HOME = empty;
  process.env.ATLAS_MUSE_HOME = empty;
});

afterAll(() => {
  for (const p of procs) {
    try {
      p.kill(9);
    } catch {
      /* gone */
    }
  }
  fake?.restore();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(base, { recursive: true, force: true });
});

function project(name: string): string {
  const dir = join(base, "@a", name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function spawnFake(dir: string, bin: string, args: string[]) {
  const path = join(dir, bin);
  writeFileSync(path, "#!/bin/sh\nsleep 60\n");
  chmodSync(path, 0o755);
  const p = Bun.spawn([path, ...args], { cwd: dir, stdout: "ignore", stderr: "ignore" });
  procs.push(p);
  return p;
}

function transcript(dir: string, id: string, n: number): string {
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(
    file,
    Array.from({ length: n }, (_, i) =>
      JSON.stringify({ type: i % 2 ? "assistant" : "user", message: { content: `mensagem ${i + 1} ` + "y".repeat(140) } }),
    ).join("\n") + "\n",
  );
  return file;
}

function convo(id: string, dir: string, file: string): NativeSession {
  return { harness: "claude", id, dir, preview: null, updatedAt: Date.now(), file };
}

interface Case {
  name: string;
  target: () => RunningTarget;
  variant: RunningVariant;
  ready: (f: string) => boolean;
}

describe("rendered frames fit the window", () => {
  const cases: Case[] = [];

  beforeAll(async () => {
    const tmuxDir = project("tmuxed");
    const convoTmuxId = "aaaa0000-0000-4000-8000-000000000001";
    const sessionTmux = tmuxBaseName(tmuxDir, "claude");
    const convoTmux = tmuxBaseName(tmuxDir, "claude", convoTmuxId);
    const pane = Array.from({ length: 80 }, (_, i) => `linha ${i + 1} ` + "x".repeat(150));
    fake = setupFakeTmux([`${sessionTmux}\t0\t1700000000`, `${convoTmux}\t0\t1700000000`], pane);

    const liveDir = project("live");
    const liveId = "bbbb0000-0000-4000-8000-000000000002";
    const liveLog = transcript(liveDir, liveId, 40);
    spawnFake(liveDir, "claude", ["--resume", liveId]);
    const museDir = project("muse-live");
    spawnFake(museDir, "muse", []);
    const deadDir = project("dead");
    await waitFor(() => runningResumeIds().has(liveId) && pidsForKey(museDir, "muse").length > 0);

    const s = (dir: string, runtime: string) => ({ dir, runtime, last_used: new Date().toISOString(), uses: 1 });
    cases.push(
      {
        name: "session, ended",
        target: () => ({ kind: "session", session: s(deadDir, "codex") }),
        variant: { convo: false, ended: true, tmux: false, procs: 0 },
        ready: (f) => f.includes("Sessão encerrada"),
      },
      {
        name: "convo, ended",
        target: () => ({ kind: "convo", convo: convo("cccc0000-0000-4000-8000-000000000003", deadDir, join(deadDir, "x.jsonl")) }),
        variant: { convo: true, ended: true, tmux: false, procs: 0 },
        ready: (f) => f.includes("Sessão encerrada"),
      },
      {
        name: "session in tmux, long pane",
        target: () => ({ kind: "session", session: s(tmuxDir, "claude"), tmux: sessionTmux }),
        variant: { convo: false, ended: false, tmux: true, procs: 0 },
        ready: (f) => f.includes("linha 80"),
      },
      {
        name: "convo in tmux, long pane",
        target: () => ({ kind: "convo", convo: convo(convoTmuxId, tmuxDir, join(tmuxDir, "x.jsonl")), tmux: convoTmux }),
        variant: { convo: true, ended: false, tmux: true, procs: 0 },
        ready: (f) => f.includes("linha 80"),
      },
      {
        name: "live convo outside tmux, long transcript",
        target: () => ({ kind: "convo", convo: convo(liveId, liveDir, liveLog) }),
        variant: { convo: true, ended: false, tmux: false, procs: 1 },
        ready: (f) => f.includes("mensagem 40"),
      },
      {
        name: "live session outside tmux",
        target: () => ({ kind: "session", session: s(museDir, "muse") }),
        variant: { convo: false, ended: false, tmux: false, procs: 1 },
        ready: (f) => f.includes("já está rodando"),
      },
    );
  });

  test("every management-view variant, 13 to 30 rows", async () => {
    expect(cases.length).toBe(6);
    for (const c of cases) {
      // below this even the minimum list cannot fit; the boat stays docked
      const minFit = runningChromeRows(c.variant, 1, {}) + MIN_LIST_ROWS;
      for (let rows = Math.max(13, minFit); rows <= 30; rows++) {
        const app = mountSized(
          <Running target={c.target()} onBack={noop} onQuit={noop} onLaunch={noop} onAttach={noop} onMigrate={() => ({ ok: true })} />,
          100,
          rows,
        );
        try {
          const frame = await waitFrame(app, c.ready);
          await sleep(160); // let a boat tick land too
          const n = lines(app.lastFrame());
          if (n > rows) throw new Error(`${c.name} at ${rows} rows renders ${n} lines:\n${frame}`);
        } finally {
          app.unmount();
        }
      }
    }
  }, 60000);

  test("a 40-column split keeps the resume line on one row", async () => {
    const c = cases.find((x) => x.name === "convo in tmux, long pane")!;
    const app = mountSized(
      <Running target={c.target()} onBack={noop} onQuit={noop} onLaunch={noop} onAttach={noop} onMigrate={() => ({ ok: true })} />,
      40,
      24,
    );
    try {
      await waitFrame(app, c.ready);
      expect(lines(app.lastFrame())).toBeLessThanOrEqual(24);
    } finally {
      app.unmount();
    }
  });

  test("shrinking the window re-budgets the list instead of overflowing", async () => {
    const c = cases.find((x) => x.name === "live convo outside tmux, long transcript")!;
    const app = mountSized(
      <Running target={c.target()} onBack={noop} onQuit={noop} onLaunch={noop} onAttach={noop} onMigrate={() => ({ ok: true })} />,
      100,
      30,
    );
    try {
      await waitFrame(app, c.ready);
      expect(lines(app.lastFrame())).toBeLessThanOrEqual(30);
      app.stdout.rows = 20;
      app.stdout.emit("resize");
      await sleep(400); // a few boat ticks
      expect(lines(app.lastFrame())).toBeLessThanOrEqual(20);
    } finally {
      app.unmount();
    }
  });

  test("the hub, expanded with long rows, 13 to 30 rows", async () => {
    const hubDir = project("a-very-long-project-directory-name-for-the-hub");
    for (let i = 0; i < 12; i++) record(project(`proj-${i}-com-um-nome-bem-comprido-para-o-teste`), "claude");
    const home = join(base, "claude-hub");
    mkdirSync(join(home, "projects", "p"), { recursive: true });
    for (let i = 0; i < 20; i++) {
      writeFileSync(
        join(home, "projects", "p", `dddd${String(i).padStart(4, "0")}-0000-4000-8000-000000000000.jsonl`),
        JSON.stringify({ type: "user", cwd: `/work/${"deep/".repeat(6)}${i}`, message: { content: `pedido ${i} ` + "texto ".repeat(20) } }) + "\n",
      );
    }
    process.env.ATLAS_CLAUDE_HOME = home;
    void hubDir;
    try {
      for (let rows = 13; rows <= 30; rows++) {
        const app = mountSized(
          <Hub onMigrate={() => ({ ok: true })} domains={[{ domain: "@a", repos: 0 }]} onOpen={noop} onViewRunning={noop} onNewSession={noop} onDrill={noop} onQuit={noop} />,
          100,
          rows,
        );
        try {
          await waitFrame(app, (f) => f.includes("Conversas"));
          app.stdin.write(KEY.enter); // expand Recentes
          await sleep(30);
          await waitFrame(app, (f) => f.includes("proj-"));
          await sleep(200); // boat tick + spinner
          const n = lines(app.lastFrame());
          if (n > rows) throw new Error(`hub at ${rows} rows renders ${n} lines:\n${app.lastFrame()}`);
        } finally {
          app.unmount();
        }
      }
    } finally {
      process.env.ATLAS_CLAUDE_HOME = join(base, "empty");
    }
  }, 60000);
});
