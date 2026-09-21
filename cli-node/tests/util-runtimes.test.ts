import { describe, expect, test } from "bun:test";
import { cycleRuntime, getRuntime, isAvailable } from "../src/runtimes";
import { ago, shorten } from "../src/util";

describe("util", () => {
  test("ago pt-BR", () => {
    const now = new Date("2026-09-19T12:00:00.000Z");
    expect(ago(now.toISOString(), now)).toBe("agora");
    expect(ago(new Date(now.getTime() - 5 * 60_000).toISOString(), now)).toBe("há 5 min");
    expect(ago(new Date(now.getTime() - 3 * 3600_000).toISOString(), now)).toBe("há 3 h");
    expect(ago(new Date(now.getTime() - 2 * 86400_000).toISOString(), now)).toBe("há 2 d");
    expect(ago("not-a-date", now)).toBe("not-a-date");
  });

  test("ago accepts python-style offset", () => {
    const now = new Date("2026-09-19T12:00:00.000Z");
    expect(ago("2026-09-19T11:55:00+00:00", now)).toBe("há 5 min");
  });

  test("shorten home", () => {
    const home = process.env.HOME!;
    expect(shorten(home)).toBe("~");
    expect(shorten(home + "/a/b")).toBe("~/a/b");
    expect(shorten("/elsewhere/x")).toBe("/elsewhere/x");
  });
});

describe("runtimes", () => {
  test("registry", () => {
    expect(getRuntime("codex").argv).toEqual(["codex"]);
    expect(getRuntime("shell").label).toBe("Terminal");
    expect(() => getRuntime("nope")).toThrow();
    expect(isAvailable(getRuntime("shell"))).toBe(true);
  });

  test("cycle wraps and recovers", () => {
    expect(cycleRuntime("codex")).toBe("claude");
    expect(cycleRuntime("shell")).toBe("codex");
    expect(cycleRuntime("unknown")).toBe("codex");
  });
});
