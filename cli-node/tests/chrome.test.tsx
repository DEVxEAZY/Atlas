import { describe, expect, test } from "bun:test";
import {
  MIN_LIST_ROWS,
  VOYAGE_MIN_ROWS,
  boatFits,
  chromeRows,
  hintsWidth,
  hubBoat,
  listHeightFor,
  voyageEnabled,
} from "../src/components/chrome";
import { VOYAGE_MOTIF, VOYAGE_MOTIF_COLS, voyageFrame } from "../src/components/Voyage";

/** Layout math takes the environment explicitly: a developer who exported
 *  the documented ATLAS_NO_BOAT=1 must still get a green suite. */
const ENV = {};
import {
  HINTS_FILTER,
  HINTS_FULL,
  HINTS_FULL_MIN_COLS,
  HINTS_SHORT,
} from "../src/screens/Hub";

/** Columns for this footer's characters: combining marks (the gull) take
 *  none, every other code point here takes one — as Ink's string-width says. */
const stringWidth = (text: string) => [...text].filter((c) => !/\p{Mn}/u.test(c)).length;

describe("voyage footer", () => {
  const line = (w: number, t: number) => {
    const f = voyageFrame(w, t)!;
    return `${" ".repeat(f.lead)}${VOYAGE_MOTIF}${" ".repeat(f.trail)}`;
  };

  test("the motif takes 3 columns: the gull is a zero-width combining mark", () => {
    expect(stringWidth(VOYAGE_MOTIF)).toBe(VOYAGE_MOTIF_COLS);
    expect([...VOYAGE_MOTIF].map((c) => c.codePointAt(0))).toEqual([0x0f7c, 0x13083, 0x16833, 0x13083]);
  });

  test("every frame is exactly the strip width, one row, the gull on a space", () => {
    for (const w of [4, 10, 30, 64]) {
      for (let t = 0; t < 3 * w; t++) {
        const f = voyageFrame(w, t)!;
        expect(f.lead).toBeGreaterThanOrEqual(1); // never a bare combining mark
        expect(stringWidth(line(w, t))).toBe(w);
        expect(line(w, t)).not.toContain("\n");
      }
    }
  });

  test("it drifts one column per tick, edge to edge, and starts over", () => {
    const w = 30;
    const leads = Array.from({ length: 2 * (w - 3) }, (_, t) => voyageFrame(w, t)!.lead);
    expect(leads[0]).toBe(1);
    expect(leads[1]).toBe(2);
    expect(Math.max(...leads)).toBe(w - VOYAGE_MOTIF_COLS); // touches the right edge
    expect(leads[w - 3]).toBe(1); // …then back to the left
  });

  test("too narrow to sail draws nothing and never throws", () => {
    for (const w of [0, 1, 3]) expect(voyageFrame(w, 7)).toBeNull();
    expect(voyageFrame(10, -5)!.lead).toBeGreaterThanOrEqual(1);
  });

  test("ATLAS_NO_BOAT turns it off", () => {
    expect(voyageEnabled({})).toBe(true);
    expect(voyageEnabled({ ATLAS_NO_BOAT: "0" })).toBe(true);
    expect(voyageEnabled({ ATLAS_NO_BOAT: "1" })).toBe(false);
  });
});

describe("hub chrome layout", () => {
  test("chrome occupies 9 rows with the boat, 8 when it is docked", () => {
    expect(chromeRows(24, ENV)).toBe(9); // header 4 + footer 3 + boat 1 + margin 1
    expect(chromeRows(VOYAGE_MIN_ROWS - 1, ENV)).toBe(8);
    expect(chromeRows(40, { ATLAS_NO_BOAT: "1" })).toBe(8);
  });

  test("list takes what is left, with a 3-row floor", () => {
    expect(listHeightFor(24, ENV)).toBe(15);
    expect(listHeightFor(undefined, ENV)).toBe(15);
    expect(listHeightFor(13, ENV)).toBe(5); // short terminal: the boat's row goes to the list
    expect(listHeightFor(10, ENV)).toBe(MIN_LIST_ROWS);
  });

  test("the boat only docks where it could push the frame past the window", () => {
    expect(boatFits(24, 23, ENV)).toBe(true); // one spare row is enough for one row
    expect(boatFits(24, 24, ENV)).toBe(false);
    expect(boatFits(VOYAGE_MIN_ROWS - 1, 0, ENV)).toBe(false);
    expect(boatFits(40, 0, { ATLAS_NO_BOAT: "1" })).toBe(false);
    expect(hubBoat(VOYAGE_MIN_ROWS, ENV)).toBe(true);
  });

  test("hint sets fit without wrapping", () => {
    expect(HINTS_FULL_MIN_COLS).toBe(hintsWidth(HINTS_FULL) + 4); // + root padding
    expect(hintsWidth(HINTS_SHORT) + 4).toBeLessThanOrEqual(50); // narrow screens
    expect(hintsWidth(HINTS_FILTER) + 4).toBeLessThanOrEqual(50);
    expect(HINTS_FULL_MIN_COLS).toBeLessThanOrEqual(80); // full hints on wide screens
  });
});
