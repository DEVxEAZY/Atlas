import { describe, expect, test } from "bun:test";
import { FRAME_MS } from "../src/components/clock";
import { RICH, SAFE } from "../src/glyphs";
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
  mix,
  runs,
  SAIL_EVERY,
  sailAt,
  seaColor,
  seaGlyph,
  setSeaSeed,
  creatureAt,
  swell,
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

// a fixed sea for the whole file: every run of Atlas gets a random one
setSeaSeed(1);

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
        expect(cells.slice(shipAt(w) + 4).every((c) => RICH.sea.join("").includes(c.ch))).toBe(true); // open water after it
      }
    }
  });

  test("the light on the water moves every frame, crests turn to foam", () => {
    const w = 64;
    const colors = (t: number) => voyageCells(w, t)!.map((c) => c.color).join();
    expect(colors(1)).not.toBe(colors(0));
    const seen = new Set(Array.from({ length: 100 }, (_, t) => voyageCells(w, t)!.map((c) => c.tone)).flat());
    for (const tone of ["foam", "crest", "swell", "trough", "glint"]) expect(seen.has(tone as never)).toBe(true);
  });

  test("runs merge same-colour cells and keep the text intact", () => {
    const cells = voyageCells(40, 17)!;
    const r = runs(cells);
    expect(r.map((x) => x.text).join("")).toBe(line(40, 17));
    for (let i = 1; i < r.length; i++) expect(r[i].color).not.toBe(r[i - 1].color);
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

  test("a second, sparser row of stars sits under the moon's row", () => {
    const w = 64;
    const top = skyCells(w, 0)!;
    const low = skyCells(w, 0, undefined, 1)!;
    expect(low).toHaveLength(w);
    expect(low.some((c) => c.tone === "moon")).toBe(false);
    const stars = (row: typeof top) => row.filter((c) => c.tone === "star" || c.tone === "starLit");
    expect(stars(low).length).toBeGreaterThan(0);
    expect(stars(low).length).toBeLessThan(stars(top).length + 3);
    const cols = (row: typeof top) => row.flatMap((c, x) => (c.ch === " " ? [] : [x])).join();
    expect(cols(low)).not.toBe(cols(top)); // other places, not a copy
    for (let t = 1; t < 60; t++) expect(skyCells(w, t, undefined, 1)!.map((c) => c.ch).join("")).toBe(low.map((c) => c.ch).join(""));
  });

  test("sailing: a calm column every SAIL_EVERY frames, wrapping without a jump", () => {
    const w = 30;
    for (let t = 1; t < 3 * w * SAIL_EVERY; t++) {
      const step = (sailAt(w, t) - sailAt(w, t - 1) + w) % w;
      expect(step).toBe(t % SAIL_EVERY === 0 ? 1 : 0);
    }
    expect(SAIL_EVERY * FRAME_MS).toBeGreaterThanOrEqual(350); // slow: ~2.5 columns a second
    const shipCells = (t: number) => voyageCells(w, t, undefined, true)!.filter((c) => ["gull", "wave", "boat"].includes(c.tone));
    for (let t = 0; t < 2 * w; t++) {
      expect(voyageCells(w, t, undefined, true)).toHaveLength(w);
      expect(shipCells(t)).toHaveLength(4); // the whole ship, even across the edge
    }
    const edge = voyageCells(w, (w - 2) * SAIL_EVERY, undefined, true)!; // gull at w-2: bow wraps to 0
    expect(edge[w - 2].tone).toBe("gull");
    expect(edge[0].tone).toBe("boat");
    // anchored by default
    expect(voyageCells(w, 5)![shipAt(w)].tone).toBe("gull");
    expect(voyageCells(w, 17)![shipAt(w)].tone).toBe("gull");
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

  test("a second star row joins from 28 rows when all three fit", () => {
    expect(voyageRowsFor(30, 20, ENV)).toBe(3);
    expect(voyageRowsFor(30, 28, ENV)).toBe(2); // two spare rows
    expect(voyageRowsFor(27, 0, ENV)).toBe(2); // too short for the second row
    expect(chromeRows(30, ENV)).toBe(11); // header 4 + footer 3 + sky 2 + sea 1 + margin 1
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

describe("clean transitions on the water", () => {
  test("sea colour is a gradient: a small change in height is a small change in colour", () => {
    const lum = (hex: string) => {
      const n = parseInt(hex.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    let prev = lum(seaColor(-1));
    for (let h = -1; h <= 1.0001; h += 0.05) {
      const l = lum(seaColor(h));
      expect(l).toBeGreaterThanOrEqual(prev); // brighter as it rises, never a dip
      expect(l - prev).toBeLessThan(90); // no jump between neighbours
      prev = l;
    }
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  test("a sailing boat trails a fading wake and pushes a bow wave", () => {
    const w = 40;
    const t = 20;
    const cells = voyageCells(w, t, undefined, true)!;
    const at = sailAt(w, t);
    const wake = [1, 2, 3, 4, 5].map((d) => cells[(at - d + w) % w]);
    for (const c of wake) expect(c.tone).toBe("wake");
    expect(cells[(at + 4) % w].tone).toBe("wake"); // bow wave
    // the foam is strongest right behind the stern
    const lum = (c: { color?: string }) => {
      const n = parseInt(c.color!.slice(1), 16);
      return ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
    };
    expect(lum(wake[0])).toBeGreaterThan(lum(wake[4]));
  });

  test("stars ramp up and fade instead of blinking", () => {
    const w = 64;
    const seen = new Set<string>();
    for (let t = 0; t < 120; t++)
      for (const c of skyCells(w, t)!) if (c.tone === "star" || c.tone === "starLit") seen.add(c.color ?? "rest");
    expect(seen.size).toBeGreaterThan(3); // in-between shades, not just on and off
  });
});

describe("light waves", () => {
  test("each column's glyph follows the water's height, trough to crest", () => {
    expect(seaGlyph(-1)).toBe("_");
    expect(seaGlyph(1)).toBe("˜");
    expect("~∼-").toContain(seaGlyph(0)); // the middle has several shapes
    expect(seaGlyph(1, SAFE)).toBe("^");
  });

  test("wave shapes drift slowly: few columns change glyph between frames", () => {
    const w = 64;
    const glyphs = (t: number) => voyageCells(w, t, undefined, false)!.map((c) => c.ch);
    let changed = 0;
    for (let t = 1; t < 40; t++) {
      const a = glyphs(t - 1);
      const b = glyphs(t);
      changed += a.filter((ch, x) => ch !== b[x]).length;
    }
    const perFrame = changed / 39;
    expect(perFrame).toBeGreaterThan(0); // the waves do move
    expect(perFrame).toBeLessThan(w / 3); // gently, not a flicker
  });
});

describe("an unpredictable sea", () => {
  const row = (t: number) => voyageCells(64, t)!.map((c) => c.ch).join("");

  test("each run gets its own sea; one seed always plays the same", () => {
    setSeaSeed(1);
    const a = [0, 50, 100].map(row);
    setSeaSeed(2);
    const b = [0, 50, 100].map(row);
    setSeaSeed(1);
    expect([0, 50, 100].map(row)).toEqual(a);
    expect(b).not.toEqual(a);
  });

  test("the sequence never repeats over minutes of frames", () => {
    const seen = new Set<string>();
    for (let t = 0; t < 1500; t++) seen.add(row(t)); // five minutes at 5 fps
    expect(seen.size).toBeGreaterThan(1400);
  });

  test("still continuous: a column's height moves a little per frame", () => {
    for (let x = 0; x < 64; x += 3)
      for (let t = 1; t < 400; t++) expect(Math.abs(swell(x, t) - swell(x, t - 1))).toBeLessThan(0.45);
  });

  test("wave shapes vary: a level shows more than one form across the sea", () => {
    const mids = new Set<string>();
    for (let t = 0; t < 300; t += 10) for (const ch of row(t)) if ("~∼-".includes(ch)) mids.add(ch);
    expect(mids.size).toBeGreaterThan(1);
  });
});

describe("sea life", () => {
  const W = 64;
  const passes = (seed: number, frames = 1200 * 12) => {
    setSeaSeed(seed);
    let shown = 0;
    let runs = 0;
    let prev = false;
    for (let t = 0; t < frames; t++) {
      const on = creatureAt(W, t) !== null;
      if (on) shown++;
      if (on && !prev) runs++;
      prev = on;
    }
    setSeaSeed(1);
    return { share: shown / frames, runs };
  };

  test("an octopus or a squid swims by, rarely", () => {
    const all = [1, 2, 3, 4, 5].map((seed) => passes(seed));
    expect(all.reduce((n, p) => n + p.runs, 0)).toBeGreaterThan(0); // it happens
    for (const p of all) expect(p.share).toBeLessThan(0.15); // but seldom
  });

  test("it crosses from one edge to the other, one column at a time, under the boat", () => {
    let seed = 1;
    let t0 = -1;
    for (; seed < 50 && t0 < 0; seed++) {
      setSeaSeed(seed);
      for (let t = 0; t < 1200 * 6; t++) if (creatureAt(W, t)) { t0 = t; break; }
    }
    setSeaSeed(seed - 1);
    const xs: number[] = [];
    let t = t0;
    for (let c = creatureAt(W, t); c; c = creatureAt(W, ++t)) xs.push(c.x);
    const first = creatureAt(W, t0)!;
    expect(xs.length).toBeGreaterThan(W); // a full crossing
    for (let i = 1; i < xs.length; i++) expect(Math.abs(xs[i] - xs[i - 1])).toBeLessThanOrEqual(1);
    expect(Math.min(...xs)).toBeLessThan(0 + 1);
    expect(Math.max(...xs)).toBeGreaterThan(W - 4);
    expect(["octopus", "squid"]).toContain(first.kind);
    // drawn under the ship: the ship's cells always win
    for (let k = t0; k < t; k += 7) {
      const cells = voyageCells(W, k, undefined, true)!;
      expect(cells.filter((c) => c.tone === "boat")).toHaveLength(1);
    }
    setSeaSeed(1);
  });
});
