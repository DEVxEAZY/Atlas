import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { scanClaude } from "../src/native/claude";
import { scanCodex } from "../src/native/codex";
import { scanMuse } from "../src/native/muse";
import { loadNativeSessions } from "../src/native/index";
import { TRANSCRIPT_PEEK, peekTranscript, readTail } from "../src/native/peek";

const FIX = join(import.meta.dir, "fixtures");

describe("native", () => {
  test("claude parses id, cwd and first prompt", () => {
    const { items: found, total } = scanClaude(join(FIX, "claude"));
    expect(total).toBe(2);
    expect(found).toHaveLength(2);
    const first = found.find((s) => s.id === "11111111-1111-1111-1111-111111111111")!;
    expect(first.harness).toBe("claude");
    expect(first.dir).toBe("/home/dev/@development/Atlas");
    expect(first.preview).toBe("arrumar o bug do filtro na tela inicial");
    const arrayContent = found.find((s) => s.id === "22222222-2222-2222-2222-222222222222")!;
    expect(arrayContent.preview).toBe("revisar o deploy");
  });

  test("codex parses meta and preview index", () => {
    const { items: found, total } = scanCodex(join(FIX, "codex"));
    expect(total).toBe(2);
    const indexed = found.find((s) => s.id === "01a0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee")!;
    expect(indexed.dir).toBe("/home/dev/@megavale-repos/esl-api-server");
    expect(indexed.preview).toBe("agora rode os testes");
  });

  test("codex skips injected blocks for first user text", () => {
    const { items: found } = scanCodex(join(FIX, "codex"));
    const rolled = found.find((s) => s.id === "01a0bbbb-cccc-dddd-eeee-ffffffffffff")!;
    expect(rolled.preview).toBe("consertar o login");
  });

  test("muse parses id from path and nested cwd", () => {
    const { items: found, total } = scanMuse(join(FIX, "muse"));
    expect(total).toBe(1);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe("0199aaaa-0000-0000-0000-000000000000");
    expect(found[0].dir).toBe("/home/dev/@development/Atlas");
  });

  test("muse preview comes from session-index.db", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { Database } = await import("bun:sqlite");
    const base = mkdtempSync(join(tmpdir(), "atlas-muse-"));
    try {
      const home = join(base, "muse");
      mkdirSync(join(home, "sessions", "2026", "09", "19", "sid-1"), { recursive: true });
      await Bun.write(
        join(home, "sessions", "2026", "09", "19", "sid-1", "session.jsonl"),
        '{"cwd":"/tmp/x"}\n',
      );
      const db = new Database(join(home, "session-index.db"));
      db.run(
        `CREATE TABLE sessions (session_id TEXT, msp_first_user_prompt TEXT,
         first_user_prompt TEXT, msp_title TEXT, effective_long_title TEXT, title TEXT)`,
      );
      db.run(`INSERT INTO sessions VALUES ('sid-1', 'revisar o PR', '', '', '', 'New session')`);
      db.close();
      const { items: found } = scanMuse(home);
      expect(found).toHaveLength(1);
      expect(found[0].preview).toBe("revisar o PR");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("oneLine strips leading tags and truncates", async () => {
    const { oneLine } = await import("../src/native/types");
    expect(oneLine("<local-command-caveat>Caveat: the rest")).toBe("Caveat: the rest");
    expect(oneLine("<a><b>hi")).toBe("hi");
    expect(oneLine("x".repeat(100), 10)).toBe("xxxxxxxxx…");
  });

  test("muse ignores nested subagent logs", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const base = mkdtempSync(join(tmpdir(), "atlas-muse-"));
    try {
      const home = join(base, "muse");
      const sessDir = join(home, "sessions", "2026", "09", "19", "sid-1");
      mkdirSync(join(sessDir, "subagent", "child-1"), { recursive: true });
      await Bun.write(join(sessDir, "session.jsonl"), '{"cwd":"/tmp/x"}\n');
      await Bun.write(join(sessDir, "subagent", "child-1", "session.jsonl"), '{"cwd":"/tmp/y"}\n');
      const { items, total } = scanMuse(home);
      expect(total).toBe(1);
      expect(items.map((s) => s.id)).toEqual(["sid-1"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("muse falls back to tui-history for preview", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const base = mkdtempSync(join(tmpdir(), "atlas-muse-"));
    try {
      const home = join(base, "muse");
      mkdirSync(join(home, "sessions", "2026", "09", "19", "sid-9"), { recursive: true });
      await Bun.write(join(home, "sessions", "2026", "09", "19", "sid-9", "session.jsonl"), "{}\n");
      await Bun.write(
        join(home, "tui-history.jsonl"),
        '"revisar o deploy"\n{"project":"/tmp","session":"sid-9"}\n',
      );
      const { items } = scanMuse(home);
      expect(items).toHaveLength(1);
      expect(items[0].preview).toBe("revisar o deploy");
      expect(items[0].dir).toBeNull();
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("muse prefers workspace_root from index for dir", async () => {
    const { mkdtempSync, mkdirSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { Database } = await import("bun:sqlite");
    const base = mkdtempSync(join(tmpdir(), "atlas-muse-"));
    try {
      const home = join(base, "muse");
      mkdirSync(join(home, "sessions", "2026", "09", "19", "sid-2"), { recursive: true });
      await Bun.write(
        join(home, "sessions", "2026", "09", "19", "sid-2", "session.jsonl"),
        '{"cwd":"/tmp/stale"}\n',
      );
      const db = new Database(join(home, "session-index.db"));
      db.run(`CREATE TABLE sessions (session_id TEXT, title TEXT, workspace_root TEXT)`);
      db.run(`INSERT INTO sessions VALUES ('sid-2', 'Do the thing', '/tmp/proj')`);
      db.close();
      const { items } = scanMuse(home);
      expect(items).toHaveLength(1);
      expect(items[0].dir).toBe("/tmp/proj");
      expect(items[0].preview).toBe("Do the thing");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("missing stores return empty", () => {
    expect(scanClaude("/tmp/atlas-nope-1")).toEqual({ items: [], total: 0 });
    expect(scanCodex("/tmp/atlas-nope-2")).toEqual({ items: [], total: 0 });
    expect(scanMuse("/tmp/atlas-nope-3")).toEqual({ items: [], total: 0 });
  });

  test("peekTranscript reads claude turns", () => {
    const file = join(FIX, "claude", "projects", "-test-proj", "11111111-1111-1111-1111-111111111111.jsonl");
    const lines = peekTranscript("claude", file);
    expect(lines).toEqual([
      { role: "você", text: "arrumar o bug do filtro na tela inicial" },
      { role: "agente", text: "ok" },
    ]);
  });

  test("peekTranscript reads codex turns skipping injected blocks", () => {
    const file = join(
      FIX,
      "codex",
      "sessions",
      "2026",
      "09",
      "19",
      "rollout-2026-09-19T06-00-16-01a0bbbb-cccc-dddd-eeee-ffffffffffff.jsonl",
    );
    const lines = peekTranscript("codex", file);
    expect(lines).toEqual([{ role: "você", text: "consertar o login" }]);
  });

  test("peekTranscript is unavailable for muse and missing files", () => {
    expect(TRANSCRIPT_PEEK.muse).toBe(false);
    expect(peekTranscript("muse", join(FIX, "muse", "sessions", "2026", "09", "19", "x", "session.jsonl"))).toEqual([]);
    expect(peekTranscript("claude", "/tmp/atlas-nope-peek.jsonl")).toEqual([]);
    expect(readTail("/tmp/atlas-nope-peek.jsonl", 100)).toBeNull();
  });

  test("loadNativeSessions merges and sorts", () => {
    const prevC = process.env.ATLAS_CLAUDE_HOME;
    const prevX = process.env.ATLAS_CODEX_HOME;
    const prevM = process.env.ATLAS_MUSE_HOME;
    process.env.ATLAS_CLAUDE_HOME = join(FIX, "claude");
    process.env.ATLAS_CODEX_HOME = join(FIX, "codex");
    process.env.ATLAS_MUSE_HOME = join(FIX, "muse");
    try {
      const all = loadNativeSessions();
      expect(all).toHaveLength(5);
      const times = all.map((s) => s.updatedAt);
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    } finally {
      if (prevC === undefined) delete process.env.ATLAS_CLAUDE_HOME;
      else process.env.ATLAS_CLAUDE_HOME = prevC;
      if (prevX === undefined) delete process.env.ATLAS_CODEX_HOME;
      else process.env.ATLAS_CODEX_HOME = prevX;
      if (prevM === undefined) delete process.env.ATLAS_MUSE_HOME;
      else process.env.ATLAS_MUSE_HOME = prevM;
    }
  });
});
