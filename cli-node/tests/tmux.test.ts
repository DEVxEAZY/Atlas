import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  TMUX_PREFIX,
  capturePane,
  hasSession,
  killSession,
  buildTmuxFallback,
  listAtlasSessions,
  matchAtlasSession,
  matchAtlasSessionDeep,
  parseTmuxLs,
  parseTmuxPanes,
  planLaunch,
  shQuote,
  tmuxAvailable,
  tmuxBaseName,
} from "../src/tmux";

describe("tmux names", () => {
  test("base name is deterministic and readable", () => {
    const dir = "/home/dev/proj";
    const hash = createHash("sha1").update(dir).digest("hex").slice(0, 6);
    expect(tmuxBaseName(dir, "codex")).toBe(`atlas-proj-codex-${hash}`);
  });

  test("names sanitize tmux-forbidden characters", () => {
    const name = tmuxBaseName("/home/dev/my.proj:v2 final", "claude");
    expect(name).not.toMatch(/[.: ]/);
    expect(name.startsWith(`${TMUX_PREFIX}my-proj-v2-final-claude-`)).toBe(true);
  });

  test("root dir and resume id are encoded", () => {
    expect(tmuxBaseName("/", "shell")).toMatch(/^atlas-root-shell-[0-9a-f]{6}$/);
    expect(tmuxBaseName("/d", "claude", "11111111-1111-1111-1111-111111111111")).toMatch(
      /^atlas-d-claude-[0-9a-f]{6}-r111111111111$/,
    );
  });

  test("matchAtlasSession finds exact and suffixed sessions", () => {
    const set = new Set(["atlas-proj-codex-aaaaaa", "atlas-proj-codex-aaaaaa-2"]);
    expect(matchAtlasSession(set, "atlas-proj-codex-aaaaaa")).toBe("atlas-proj-codex-aaaaaa");
    expect(matchAtlasSession(new Set(["atlas-proj-codex-aaaaaa-3"]), "atlas-proj-codex-aaaaaa")).toBe(
      "atlas-proj-codex-aaaaaa-3",
    );
    expect(matchAtlasSession(new Set(["atlas-other-x-1"]), "atlas-proj-codex-aaaaaa")).toBeNull();
  });
});

describe("tmux plan", () => {
  const base = { dir: "/tmp/proj", runtime: "codex", argv: ["codex"] };
  const name = tmuxBaseName(base.dir, base.runtime);

  test("no tmux means a direct detached launch", () => {
    const plan = planLaunch({ ...base, tmux: false, nested: false, exists: () => false });
    expect(plan.mode).toBe("direct");
    expect(plan.name).toBeNull();
    expect(plan.directArgv).toEqual(["codex"]);
  });

  test("new session creates detached, then attaches", () => {
    const plan = planLaunch({ ...base, tmux: true, nested: false, exists: () => false });
    expect(plan.mode).toBe("tmux-new");
    expect(plan.name).toBe(name);
    expect(plan.createArgv).toEqual([
      "tmux",
      "new-session",
      "-d",
      "-s",
      name,
      "-c",
      base.dir,
      "'codex'",
    ]);
    expect(plan.attachArgv).toEqual(["tmux", "attach-session", "-t", name]);
  });

  test("nested atlas switches the client instead of attaching", () => {
    const plan = planLaunch({ ...base, tmux: true, nested: true, exists: () => false });
    expect(plan.attachArgv).toEqual(["tmux", "switch-client", "-t", name]);
  });

  test("existing session attaches without creating", () => {
    const plan = planLaunch({ ...base, tmux: true, nested: false, exists: () => true });
    expect(plan.mode).toBe("tmux-attach");
    expect(plan.createArgv).toBeNull();
    expect(plan.attachArgv).toEqual(["tmux", "attach-session", "-t", name]);
  });

  test("fresh bumps the suffix, resume ignores fresh", () => {
    const taken = new Set([name, `${name}-2`]);
    const plan = planLaunch({
      ...base,
      tmux: true,
      nested: false,
      fresh: true,
      exists: (n) => taken.has(n),
    });
    expect(plan.mode).toBe("tmux-new");
    expect(plan.name).toBe(`${name}-3`);
    const resume = planLaunch({
      ...base,
      runtime: "claude",
      argv: ["claude", "--resume", "abc"],
      resume: "abc",
      tmux: true,
      nested: false,
      fresh: true,
      exists: () => true,
    });
    expect(resume.mode).toBe("tmux-attach");
    expect(resume.name).toBe(tmuxBaseName(base.dir, "claude", "abc"));
  });

  test("fresh gives up after -9", () => {
    expect(() =>
      planLaunch({ ...base, tmux: true, nested: false, fresh: true, exists: () => true }),
    ).toThrow();
  });

  test("command argv is shell-quoted as one string", () => {
    const plan = planLaunch({
      ...base,
      argv: ["codex", "resume", "a b'id"],
      tmux: true,
      nested: false,
      exists: () => false,
    });
    expect(plan.createArgv?.at(-1)).toBe(`'codex' 'resume' 'a b'\\''id'`);
  });
});

describe("tmux helpers", () => {
  test("shQuote wraps safely", () => {
    expect(shQuote("abc")).toBe("'abc'");
    expect(shQuote("a b")).toBe("'a b'");
    expect(shQuote("o'clock")).toBe(`'o'\\''clock'`);
  });

  test("execArgv replaces the process image", () => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-exec-"));
    try {
      const marker = join(dir, "marker");
      const proc = Bun.spawnSync([
        process.execPath,
        join(import.meta.dir, "fixtures", "exec-probe.ts"),
        marker,
      ]);
      expect(proc.exitCode).toBe(0);
      const content = readFileSync(marker, "utf-8");
      expect(content).toContain("replaced");
      expect(content).not.toContain("STILL-HERE");
      expect(content).not.toContain("EXEC-FAILED");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("parseTmuxLs keeps atlas sessions only", () => {
    const out =
      "atlas-a-codex-123456\t1\t1700000000\nother\t0\t1700000001\n" +
      "atlas-b-shell-abcdef\t0\t1700000002\ngarbage-line\n";
    const parsed = parseTmuxLs(out);
    expect(parsed).toEqual([
      { name: "atlas-a-codex-123456", attached: true, created: 1700000000 },
      { name: "atlas-b-shell-abcdef", attached: false, created: 1700000002 },
    ]);
    expect(parseTmuxLs("")).toEqual([]);
  });

  test("parseTmuxPanes reads every pane", () => {
    const out =
      "legado\tcodex\t/tmp/proj\natlas-x-shell-abc\tbash\t/tmp\n" + "garbage-line\n";
    expect(parseTmuxPanes(out)).toEqual([
      { session: "legado", command: "codex", path: "/tmp/proj", tty: "" },
      { session: "atlas-x-shell-abc", command: "bash", path: "/tmp", tty: "" },
    ]);
    expect(parseTmuxPanes("")).toEqual([]);
  });
});

const tmuxTest = test.skipIf(!tmuxAvailable());

describe("tmux primitives against a real server", () => {
  tmuxTest("create, list, capture, kill round-trip", async () => {
    const marker = `atlas-probe-${process.pid}`;
    const name = `${TMUX_PREFIX}test-${process.pid}-${Math.floor(Math.random() * 1e6)}`;
    // real server, never the stub: another file may share this process
    const prevBin = process.env.ATLAS_TMUX_BIN;
    delete process.env.ATLAS_TMUX_BIN;
    try {
      expect(hasSession(name)).toBe(false);
      const created = Bun.spawnSync([
        "tmux",
        "new-session",
        "-d",
        "-s",
        name,
        "-c",
        tmpdir(),
        `echo ${marker}; sleep 30`,
      ]);
      expect(created.exitCode).toBe(0);
      expect(hasSession(name)).toBe(true);
      expect(listAtlasSessions().has(name)).toBe(true);
      let seen = false;
      for (let i = 0; i < 20 && !seen; i++) {
        await new Promise((r) => setTimeout(r, 100));
        seen = capturePane(name).join("\n").includes(marker);
      }
      expect(seen).toBe(true);
      expect(killSession(name)).toBe(true);
      expect(hasSession(name)).toBe(false);
    } finally {
      killSession(name);
      if (prevBin === undefined) delete process.env.ATLAS_TMUX_BIN;
      else process.env.ATLAS_TMUX_BIN = prevBin;
    }
  });
});

describe("tmux deep match and tty fallback", () => {
  const sess = (name: string) => ({ name, attached: false, created: 0 });

  test("matchAtlasSessionDeep covers resume-suffixed sessions", () => {
    const base = "atlas-proj-codex-aaaaaa";
    const live = new Map([[`${base}-rabcdef123456`, sess(`${base}-rabcdef123456`)]]);
    expect(matchAtlasSessionDeep(live, base)).toBe(`${base}-rabcdef123456`);
    // -N dup of a resume launch still matches
    const dup = new Map([[`${base}-rabcdef123456-2`, sess(`${base}-rabcdef123456-2`)]]);
    expect(matchAtlasSessionDeep(dup, base)).toBe(`${base}-rabcdef123456-2`);
    // exact and -N keep priority
    const both = new Map([
      [`${base}-rabcdef123456`, sess(`${base}-rabcdef123456`)],
      [base, sess(base)],
    ]);
    expect(matchAtlasSessionDeep(both, base)).toBe(base);
  });

  test("matchAtlasSessionDeep anchors on -r (no longer-hash match)", () => {
    const base = "atlas-proj-codex-aaaaaa";
    // a longer hash sharing the base prefix must NOT match
    const evil = new Map([[`${base}b-r123456789012`, sess(`${base}b-r123456789012`)]]);
    expect(matchAtlasSessionDeep(evil, base)).toBeNull();
    expect(matchAtlasSessionDeep(new Map(), base)).toBeNull();
  });

  test("parseTmuxPanes reads the tty field, old lines stay valid", () => {
    const panes = parseTmuxPanes("legado\tcodex\t/w/proj\t/dev/pts/3\nold\tbash\t/tmp");
    expect(panes).toEqual([
      { session: "legado", command: "codex", path: "/w/proj", tty: "/dev/pts/3" },
      { session: "old", command: "bash", path: "/tmp", tty: "" },
    ]);
  });

  test("buildTmuxFallback links agents to panes by terminal", () => {
    const agents = [
      { pid: 11, dir: "/w/proj", bin: "codex", argv: ["codex", "resume", "id-1"] },
      { pid: 12, dir: "/w/other", bin: "muse", argv: ["muse"] },
      { pid: 13, dir: "/w/gone", bin: "codex", argv: ["codex"] },
    ];
    const panes = [
      { session: "legado", command: "codex", path: "/w/proj", tty: "/dev/pts/3" },
      { session: "vazia", command: "muse", path: "/w/other", tty: "" },
    ];
    const ttyOf = (pid: number) => (pid === 11 ? "/dev/pts/3" : pid === 12 ? "/dev/pts/9" : null);
    const fb = buildTmuxFallback(agents, panes, ttyOf);
    expect(fb.byKey).toEqual(new Map([["/w/proj\0codex", "legado"]]));
    expect(fb.byResume).toEqual(new Map([["id-1", "legado"]]));
  });
});
