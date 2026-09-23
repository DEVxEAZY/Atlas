import { afterEach, describe, expect, test } from "bun:test";
import { AI_MODEL, AiError, aiKey, askMessages, chat, describe as describeSnap, noteMessages, oneLine, redact, wrap, type AiSnapshot } from "../src/ai";

afterEach(() => {
  delete process.env.OPENROUTER_API_KEY;
});

const snap: AiSnapshot = {
  now: "23/09/2026 19:00",
  sessions: [
    { runtime: "claude", dir: "~/p/atlas", title: "melhorar o barco", running: true, tmux: "atlas-p", screen: ["$ bun test", "212 pass", "export TOKEN=abcd1234efgh"] },
    { runtime: "codex", dir: "~/p/api", title: null, running: false },
  ],
  cron: { active: 1, pending: 0, next: "hoje 21:00" },
  totals: { sessions: 13 },
};

describe("what is sent", () => {
  test("secrets are redacted before anything leaves", () => {
    const text = redact(
      "key sk-or-v1-0123456789abcdef token: ghp_ABCDEFGHIJKLMNOP1234 password=hunter22 Bearer abc.def.ghijklmnopqrstu AKIAABCDEFGHIJKLMNOP",
    );
    for (const secret of ["0123456789abcdef", "ABCDEFGHIJKLMNOP1234", "hunter22", "ghijklmnopqrstu", "AKIAABCDEFGHIJKLMNOP"])
      expect(text).not.toContain(secret);
    expect(describeSnap(snap)).not.toContain("abcd1234efgh");
  });

  test("the context names sessions, titles and schedule, and caps screens", () => {
    const d = describeSnap({ ...snap, sessions: [{ ...snap.sessions[0], screen: Array(500).fill("x".repeat(40)) }] }, 300);
    expect(d).toContain("claude em ~/p/atlas");
    expect(d).toContain("melhorar o barco");
    expect(d).toContain("próxima hoje 21:00");
    expect(d.length).toBeLessThan(900);
  });

  test("a question carries the focused session's screen", () => {
    const m = askMessages(snap, "o que falta?", { ...snap.sessions[0], screen: ["erro: falta dependência"] });
    expect(m.at(-1)!.content).toContain("erro: falta dependência");
    expect(m.at(-1)!.content).toContain("o que falta?");
    expect(noteMessages(snap).at(-1)!.content).toContain("UMA linha");
  });
});

test("the key comes from the environment first, then the key file", () => {
  const { writeFileSync, rmSync } = require("node:fs") as typeof import("node:fs");
  const file = process.env.ATLAS_OPENROUTER_KEY_FILE!;
  expect(aiKey()).toBeNull();
  writeFileSync(file, "sk-from-file\n");
  expect(aiKey()).toBe("sk-from-file");
  process.env.OPENROUTER_API_KEY = "sk-from-env";
  expect(aiKey()).toBe("sk-from-env");
  rmSync(file);
});

describe("chat", () => {
  const ok = (content: string) =>
    (async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })) as unknown as typeof fetch;

  test("no key: a clear message, no request", async () => {
    let called = false;
    const f = (async () => ((called = true), new Response("{}"))) as unknown as typeof fetch;
    await expect(chat(noteMessages(snap), { maxTokens: 10, fetchImpl: f })).rejects.toThrow("OPENROUTER_API_KEY");
    expect(called).toBe(false);
  });

  test("sends the model, the key and the messages; returns the text", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    let seen: { url: string; init: RequestInit } | null = null;
    const f = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(JSON.stringify({ choices: [{ message: { content: " tudo calmo " } }] }));
    }) as unknown as typeof fetch;
    expect(await chat(noteMessages(snap), { maxTokens: 50, fetchImpl: f })).toBe("tudo calmo");
    expect(seen!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const body = JSON.parse(String(seen!.init.body));
    expect(body.model).toBe(AI_MODEL);
    expect(AI_MODEL).toBe("deepseek/deepseek-v4-flash");
    expect(body.max_tokens).toBe(50);
    expect(body.reasoning).toEqual({ enabled: false }); // the note answers straight away
  });

  test("HTTP failures become short reasons", async () => {
    process.env.OPENROUTER_API_KEY = "sk-test";
    const status = (n: number) => (async () => new Response("", { status: n })) as unknown as typeof fetch;
    await expect(chat([], { maxTokens: 5, fetchImpl: status(401) })).rejects.toThrow("recusada");
    await expect(chat([], { maxTokens: 5, fetchImpl: status(402) })).rejects.toThrow("créditos");
    await expect(chat([], { maxTokens: 5, fetchImpl: status(429) })).rejects.toThrow("limite");
    await expect(chat([], { maxTokens: 5, fetchImpl: ok("") })).rejects.toBeInstanceOf(AiError);
  });
});

test("the note is one clean line; answers wrap to the width", () => {
  expect(oneLine('"**Dois** agentes\n rodando"')).toBe("Dois agentes rodando");
  expect(oneLine("x".repeat(200), 20)).toHaveLength(20);
  expect(oneLine("Oi! 👋 tudo certo ✅")).toBe("Oi! tudo certo");
  const lines = wrap("um dois tres quatro cinco seis sete oito nove dez", 12, 3);
  expect(lines).toHaveLength(3);
  for (const l of lines) expect([...l].length).toBeLessThanOrEqual(12);
});
