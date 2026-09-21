import { describe, expect, test } from "bun:test";
import { chromeRows, hintsWidth, listHeightFor } from "../src/components/chrome";
import {
  HINTS_FILTER,
  HINTS_FULL,
  HINTS_FULL_MIN_COLS,
  HINTS_SHORT,
} from "../src/screens/Hub";

describe("hub chrome layout", () => {
  test("chrome occupies 8 rows: header 4 + footer 3 + margin 1", () => {
    expect(chromeRows()).toBe(8);
  });

  test("list takes what is left, with a 3-row floor", () => {
    expect(listHeightFor(24)).toBe(16);
    expect(listHeightFor(undefined)).toBe(16);
    expect(listHeightFor(11)).toBe(3);
    expect(listHeightFor(8)).toBe(3);
  });

  test("chrome + list fits the screen except tiny last-resort terminals", () => {
    for (let rows = 8; rows <= 40; rows++) {
      const total = chromeRows() + listHeightFor(rows);
      // below 11 rows even the chrome (8) + floor list (3) cannot fit
      if (rows < 11) expect(listHeightFor(rows)).toBe(3);
      else expect(total).toBeLessThanOrEqual(rows);
    }
  });

  test("hint sets fit without wrapping", () => {
    expect(HINTS_FULL_MIN_COLS).toBe(hintsWidth(HINTS_FULL) + 4); // + root padding
    expect(hintsWidth(HINTS_SHORT) + 4).toBeLessThanOrEqual(50); // narrow screens
    expect(hintsWidth(HINTS_FILTER) + 4).toBeLessThanOrEqual(50);
    expect(HINTS_FULL_MIN_COLS).toBeLessThanOrEqual(80); // full hints on wide screens
  });
});
