import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanClaude } from "../src/native/claude";
import { CODEX_META_BYTES, parseCodexMeta, scanCodex } from "../src/native/codex";
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

/** Synthetic Codex stores: a valid rollout next to partially written or
 *  malformed ones must keep the valid rollout listed and never throw. */

const codexBase = mkdtempSync(join(tmpdir(), "atlas-codex-partial-"));
afterAll(() => rmSync(codexBase, { recursive: true, force: true }));

function meta(id: string, cwd: string, instructions = "be helpful"): string {
  return JSON.stringify({
    timestamp: "2026-09-22T10:00:00.000Z",
    type: "session_meta",
    payload: { session_id: id, id, timestamp: "2026-09-22T10:00:00.000Z", cwd, base_instructions: instructions },
  });
}

function user(text: string): string {
  return JSON.stringify({ type: "response_item", payload: { role: "user", content: [{ type: "input_text", text }] } });
}

function store(name: string, files: Record<string, string>): string {
  const home = join(codexBase, name);
  const day = join(home, "sessions", "2026", "09", "22");
  mkdirSync(day, { recursive: true });
  let t = 1_790_000_000;
  for (const [file, body] of Object.entries(files)) {
    const path = join(day, file);
    writeFileSync(path, body);
    utimesSync(path, t, t); // deterministic newest-first order
    t += 60;
  }
  return home;
}

const VALID = "01a0cccc-0000-0000-0000-000000000001";

describe("codex partial records", () => {
  test("a malformed index line does not hide a valid index preview", () => {
    const home = store("index", {
      "rollout-quiet.jsonl": `${meta(VALID, "/work/quiet")}\n`, // no user message yet
    });
    writeFileSync(
      join(home, "history.jsonl"),
      `{"session_id":"${VALID}","ts":1,"text":"cortada\n` +
        `not json\n` +
        `${JSON.stringify({ session_id: VALID, ts: 2, text: "preview do índice" })}\n`,
    );
    const { items } = scanCodex(home);
    expect(items.map((i) => [i.id, i.preview])).toEqual([[VALID, "preview do índice"]]);
  });

  test("torn and malformed rollouts are skipped beside a valid one", () => {
    const full = meta("01a0cccc-0000-0000-0000-000000000002", "/work/torn");
    const home = store("mixed", {
      "rollout-valid.jsonl": `${meta(VALID, "/work/ok")}\n${user("revisar o parser")}\n`,
      "rollout-torn.jsonl": full.slice(0, Math.floor(full.length / 2)),
      "rollout-garbage.jsonl": "not json at all\n",
      "rollout-empty.jsonl": "",
      "rollout-other-type.jsonl": `${JSON.stringify({ type: "event_msg", payload: { id: "x" } })}\n`,
    });
    const { items, total } = scanCodex(home);
    expect(total).toBe(5); // every rollout file counts, parsed or not
    expect(items.map((i) => i.id)).toEqual([VALID]);
    expect(items[0].dir).toBe("/work/ok");
    expect(items[0].preview).toBe("revisar o parser");
  });

  test("a half-written trailing record keeps the session and its preview", () => {
    const tail = user("linha interrompida no meio");
    const home = store("trailing", {
      "rollout-live.jsonl": `${meta(VALID, "/work/live")}\n${user("primeira mensagem")}\n${tail.slice(0, 20)}`,
    });
    const { items } = scanCodex(home);
    expect(items).toHaveLength(1);
    expect(items[0].dir).toBe("/work/live");
    expect(items[0].preview).toBe("primeira mensagem");
  });

  test("a session_meta line larger than the read window is still identified", () => {
    const huge = `quote " and \\ backslash, fake "cwd":"/nope" ` + "x".repeat(CODEX_META_BYTES * 2);
    const home = store("oversized", {
      "rollout-big.jsonl": `${meta(VALID, "/work/big dir", huge)}\n${user("oi")}\n`,
    });
    const file = join(home, "sessions", "2026", "09", "22", "rollout-big.jsonl");
    expect(parseCodexMeta(file)).toEqual({ id: VALID, sessionId: VALID, cwd: "/work/big dir" });
    const { items } = scanCodex(home);
    expect(items.map((i) => [i.id, i.dir])).toEqual([[VALID, "/work/big dir"]]);
  });

  test("a torn line shorter than the window is not guessed at", () => {
    const full = meta(VALID, "/work/torn");
    const home = store("short-torn", { "rollout.jsonl": full.slice(0, full.indexOf("base_instructions")) });
    expect(parseCodexMeta(join(home, "sessions", "2026", "09", "22", "rollout.jsonl"))).toBeNull();
  });
});

describe("claude injected turns", () => {
  const home = mkdtempSync(join(tmpdir(), "atlas-claude-meta-"));
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const id = "33333333-3333-3333-3333-333333333333";
  const file = join(home, "projects", "-work-app", `${id}.jsonl`);
  const turn = (message: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ type: "user", cwd: "/work/app", message, ...extra });
  mkdirSync(join(home, "projects", "-work-app"), { recursive: true });
  writeFileSync(
    file,
    [
      turn({ role: "user", content: "<local-command-caveat>Caveat: generated by commands</local-command-caveat>" }, { isMeta: true }),
      turn({ role: "user", content: "<command-name>/effort</command-name>\n<command-message>effort</command-message>" }),
      turn({ role: "user", content: "<local-command-stdout>Set effort</local-command-stdout>" }),
      turn({ role: "user", content: "# Skill body loaded by the harness" }, { isMeta: true }),
      turn({ role: "user", content: [{ type: "text", text: "<ide_selection>x</ide_selection>\nconsertar o cron" }] }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "feito" }] } }),
    ].join("\n") + "\n",
  );

  test("preview skips caveats, command echoes and meta turns", () => {
    const { items } = scanClaude(home);
    expect(items.map((i) => [i.id, i.dir, i.preview])).toEqual([[id, "/work/app", "consertar o cron"]]);
  });

  test("peek shows typed turns only", () => {
    expect(peekTranscript("claude", file)).toEqual([
      { role: "você", text: "consertar o cron" },
      { role: "agente", text: "feito" },
    ]);
  });

  test("cwd and prompt past the first 64 KB are still found", () => {
    const big = join(home, "projects", "-work-app", "44444444-4444-4444-4444-444444444444.jsonl");
    writeFileSync(
      big,
      [
        JSON.stringify({ type: "attachment", content: "x".repeat(200_000) }),
        turn({ role: "user", content: "prompt depois do anexo" }),
      ].join("\n") + "\n",
    );
    try {
      const found = scanClaude(home).items.find((i) => i.id.startsWith("4444"))!;
      expect([found.dir, found.preview]).toEqual(["/work/app", "prompt depois do anexo"]);
    } finally {
      rmSync(big);
    }
  });

  test("typedText strips leading tag blocks and keeps plain text", async () => {
    const { typedText } = await import("../src/native/types");
    expect(typedText("<a>1</a> <b-c k=v>2</b-c>\n oi")).toBe("oi");
    expect(typedText("<a>only</a>")).toBeNull();
    expect(typedText("<unclosed> texto")).toBeNull();
    expect(typedText("use <b>isso</b>")).toBe("use <b>isso</b>");
  });
});
