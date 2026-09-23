import { afterEach, beforeEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { voyageEnabled, voyageRowsFor } from "../src/components/chrome";
import { DEFAULT_SETTINGS, getSettings, loadSettings, settingsPath, updateSettings } from "../src/settings";

beforeEach(() => rmSync(settingsPath(), { force: true }));
// the rest of the suite runs with the painting shown (tests/setup.ts)
afterEach(() => updateSettings({ animation: true }));

test("the animation starts hidden until it is shown", () => {
  expect(DEFAULT_SETTINGS.animation).toBe(false);
  expect(loadSettings()).toEqual({ animation: false }); // no file yet
  writeFileSync(settingsPath(), "not json");
  expect(loadSettings()).toEqual({ animation: false });
  writeFileSync(settingsPath(), JSON.stringify({ sail: true })); // an older file
  expect(loadSettings()).toEqual({ animation: false });
  writeFileSync(settingsPath(), JSON.stringify({ animation: true }));
  expect(loadSettings()).toEqual({ animation: true });
});

test("showing and hiding is saved, and the footer rows follow", () => {
  updateSettings({ animation: false });
  expect(getSettings().animation).toBe(false);
  expect(JSON.parse(readFileSync(settingsPath(), "utf-8"))).toEqual({ animation: false });
  expect(voyageEnabled({})).toBe(false);
  expect(voyageRowsFor(40, 0, {})).toBe(0);
  updateSettings({ animation: true });
  expect(loadSettings().animation).toBe(true);
  expect(voyageRowsFor(40, 0, {})).toBe(3);
});
