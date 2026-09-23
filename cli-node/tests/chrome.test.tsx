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
import {
  BOAT_EVERY,
  VOYAGE_MIN_WIDTH,
  VOYAGE_MOTIF,
  VOYAGE_MOTIF_COLS,
  runs,
  shipAt,
  voyageCells,
} from "../src/components/Voyage";

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
  const line = (w: number, t: number) => voyageCells(w, t)!.map((c) => c.ch).join("");

  test("the motif takes 3 columns: the gull is a zero-width combining mark", () => {
    expect(stringWidth(VOYAGE_MOTIF)).toBe(VOYAGE_MOTIF_COLS);
    expect([...VOYAGE_MOTIF].map((c) => c.codePointAt(0))).toEqual([0x0f7c, 0x13083, 0x16833, 0x13083]);
  });

  test("every frame is exactly the strip width, one row, the gull on a space", () => {
    for (const w of [VOYAGE_MIN_WIDTH, 10, 30, 64]) {
      for (let t = 0; t < 3 * w * BOAT_EVERY; t++) {
        const cells = voyageCells(w, t)!;
        expect(cells).toHaveLength(w);
        for (const c of cells) expect(stringWidth(c.ch)).toBe(1); // one column each
        expect(cells.filter((c) => c.tone === "gull").map((c) => c.ch)).toEqual([` ${VOYAGE_MOTIF[0]}`]);
        expect(stringWidth(line(w, t))).toBe(w);
        expect(line(w, t)).not.toContain("\n");
      }
    }
  });

  test("it drifts one column every BOAT_EVERY frames and wraps without jumping", () => {
    const w = 30;
    const at = (t: number) => shipAt(w, t);
    expect(at(0)).toBe(0);
    expect(at(BOAT_EVERY - 1)).toBe(0);
    expect(at(BOAT_EVERY)).toBe(1);
    for (let t = 1; t < 3 * w * BOAT_EVERY; t++) {
      const step = (at(t) - at(t - 1) + w) % w;
      expect(step === 0 || step === 1).toBe(true); // never teleports
    }
    // sailing off the right edge, the bow is already back on the left
    const t = (w - 2) * BOAT_EVERY;
    const cells = voyageCells(w, t)!;
    expect(cells[w - 2].tone).toBe("gull");
    expect(cells[0].tone).toBe("boat");
  });

  test("the sea moves every frame, even while the boat holds its column", () => {
    expect(shipAt(30, 0)).toBe(shipAt(30, 1));
    expect(line(30, 0)).not.toBe(line(30, 1));
  });

  test("runs merge same-tone cells and keep the text intact", () => {
    const cells = voyageCells(40, 17)!;
    const r = runs(cells);
    expect(r.map((x) => x.text).join("")).toBe(line(40, 17));
    for (let i = 1; i < r.length; i++) expect(r[i].tone).not.toBe(r[i - 1].tone);
  });

  test("too narrow to sail draws nothing and never throws", () => {
    for (const w of [0, 1, 3, VOYAGE_MIN_WIDTH - 1, NaN]) expect(voyageCells(w, 7)).toBeNull();
    expect(voyageCells(10, -5)).toHaveLength(10);
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
