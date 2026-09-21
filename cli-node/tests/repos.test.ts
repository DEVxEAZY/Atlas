import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { classify, discover, splitDomain } from "../src/repos";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "atlas-test-"));
}

describe("repos", () => {
  test("discover lists domain repos and dirs", () => {
    const base = tmpRoot();
    try {
      const root = join(base, "@fake");
      mkdirSync(join(root, "my-repo", ".git"), { recursive: true });
      mkdirSync(join(root, "plain"), { recursive: true });
      mkdirSync(join(root, ".hidden"), { recursive: true });
      const found = discover([root]);
      const byName = new Map(found.map((c) => [basename(c.path), c]));
      expect(byName.get("@fake")?.kind).toBe("domain");
      expect(byName.get("my-repo")?.kind).toBe("repo");
      expect(byName.get("plain")?.kind).toBe("dir");
      expect(byName.has(".hidden")).toBe(false);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("discover finds nested repos at depth 2", () => {
    const base = tmpRoot();
    try {
      const root = join(base, "@fake");
      mkdirSync(join(root, "group", "nested", ".git"), { recursive: true });
      const found = discover([root], 2);
      const kinds = new Map(found.map((c) => [c.path, c.kind]));
      expect(kinds.get(join(root, "group", "nested"))).toBe("repo");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("discover skips missing roots", () => {
    expect(discover([join(tmpRoot(), "nope")])).toEqual([]);
  });

  test("splitDomain relative and root", () => {
    const base = tmpRoot();
    try {
      const root = join(base, "@fake");
      mkdirSync(join(root, "group", "proj"), { recursive: true });
      expect(splitDomain(join(root, "group", "proj"), [root])).toEqual(["@fake", "group/proj"]);
      expect(splitDomain(root, [root])).toEqual(["@fake", ""]);
      expect(splitDomain("/elsewhere/x", [root])).toEqual([null, "/elsewhere/x"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  test("classify domain repo workspace dir", () => {
    const base = tmpRoot();
    try {
      const root = join(base, "@fake");
      mkdirSync(join(root, "r", ".git"), { recursive: true });
      mkdirSync(join(root, "p"), { recursive: true });
      const { resolve } = require("node:path");
      expect(classify(root, [root])).toBe("domain");
      expect(classify(join(root, "r"), [root])).toBe("repo");
      expect(classify(join(root, "p"), [root])).toBe("dir");
      expect(classify(join(root, "p"), [root], new Set([resolve(join(root, "p"))]))).toBe("workspace");
      expect(classify(join(root, "p"), [root], new Set(["something-else"]))).toBe("dir");
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
