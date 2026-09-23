import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { DEFAULT_SETTINGS, getSettings, loadSettings, settingsPath, updateSettings } from "../src/settings";

afterEach(() => {
  rmSync(settingsPath(), { force: true });
});

test("the boat sails unless it was anchored", () => {
  expect(DEFAULT_SETTINGS.sail).toBe(true);
  expect(loadSettings()).toEqual({ sail: true }); // no file yet
  writeFileSync(settingsPath(), "not json");
  expect(loadSettings()).toEqual({ sail: true });
  writeFileSync(settingsPath(), JSON.stringify({ sail: false }));
  expect(loadSettings()).toEqual({ sail: false });
});

test("the sail choice is saved and read back", () => {
  updateSettings({ sail: false });
  expect(getSettings().sail).toBe(false);
  expect(JSON.parse(readFileSync(settingsPath(), "utf-8"))).toEqual({ sail: false });
  expect(loadSettings().sail).toBe(false);
  updateSettings({ sail: true });
  expect(loadSettings().sail).toBe(true);
});
