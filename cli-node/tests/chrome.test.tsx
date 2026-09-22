import { describe, expect, test } from "bun:test";
import {
  MIN_LIST_ROWS,
  VOYAGE_MIN_ROWS,
  chromeRows,
  hintsWidth,
  listHeightFor,
  voyageEnabled,
  voyageRows,
} from "../src/components/chrome";
import { voyageFrame } from "../src/components/Voyage";
import { runningChromeRows } from "../src/screens/Running";
import {
  HINTS_FILTER,
  HINTS_FULL,
  HINTS_FULL_MIN_COLS,
  HINTS_SHORT,
} from "../src/screens/Hub";

describe("voyage footer", () => {
  test("the sea fills the strip and the boat sails across and around", () => {
    const w = 30;
    const seen = new Set<number>();
    for (let t = 0; t < 2 * (w + 5) * 2; t++) {
      const f = voyageFrame(w, t);
      expect(f.sky).toHaveLength(w);
      expect(f.seaLeft.length + f.hull.length + f.seaRight.length).toBe(w);
      if (f.hull === "\\___/") seen.add(f.seaLeft.length);
    }
    expect(Math.min(...seen)).toBe(0); // fully in at the left edge
    expect(Math.max(...seen)).toBe(w - 5); // fully in at the right edge
    expect(voyageFrame(w, 0).hull).toBe(""); // starts off-screen, then enters
  });

  test("the sail rides above the hull", () => {
    const f = voyageFrame(30, 30);
    expect(f.sky.indexOf("|\\")).toBe(f.seaLeft.length + 1);
  });

  test("tiny widths never throw", () => {
    for (const w of [0, 1, 3]) expect(() => voyageFrame(w, 7)).not.toThrow();
  });

  test("ATLAS_NO_BOAT turns it off", () => {
    expect(voyageEnabled({})).toBe(true);
    expect(voyageEnabled({ ATLAS_NO_BOAT: "0" })).toBe(true);
    expect(voyageEnabled({ ATLAS_NO_BOAT: "1" })).toBe(false);
  });
});

describe("hub chrome layout", () => {
  test("chrome occupies 10 rows with the boat, 8 when it is docked", () => {
    expect(chromeRows(24)).toBe(10); // header 4 + footer 3 + boat 2 + margin 1
    expect(chromeRows(VOYAGE_MIN_ROWS - 1)).toBe(8);
  });

  test("list takes what is left, with a 3-row floor", () => {
    expect(listHeightFor(24)).toBe(14);
    expect(listHeightFor(undefined)).toBe(14);
    expect(listHeightFor(13)).toBe(5); // short terminal: the boat's rows go to the list
    expect(listHeightFor(10)).toBe(MIN_LIST_ROWS);
  });

  test("the boat reserves rows only when it is drawn", () => {
    expect(voyageRows(24, {})).toBe(2);
    expect(voyageRows(VOYAGE_MIN_ROWS - 1, {})).toBe(0);
    expect(voyageRows(40, { ATLAS_NO_BOAT: "1" })).toBe(0);
  });

  test("hub chrome + list fits the screen except tiny last-resort terminals", () => {
    for (let rows = 8; rows <= 40; rows++) {
      const total = chromeRows(rows) + listHeightFor(rows);
      if (rows - chromeRows(rows) < MIN_LIST_ROWS) expect(listHeightFor(rows)).toBe(MIN_LIST_ROWS);
      else expect(total).toBeLessThanOrEqual(rows);
    }
  });

  test("every management-view variant fits from 13 to 40 rows", () => {
    for (let rows = 13; rows <= 40; rows++) {
      for (const convo of [false, true])
        for (const ended of [false, true])
          for (const tmux of [false, true])
            for (const procs of [0, 1]) {
              const chrome = runningChromeRows({ convo, ended, tmux, procs }, rows);
              const list = Math.max(MIN_LIST_ROWS, rows - chrome);
              if (rows - chrome >= MIN_LIST_ROWS) expect(chrome + list).toBeLessThanOrEqual(rows);
            }
    }
  });

  test("hint sets fit without wrapping", () => {
    expect(HINTS_FULL_MIN_COLS).toBe(hintsWidth(HINTS_FULL) + 4); // + root padding
    expect(hintsWidth(HINTS_SHORT) + 4).toBeLessThanOrEqual(50); // narrow screens
    expect(hintsWidth(HINTS_FILTER) + 4).toBeLessThanOrEqual(50);
    expect(HINTS_FULL_MIN_COLS).toBeLessThanOrEqual(80); // full hints on wide screens
  });
});
