import { describe, expect, test } from "bun:test";
import {
  MIN_LIST_ROWS,
  SKY_MIN_ROWS,
  VOYAGE_MIN_ROWS,
  boatFits,
  chromeRows,
  hintsWidth,
  hubBoat,
  listHeightFor,
  voyageEnabled,
  voyageRowsFor,
} from "../src/components/chrome";
import {
  MOON_COL,
  VOYAGE_MIN_WIDTH,
  VOYAGE_MOTIF,
  VOYAGE_MOTIF_COLS,
  runs,
  shipAt,
  skyCells,
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
    for (const w of [VOYAGE_MIN_WIDTH, 16, 30, 64]) {
      for (let t = 0; t < 3 * w; t++) {
        const cells = voyageCells(w, t)!;
        expect(cells).toHaveLength(w);
        for (const c of cells) expect(stringWidth(c.ch)).toBe(1); // one column each
        expect(cells.filter((c) => c.tone === "gull").map((c) => c.ch)).toEqual([` ${VOYAGE_MOTIF[0]}`]);
        expect(stringWidth(line(w, t))).toBe(w);
        expect(line(w, t)).not.toContain("\n");
      }
    }
  });

  test("the boat rides at anchor near the right edge", () => {
    for (const w of [VOYAGE_MIN_WIDTH, 30, 64]) {
      for (let t = 0; t < 50; t++) {
        const cells = voyageCells(w, t)!;
        expect(cells[shipAt(w)].tone).toBe("gull");
        expect(cells[shipAt(w) + 2].tone).toBe("boat");
        expect(cells.slice(shipAt(w) + 4).every((c) => c.ch === "~" || c.ch === "-")).toBe(true); // open water after it
      }
    }
  });

  test("only light moves: glyphs stay, colours change, crests turn to foam", () => {
    const w = 64;
    const glyphs = (t: number) => line(w, t);
    const tones = (t: number) => voyageCells(w, t)!.map((c) => c.tone).join();
    for (let t = 1; t < 100; t++) expect(glyphs(t)).toBe(glyphs(0));
    expect(tones(1)).not.toBe(tones(0));
    const seen = new Set(Array.from({ length: 100 }, (_, t) => voyageCells(w, t)!.map((c) => c.tone)).flat());
    for (const tone of ["foam", "crest", "swell", "trough", "glint"]) expect(seen.has(tone as never)).toBe(true);
  });

  test("runs merge same-tone cells and keep the text intact", () => {
    const cells = voyageCells(40, 17)!;
    const r = runs(cells);
    expect(r.map((x) => x.text).join("")).toBe(line(40, 17));
    for (let i = 1; i < r.length; i++) expect(r[i].tone).not.toBe(r[i - 1].tone);
  });

  test("too narrow to sail draws nothing and never throws", () => {
    for (const w of [0, 1, 3, VOYAGE_MIN_WIDTH - 1, NaN]) expect(voyageCells(w, 7)).toBeNull();
    expect(voyageCells(16, -5)).toHaveLength(16);
  });

  test("the sky is still: moon and stars keep their columns, only colours twinkle", () => {
    for (const w of [VOYAGE_MIN_WIDTH, 30, 64]) {
      const glyphs = (t: number) => skyCells(w, t)!.map((c) => c.ch).join("");
      for (let t = 0; t < 200; t++) {
        const cells = skyCells(w, t)!;
        expect(cells).toHaveLength(w);
        for (const c of cells) expect(stringWidth(c.ch)).toBe(1);
        expect(glyphs(t)).toBe(glyphs(0));
      }
      const sky = skyCells(w, 0)!;
      expect(sky[MOON_COL]).toEqual({ ch: "☾", tone: "moon" }); // top-left corner
      expect(sky.filter((c) => c.tone === "moon")).toHaveLength(1);
      // mostly empty sky: stars are sparse
      expect(sky.filter((c) => c.tone === "star" || c.tone === "starLit").length).toBeLessThan(w / 4);
    }
    const tones = new Set(Array.from({ length: 80 }, (_, t) => skyCells(64, t)!.map((c) => c.tone).join()));
    expect(tones.size).toBeGreaterThan(1); // something twinkles
  });

  test("the moon glints on the water right under it", () => {
    const w = 64;
    const m = MOON_COL;
    const sea = voyageCells(w, 0)!;
    expect(["glint", "glintSoft"]).toContain(sea[m].tone);
    expect(sea[m].ch).not.toBe(" ");
    expect(["glint", "glintSoft"]).not.toContain(sea[m + 3].tone);
  });

  test("ATLAS_NO_BOAT turns it off", () => {
    expect(voyageEnabled({})).toBe(true);
    expect(voyageEnabled({ ATLAS_NO_BOAT: "0" })).toBe(true);
    expect(voyageEnabled({ ATLAS_NO_BOAT: "1" })).toBe(false);
  });
});

describe("hub chrome layout", () => {
  test("chrome occupies 10 rows with sky and sea, 9 with the sea, 8 docked", () => {
    expect(chromeRows(24, ENV)).toBe(10); // header 4 + footer 3 + sky 1 + sea 1 + margin 1
    expect(chromeRows(SKY_MIN_ROWS - 1, ENV)).toBe(9); // no room for the sky
    expect(chromeRows(VOYAGE_MIN_ROWS - 1, ENV)).toBe(8);
    expect(chromeRows(40, { ATLAS_NO_BOAT: "1" })).toBe(8);
  });

  test("list takes what is left, with a 3-row floor", () => {
    expect(listHeightFor(24, ENV)).toBe(14);
    expect(listHeightFor(undefined, ENV)).toBe(14);
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

  test("the sky takes a row only where both rows fit", () => {
    expect(voyageRowsFor(24, 22, ENV)).toBe(2);
    expect(voyageRowsFor(24, 23, ENV)).toBe(1); // one spare row: sea only
    expect(voyageRowsFor(SKY_MIN_ROWS - 1, 0, ENV)).toBe(1); // short terminal: sea only
    expect(voyageRowsFor(24, 24, ENV)).toBe(0);
    expect(voyageRowsFor(40, 0, { ATLAS_NO_BOAT: "1" })).toBe(0);
  });

  test("hint sets fit without wrapping", () => {
    expect(HINTS_FULL_MIN_COLS).toBe(hintsWidth(HINTS_FULL) + 4); // + root padding
    expect(hintsWidth(HINTS_SHORT) + 4).toBeLessThanOrEqual(50); // narrow screens
    expect(hintsWidth(HINTS_FILTER) + 4).toBeLessThanOrEqual(50);
    expect(HINTS_FULL_MIN_COLS).toBeLessThanOrEqual(80); // full hints on wide screens
  });
});
