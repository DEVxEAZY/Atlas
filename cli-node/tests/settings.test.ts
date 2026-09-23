import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { DEFAULT_SETTINGS, getSettings, loadSettings, settingsPath, updateSettings } from "../src/settings";

afterEach(() => {
  rmSync(settingsPath(), { force: true });
});

test("the boat rides at anchor unless sailing was chosen", () => {
  expect(DEFAULT_SETTINGS.sail).toBe(false);
  expect(loadSettings()).toEqual({ sail: false }); // no file yet
  writeFileSync(settingsPath(), "not json");
  expect(loadSettings()).toEqual({ sail: false });
});

test("the sail choice is saved and read back", () => {
  updateSettings({ sail: true });
  expect(getSettings().sail).toBe(true);
  expect(JSON.parse(readFileSync(settingsPath(), "utf-8"))).toEqual({ sail: true });
  expect(loadSettings().sail).toBe(true);
  updateSettings({ sail: false });
  expect(loadSettings().sail).toBe(false);
});
