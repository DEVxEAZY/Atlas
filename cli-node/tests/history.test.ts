import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load, record, rekeyRuntime, remove } from "../src/history";

function withHistory<T>(fn: (db: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "atlas-test-"));
  const prev = process.env.ATLAS_HISTORY_FILE;
  const db = join(dir, "history.json");
  process.env.ATLAS_HISTORY_FILE = db;
  try {
    return fn(db);
  } finally {
    if (prev === undefined) delete process.env.ATLAS_HISTORY_FILE;
    else process.env.ATLAS_HISTORY_FILE = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("history", () => {
  test("record and load order", () => {
    withHistory(() => {
      record("/tmp/atlas-a", "codex");
      record("/tmp/atlas-b", "claude");
      const sessions = load();
      expect(sessions.map((s) => s.dir)).toEqual(["/tmp/atlas-b", "/tmp/atlas-a"]);
      expect(sessions[0].runtime).toBe("claude");
    });
  });

  test("record bumps and counts uses", () => {
    withHistory(() => {
      record("/tmp/atlas-x", "codex");
      record("/tmp/atlas-x", "codex");
      const sessions = load();
      expect(sessions).toHaveLength(1);
      expect(sessions[0].uses).toBe(2);
    });
  });

  test("load missing and corrupt", () => {
    withHistory((db) => {
      expect(load(db + ".nope")).toEqual([]);
      writeFileSync(db, "{not json");
      expect(load(db)).toEqual([]);
    });
  });

  test("load skips invalid entries", () => {
    withHistory((db) => {
      writeFileSync(db, JSON.stringify([{ dir: "/x", runtime: "codex" }, { dir: "/y" }]));
      expect(load(db)).toEqual([]);
    });
  });

  test("load keeps file order on timestamp ties", () => {
    withHistory((db) => {
      writeFileSync(
        db,
        JSON.stringify([
          { dir: "/new", runtime: "codex", last_used: "2026-09-19T12:00:00.000Z", uses: 1 },
          { dir: "/old", runtime: "codex", last_used: "2026-09-19T12:00:00.000Z", uses: 1 },
        ]),
      );
      expect(load(db).map((s) => s.dir)).toEqual(["/new", "/old"]);
    });
  });

  test("remove", () => {
    withHistory(() => {
      record("/tmp/atlas-r", "codex");
      expect(remove("/tmp/atlas-r", "codex")).toBe(true);
      expect(load()).toEqual([]);
      expect(remove("/tmp/atlas-r", "codex")).toBe(false);
    });
  });

  test("rekeyRuntime switches runtime in place", () => {
    withHistory(() => {
      record("/tmp/atlas-k", "codex");
      record("/tmp/atlas-k", "codex");
      const before = load()[0];
      expect(rekeyRuntime("/tmp/atlas-k", "codex", "claude")).toBe(true);
      const after = load();
      expect(after).toHaveLength(1);
      expect(after[0].runtime).toBe("claude");
      expect(after[0].uses).toBe(2); // counts preserved
      expect(after[0].last_used).toBe(before.last_used); // recency preserved
      expect(rekeyRuntime("/tmp/atlas-k", "codex", "muse")).toBe(false); // old key gone
    });
  });

  test("rekeyRuntime drops into the existing target key", () => {
    withHistory(() => {
      record("/tmp/atlas-m", "codex");
      record("/tmp/atlas-m", "claude");
      expect(rekeyRuntime("/tmp/atlas-m", "codex", "claude")).toBe(true);
      const after = load();
      expect(after).toHaveLength(1);
      expect(after[0].runtime).toBe("claude");
    });
  });
});
