import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "../src/history";
import {
  candidateDisplay,
  convoDisplay,
  convoRows,
  filterCandidates,
  firstItemIndex,
  isTmpDir,
  lastItemIndex,
  matchConvo,
  matchSession,
  moveIndex,
  pickRows,
  sessionDisplay,
  sessionRows,
} from "../src/rows";
import type { NativeSession } from "../src/native/index";

function withRoots<T>(fn: (roots: string[]) => T): T {
  const base = mkdtempSync(join(tmpdir(), "atlas-test-"));
  const a = join(base, "@a");
  const b = join(base, "@b");
  mkdirSync(join(a, "proj"), { recursive: true });
  mkdirSync(b, { recursive: true });
  const prev = process.env.ATLAS_ROOTS;
  process.env.ATLAS_ROOTS = `${a}:${b}`;
  try {
    return fn([a, b]);
  } finally {
    if (prev === undefined) delete process.env.ATLAS_ROOTS;
    else process.env.ATLAS_ROOTS = prev;
    rmSync(base, { recursive: true, force: true });
  }
}

const S = (dir: string, runtime: string, last_used: string, uses = 1): Session => ({
  dir,
  runtime,
  last_used,
  uses,
});

describe("rows", () => {
  test("sessionRows groups by domain ordered by activity", () => {
    withRoots(([a, b]) => {
      const old = S(join(a, "proj"), "codex", "2026-01-01T00:00:00.000Z");
      const recent = S(b, "claude", "2026-09-01T00:00:00.000Z");
      const rows = sessionRows([old, recent]);
      expect(rows[0]).toEqual({ t: "header", label: "@b  ·  1 sessão" });
      expect(rows[1]).toEqual({ t: "session", session: recent });
      expect(rows[2]).toEqual({ t: "header", label: "@a  ·  1 sessão" });
      expect(rows[3]).toEqual({ t: "session", session: old });
    });
  });

  test("sessionRows pins running groups to the top", () => {
    withRoots(([a, b]) => {
      const runningOld = S(join(a, "proj"), "codex", "2026-01-01T00:00:00.000Z");
      const idleNew = S(join(b, "other"), "shell", "2026-09-01T00:00:00.000Z");
      const rows = sessionRows([idleNew, runningOld], (s) => s === runningOld);
      expect(rows[0]).toEqual({ t: "header", label: "@a  ·  1 sessão" });
      expect(rows[1]).toEqual({ t: "session", session: runningOld });
      expect(rows[2]).toEqual({ t: "header", label: "@b  ·  1 sessão" });
      expect(rows[3]).toEqual({ t: "session", session: idleNew });
    });
  });

  test("sessionRows pins running sessions within a domain", () => {
    withRoots(([a]) => {
      const runningOld = S(join(a, "proj"), "codex", "2026-01-01T00:00:00.000Z");
      const idleNew = S(join(a, "other"), "shell", "2026-09-01T00:00:00.000Z");
      const rows = sessionRows([idleNew, runningOld], (s) => s === runningOld);
      expect(rows[0]).toEqual({ t: "header", label: "@a  ·  2 sessões" });
      expect(rows[1]).toEqual({ t: "session", session: runningOld });
      expect(rows[2]).toEqual({ t: "session", session: idleNew });
    });
  });

  test("sessionDisplay uses relative path", () => {
    withRoots(([a]) => {
      expect(sessionDisplay(S(join(a, "group", "proj"), "codex", "x"))).toBe("group/proj");
      expect(sessionDisplay(S("/elsewhere/x", "codex", "x"))).toBe("/elsewhere/x");
    });
  });

  test("matchSession matches words across fields", () => {
    withRoots(([a]) => {
      const s = S(join(a, "proj"), "codex", "x");
      expect(matchSession(s, "")).toBe(true);
      expect(matchSession(s, "codex proj")).toBe(true);
      expect(matchSession(s, "muse")).toBe(false);
    });
  });

  test("filterCandidates ranks name prefix first", () => {
    const repo = { path: "/roots/esl-api-server", domain: "@d", kind: "repo" as const };
    const nested = { path: "/roots/esl-stuff/deep", domain: "@d", kind: "repo" as const };
    expect(filterCandidates([nested, repo], "esl-a")).toEqual([repo]);
    expect(filterCandidates([repo, nested], "")).toEqual([repo, nested]);
    expect(filterCandidates([repo, nested], "zzz")).toEqual([]);
  });

  test("candidateDisplay nested relative and domain root", () => {
    withRoots(([a]) => {
      expect(
        candidateDisplay({ path: join(a, "group", "proj"), domain: "@a", kind: "repo" }),
      ).toBe("group/proj");
      expect(candidateDisplay({ path: a, domain: "@a", kind: "domain" })).toBe("⌂ raiz do domínio");
    });
  });

  test("pickRows offers free path first", () => {
    withRoots(([a]) => {
      const rows = pickRows([], a);
      expect(rows[0]).toEqual({ t: "free", path: a });
    });
  });

  test("convoRows groups by harness with caps", () => {
    const mk = (harness: "claude" | "codex" | "muse", id: string, updatedAt: number): NativeSession => ({
      harness,
      id,
      dir: "/x",
      preview: null,
      updatedAt,
      file: "/f",
    });
    const rows = convoRows(
      [mk("codex", "c1", 3), mk("claude", "a1", 2), mk("claude", "a2", 1)],
      1,
    );
    expect(rows[0]).toEqual({ t: "header", label: "✳ Claude  ·  1 de 2" });
    expect(rows[1]).toEqual({ t: "convo", convo: expect.objectContaining({ id: "a1" }) });
    expect(rows[2]).toEqual({ t: "header", label: "⬢ Codex  ·  1" });
    expect(rows[3]).toEqual({ t: "convo", convo: expect.objectContaining({ id: "c1" }) });
  });

  test("matchConvo and convoDisplay", () => {
    withRoots(([a]) => {
      const c: NativeSession = {
        harness: "muse",
        id: "abc123",
        dir: `${a}/proj`,
        preview: "fix the filter",
        updatedAt: 1,
        file: "/f",
      };
      expect(matchConvo(c, "muse filter")).toBe(true);
      expect(matchConvo(c, "codex")).toBe(false);
      expect(convoDisplay(c)).toBe("proj");
      expect(convoDisplay({ ...c, dir: null })).toBe("—");
    });
  });

  test("isTmpDir matches scratch dirs only", () => {
    expect(isTmpDir("/tmp/other")).toBe(true);
    expect(isTmpDir("/tmp")).toBe(true);
    expect(isTmpDir("/tmpother")).toBe(false);
    expect(isTmpDir("/home/dev/proj")).toBe(false);
    expect(isTmpDir("")).toBe(false);
    expect(isTmpDir(null)).toBe(false);
    expect(isTmpDir(undefined)).toBe(false);
  });

  test("moveIndex skips headers and clamps", () => {
    const rows = [
      { t: "header", label: "h" },
      { t: "item", v: 1 },
      { t: "header", label: "h2" },
      { t: "item", v: 2 },
    ];
    expect(firstItemIndex(rows)).toBe(1);
    expect(lastItemIndex(rows)).toBe(3);
    expect(moveIndex(rows, 1, 1)).toBe(3);
    expect(moveIndex(rows, 3, 1)).toBe(3);
    expect(moveIndex(rows, 3, -1)).toBe(1);
    expect(moveIndex(rows, 1, -1)).toBe(1);
    expect(firstItemIndex([{ t: "header", label: "x" }])).toBeNull();
  });
});
