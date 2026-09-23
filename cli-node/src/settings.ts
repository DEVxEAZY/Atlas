/** Viewer preferences that outlive a run (~/.local/share/atlas/settings.json),
 *  with a tiny store so every screen re-renders when one changes. */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { useSyncExternalStore } from "react";

export interface Settings {
  /** The footer boat sails across the sea (off: it rides at anchor). */
  sail: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sail: false };

export function settingsPath(): string {
  return process.env.ATLAS_SETTINGS_FILE ?? join(homedir(), ".local", "share", "atlas", "settings.json");
}

export function loadSettings(path: string = settingsPath()): Settings {
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, sail: raw.sail === true };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(s: Settings, path: string = settingsPath()): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n");
    renameSync(tmp, path);
  } catch {
    /* read-only home: the choice lasts this run */
  }
}

let current: Settings | null = null;
const listeners = new Set<() => void>();

export function getSettings(): Settings {
  return (current ??= loadSettings());
}

export function updateSettings(patch: Partial<Settings>): Settings {
  current = { ...getSettings(), ...patch };
  saveSettings(current);
  for (const l of listeners) l();
  return current;
}

/** Current settings, re-rendering the caller when they change. */
export function useSettings(): Settings {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getSettings,
  );
}
