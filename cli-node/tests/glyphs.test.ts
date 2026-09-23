import { describe, expect, test } from "bun:test";
import { RICH, SAFE, glyphMode, type Glyphs } from "../src/glyphs";
import { VOYAGE_MIN_WIDTH, shipAt, skyCells, voyageCells } from "../src/components/Voyage";

/** Everything a glyph set draws, one string per symbol. */
function all(g: Glyphs): string[] {
  return [
    ...Object.values(g.runtime),
    g.tmux, g.live, g.idle, g.domain, g.repo, g.dir, g.warn, g.collapsed, g.expanded,
    g.use, g.ok, g.bad, g.root, g.said, g.bullet, g.clock, g.moon,
    ...g.spinner, ...g.stars, ...g.ship.map((c) => c.ch),
  ];
}

/** WGL4 symbols Atlas relies on in the portable set: every Windows console
 *  font (Consolas, Lucida Console, Cascadia) has them. */
const WGL4 = new Set([..."·•°◊♦●○■►▼√⌂≡→"]);

describe("glyph sets", () => {
  test("the portable set is ASCII plus WGL4, one column each", () => {
    for (const s of all(SAFE)) {
      expect(s.length).toBe(1);
      const c = s.codePointAt(0)!;
      expect(c < 0x7f || WGL4.has(s)).toBe(true);
    }
  });

  test("rich symbols that also exist as emoji ask for their text form", () => {
    for (const s of all(RICH)) {
      const base = s.trim().replace(/\uFE0E$/, "");
      if (/\p{Extended_Pictographic}/u.test(base)) expect(s.endsWith("\uFE0E")).toBe(true);
      expect(/\p{Emoji_Presentation}/u.test(base)).toBe(false);
    }
    expect(RICH.runtime.claude).toBe("✳\uFE0E");
    expect(RICH.warn).toBe("⚠\uFE0E");
  });

  test("rich by default, portable only when asked", () => {
    expect(glyphMode({})).toBe("rich");
    expect(glyphMode({ SSH_CONNECTION: "1.2.3.4 5 6.7.8.9 22", MSYSTEM: "MINGW64" })).toBe("rich");
    expect(glyphMode({ ATLAS_GLYPHS: "safe" })).toBe("safe");
    expect(glyphMode({ ATLAS_GLYPHS: "ASCII" })).toBe("safe");
    expect(glyphMode({ ATLAS_GLYPHS: "rich" })).toBe("rich");
  });

  test("the portable footer keeps the scene exactly the strip width", () => {
    for (const w of [VOYAGE_MIN_WIDTH, 30, 64]) {
      for (let t = 0; t < 40; t++) {
        const sea = voyageCells(w, t, SAFE)!;
        const sky = skyCells(w, t, SAFE)!;
        expect(sea.map((c) => c.ch).join("")).toHaveLength(w);
        expect(sky.map((c) => c.ch).join("")).toHaveLength(w);
      }
      expect(voyageCells(w, 0, SAFE)!.slice(shipAt(w, SAFE), shipAt(w, SAFE) + 8).map((c) => c.ch).join("")).toBe("v~\\_|_/~");
    }
  });
});
