import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import App, { type Choice } from "../src/App";
import { load, record } from "../src/history";
import { TMUX_MARK } from "../src/theme";
import { tmuxBaseName } from "../src/tmux";
import { KEY, key, mount, waitFor, waitFrame } from "./ink-helpers";
import { fakeCalls, setupFakeTmux, writeFakePane, type FakeTmux } from "./tmux-fake";

let tmpdirs: string[] = [];
let fakes: FakeTmux[] = [];
afterEach(() => {
  for (const d of tmpdirs) rmSync(d, { recursive: true, force: true });
  tmpdirs = [];
  for (const f of fakes) f.restore();
  fakes = [];
  delete process.env.ATLAS_HISTORY_FILE;
  delete process.env.ATLAS_ROOTS;
  delete process.env.ATLAS_CLAUDE_HOME;
  delete process.env.ATLAS_CODEX_HOME;
  delete process.env.ATLAS_MUSE_HOME;
});

function setupEnv(): { rootA: string } {
  const base = mkdtempSync(join(tmpdir(), "atlas-tmux-tui-"));
  tmpdirs.push(base);
  const rootA = join(base, "@a");
  mkdirSync(join(rootA, "proj"), { recursive: true });
  process.env.ATLAS_HISTORY_FILE = join(base, "history.json");
  process.env.ATLAS_ROOTS = rootA;
  const empty = join(base, "empty-native");
  mkdirSync(empty, { recursive: true });
  process.env.ATLAS_CLAUDE_HOME = empty;
  process.env.ATLAS_CODEX_HOME = empty;
  process.env.ATLAS_MUSE_HOME = empty;
  return { rootA };
}

describe("tmux-managed sessions", () => {
  test("hub marks, views, refreshes, attaches and kills a tmux session", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const name = tmuxBaseName(target, "codex");
    const fake = setupFakeTmux([`${name}\t0\t1700000000`], ["agente digitando…", "linha 2"]);
    fakes.push(fake);

    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      // marked live row, auto-expanded (tmux counts as running)
      const marked = await waitFrame(app, (f) => f.includes(TMUX_MARK));
      expect(marked).toContain("proj");
      await key(app, KEY.enter); // snap sits on the agora row: manage view
      const view = await waitFrame(app, (f) => f.includes(`Sessão em execução · ${name}`));
      expect(view).toContain(TMUX_MARK);
      expect(view).toContain("agente digitando…");
      expect(view).toContain("entrar");
      // attach hands a Choice to main (which exits Atlas onto tmux attach)
      await key(app, KEY.enter);
      await waitFor(() => done !== undefined);
      expect(done).toEqual({ dir: target, runtime: "codex", attachTmux: name });
      // back out, refresh the pane, then kill the session for real
      await key(app, KEY.esc);
      await waitFrame(app, (f) => f.includes("Recentes"));
      await key(app, KEY.enter); // snap sits on the agora row
      await waitFrame(app, (f) => f.includes(`Sessão em execução · ${name}`));
      writeFakePane(fake, ["nova leitura do painel"]);
      await key(app, "r");
      await waitFrame(app, (f) => f.includes("nova leitura do painel"));
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("de novo"));
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("▸ Recentes · 1") && !f.includes(TMUX_MARK));
      expect(fakeCalls(fake)).toContain(`kill-session -t ${name}`);
    } finally {
      app.unmount();
    }
  });

  test("hub kills a tmux session with X X", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const name = tmuxBaseName(target, "codex");
    const fake = setupFakeTmux([`${name}\t0\t1700000000`], ["pane…"]);
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes(TMUX_MARK));
      await key(app, "X"); // snap sits on the agora row
      await waitFrame(app, (f) => f.includes("X de novo"));
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("encerrada") && !f.includes(TMUX_MARK));
      expect(fakeCalls(fake)).toContain(`kill-session -t ${name}`);
    } finally {
      app.unmount();
    }
  });

  test("d refuses to drop a running tmux session from history", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const name = tmuxBaseName(target, "codex");
    const fake = setupFakeTmux([`${name}\t0\t1700000000`], ["pane…"]);
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes(TMUX_MARK));
      await key(app, "d"); // snap sits on the agora row
      await waitFrame(app, (f) => f.includes("X encerra antes de remover"));
      expect(load()).toHaveLength(1);
      expect(fakeCalls(fake)).not.toContain(`kill-session -t ${name}`);
    } finally {
      app.unmount();
    }
  });

  test("hub lists unmanaged tmux sessions", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "shell"); // idle: no live process, no tmux match
    const fake = setupFakeTmux(
      ["atlas-orphan-shell-xyz\t0\t1700000000"],
      ["pane…"],
      [
        `atlas-orphan-shell-xyz\tbash\t${target}`,
        `legado\tcodex\t${target}`,
        "guardados\tbash\t/tmp",
      ],
    );
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      const frame = await waitFrame(
        app,
        (f) => f.includes("sessões tmux") && f.includes("legado"),
      );
      expect(frame).toContain("atlas-orphan-shell-xyz"); // orphan: owned namespace
      expect(frame).not.toContain("guardados"); // idle foreign shell: out of the way
    } finally {
      app.unmount();
    }
  });

  test("hub hides tmux sessions already shown", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const name = tmuxBaseName(target, "codex");
    const fake = setupFakeTmux([`${name}\t0\t1700000000`], ["pane…"], [`${name}\tcodex\t${target}`]);
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      const frame = await waitFrame(app, (f) => f.includes(TMUX_MARK));
      expect(frame).not.toContain("sessões tmux");
    } finally {
      app.unmount();
    }
  });

  test("hub kills unmanaged tmux sessions with X X", async () => {
    setupEnv(); // empty history: tmux rows sit right after the toggles
    const fake = setupFakeTmux(
      ["atlas-orphan-shell-xyz\t0\t1700000000", "legado\t0\t1700000000"],
      ["pane…"],
      ["atlas-orphan-shell-xyz\tbash\t/tmp", "legado\tcodex\t/tmp/proj"],
    );
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      await waitFrame(app, (f) => f.includes("legado"));
      await key(app, KEY.down);
      await key(app, KEY.down); // first stray: agent runtimes sort first
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("tmux 'legado'"));
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("'legado' encerrada"));
      await key(app, "X");
      await waitFrame(app, (f) => f.includes("tmux 'atlas-orphan-shell-xyz'"));
      await key(app, "X");
      await waitFrame(app, (f) => !f.includes("sessões tmux"));
      expect(fakeCalls(fake)).toContain("kill-session -t legado");
      expect(fakeCalls(fake)).toContain("kill-session -t atlas-orphan-shell-xyz");
    } finally {
      app.unmount();
    }
  });

  test("hub enters an unmanaged tmux session", async () => {
    setupEnv();
    const fake = setupFakeTmux(
      ["legado\t0\t1700000000"],
      ["linha do painel"],
      ["legado\tcodex\t/tmp/proj"],
    );
    fakes.push(fake);
    let done: Choice | null | undefined;
    const app = mount(<App onDone={(c) => (done = c)} />);
    try {
      await waitFrame(app, (f) => f.includes("legado"));
      await key(app, KEY.down);
      await key(app, KEY.down);
      await key(app, KEY.enter);
      const view = await waitFrame(app, (f) => f.includes("Sessão em execução · legado"));
      expect(view).toContain("linha do painel");
      await key(app, KEY.enter);
      await waitFor(() => done !== undefined);
      expect(done).toEqual({ dir: "/tmp/proj", runtime: "codex", attachTmux: "legado" });
    } finally {
      app.unmount();
    }
  });

  test("hub marks tmux-backed native convos", async () => {
    const { rootA } = setupEnv();
    const fix = join(import.meta.dir, "fixtures");
    process.env.ATLAS_CLAUDE_HOME = join(fix, "claude");
    process.env.ATLAS_CODEX_HOME = join(fix, "codex");
    process.env.ATLAS_MUSE_HOME = join(fix, "muse");
    void rootA;
    const id = "11111111-1111-1111-1111-111111111111"; // claude "arrumar o bug"
    const name = tmuxBaseName("/home/dev/@development/Atlas", "claude", id);
    const fake = setupFakeTmux([`${name}\t1\t1700000000`], ["pane…"]);
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      // convos auto-expand on the tmux-live resume; the row carries the mark
      const frame = await waitFrame(
        app,
        (f) => f.includes(TMUX_MARK) && f.includes("arrumar o bug"),
      );
      expect(frame).toContain(TMUX_MARK);
    } finally {
      app.unmount();
    }
  });

  test("hub marks a session row for a resume-suffixed tmux session", async () => {
    const { rootA } = setupEnv();
    const target = join(rootA, "proj");
    record(target, "codex");
    const id = "aaaaaaaa-1111-4111-8111-111111111111";
    const name = tmuxBaseName(target, "codex", id); // atlas-proj-codex-<hash>-r<id12>
    const fake = setupFakeTmux([`${name}\t0\t1700000000`], ["pane…"], [`${name}\tcodex\t${target}`]);
    fakes.push(fake);
    const app = mount(<App onDone={() => {}} />);
    try {
      // the session row (no resume of its own) still matches the -r name
      const marked = await waitFrame(app, (f) => f.includes(TMUX_MARK));
      expect(marked).toContain("proj");
      expect(marked).not.toContain("sessões tmux"); // represented, not a stray
      await key(app, KEY.enter); // snap sits on the agora row: manage view
      const view = await waitFrame(app, (f) => f.includes(`Sessão em execução · ${name}`));
      expect(view).toContain("entrar");
    } finally {
      app.unmount();
    }
  });
});
