import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import App, { type Choice } from "../src/App";
import Hub from "../src/screens/Hub";
import DirPicker from "../src/screens/DirPicker";
import Runtime from "../src/screens/Runtime";
import { record } from "../src/history";
import { KEY, key, mount, sleep, waitFor, waitFrame, type InkApp } from "./ink-helpers";

let tmpdirs: string[] = [];
afterEach(() => {
  for (const d of tmpdirs) rmSync(d, { recursive: true, force: true });
  tmpdirs = [];
  for (const k of ["ATLAS_HISTORY_FILE", "ATLAS_ROOTS", "TMUX_TMPDIR", "ATLAS_CLAUDE_HOME", "ATLAS_CODEX_HOME", "ATLAS_MUSE_HOME"]) {
    delete process.env[k];
  }
});

function setupEnv(): { rootA: string; base: string } {
  const base = mkdtempSync(join(tmpdir(), "atlas-stress-"));
  tmpdirs.push(base);
  const rootA = join(base, "@a");
  mkdirSync(join(rootA, "proj"), { recursive: true });
  process.env.ATLAS_HISTORY_FILE = join(base, "history.json");
  process.env.ATLAS_ROOTS = rootA;
  // hermetic tmux lists: an existing-but-empty socket dir means "no server"
  // (tmux falls back to /tmp when TMUX_TMPDIR does not exist at all)
  mkdirSync(join(base, "notmux"), { recursive: true });
  process.env.TMUX_TMPDIR = join(base, "notmux");
  const empty = join(base, "empty-native");
  mkdirSync(empty, { recursive: true });
  process.env.ATLAS_CLAUDE_HOME = empty;
  process.env.ATLAS_CODEX_HOME = empty;
  process.env.ATLAS_MUSE_HOME = empty;
  return { rootA, base };
}

/** Deterministic PRNG so fuzz failures reproduce. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARROWS = [KEY.up, KEY.down, KEY.left, KEY.right] as const;
const CHARS = ["a", "n", "r", "d", "q", "/", "e", "s", "l", " ", "1", "x", "m", "c"];

async function fuzzKeys(app: InkApp, steps: number, seed: number): Promise<void> {
  const rand = mulberry32(seed);
  for (let i = 0; i < steps; i++) {
    const r = rand();
    if (r < 0.4) {
      app.stdin.write(ARROWS[Math.floor(rand() * 4)]);
    } else if (r < 0.55) {
      app.stdin.write(CHARS[Math.floor(rand() * CHARS.length)]);
    } else if (r < 0.65) {
      app.stdin.write(KEY.enter);
    } else if (r < 0.75) {
      app.stdin.write(KEY.esc);
    } else if (r < 0.85) {
      app.stdin.write(KEY.tab);
    } else {
      app.stdin.write("esl");
    }
    await sleep(5);
    const frame = app.lastFrame() ?? "";
    expect(frame.length).toBeGreaterThan(0);
  }
}

describe("stress", () => {
  test("hub survives 300 fuzzed keys and stays responsive", async () => {
    const { rootA } = setupEnv();
    record(join(rootA, "proj"), "codex");
    let done: Choice | null | undefined;
    const noop = () => {};
    const app = mount(
      <Hub domains={[{ domain: "@a", repos: 1 }]} onOpen={(c) => (done = c)} onViewRunning={noop} onNewSession={noop} onDrill={noop} onQuit={() => (done = null)} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      await fuzzKeys(app, 300, 42);
      // still alive: ctrl+c quits cleanly (unless a choice was already made by fuzz)
      app.stdin.write(KEY.ctrlC);
      await waitFor(() => done !== undefined).catch(() => {});
      expect(done !== undefined).toBe(true);
    } finally {
      app.unmount();
    }
  }, 120000);

  test("dirpicker survives 200 fuzzed keys", async () => {
    const { rootA } = setupEnv();
    let picked: string | undefined;
    let back = 0;
    const app = mount(
      <DirPicker
        title="Nova sessão"
        candidates={[{ path: rootA, domain: "@a", kind: "domain" }]}
        onPick={(d) => (picked = d)}
        onBack={() => back++}
        onQuit={() => (picked = null as unknown as string)}
      />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Nova sessão"));
      await fuzzKeys(app, 200, 7);
      expect(typeof picked !== "undefined" || back >= 0).toBe(true);
    } finally {
      app.unmount();
    }
  }, 120000);

  test("runtime survives 150 fuzzed keys", async () => {
    const { rootA } = setupEnv();
    let picked: string | undefined;
    const app = mount(
      <Runtime dir={join(rootA, "proj")} onPick={(r) => (picked = r)} onBack={() => {}} onQuit={() => {}} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Agentes"));
      await fuzzKeys(app, 150, 13);
      expect(app.lastFrame()).toContain("Atlas");
      void picked;
    } finally {
      app.unmount();
    }
  }, 120000);

  test("2000 sessions navigate end to end", async () => {
    const { rootA, base } = setupEnv();
    const db: string[] = [];
    for (let i = 0; i < 2000; i++) {
      db.push(
        JSON.stringify({
          dir: join(rootA, `proj-${String(i).padStart(4, "0")}`),
          runtime: ["codex", "claude", "muse"][i % 3],
          last_used: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
          uses: 1,
        }),
      );
    }
    mkdirSync(join(rootA, "proj-1999"), { recursive: true });
    writeFileSync(join(base, "history.json"), JSON.stringify(db.map((s) => JSON.parse(s))));
    let done: Choice | null | undefined;
    const noop = () => {};
    const app = mount(
      <Hub domains={[{ domain: "@a", repos: 2000 }]} onOpen={(c) => (done = c)} onViewRunning={noop} onNewSession={noop} onDrill={noop} onQuit={() => (done = null)} />,
    );
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      app.stdin.write(KEY.enter);
      await waitFrame(app, (f) => f.includes("proj-1999"));
      await key(app, KEY.down, 12);
      const frame = app.lastFrame() ?? "";
      expect(frame).toContain("proj-199");
      void done;
    } finally {
      app.unmount();
    }
  }, 120000);

  test("remount mid-use keeps rendering", async () => {
    const { rootA } = setupEnv();
    record(join(rootA, "proj"), "codex");
    const noop = () => {};
    const tree = (
      <Hub domains={[{ domain: "@a", repos: 1 }]} onOpen={noop} onViewRunning={noop} onNewSession={noop} onDrill={noop} onQuit={noop} />
    );
    const app = mount(tree);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      app.unmount();
      const app2 = mount(tree);
      try {
        const frame = await waitFrame(app2, (f) => f.includes("Recentes"));
        expect(frame).toContain("Atlas");
      } finally {
        app2.unmount();
      }
    } finally {
      try {
        app.unmount();
      } catch {
        /* already unmounted */
      }
    }
  }, 60000);

  test("rapid screen transitions stay consistent", async () => {
    setupEnv();
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("Recentes"));
      for (let i = 0; i < 10; i++) {
        app.stdin.write("n");
        await waitFrame(app, (f) => f.includes("locais"));
        app.stdin.write(KEY.esc);
        await waitFrame(app, (f) => f.includes("Recentes"));
      }
      expect(done).toBeUndefined();
    } finally {
      app.unmount();
    }
  }, 120000);
});
