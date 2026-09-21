/** Recent-session history. Same file format as the Python prototype. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface Session {
  dir: string;
  runtime: string;
  last_used: string; // ISO 8601
  uses: number;
}

export function historyPath(): string {
  return (
    process.env.ATLAS_HISTORY_FILE ?? join(homedir(), ".local", "share", "atlas", "history.json")
  );
}

export function load(path: string = historyPath()): Session[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const sessions: Session[] = [];
  for (const item of raw) {
    if (
      typeof item?.dir === "string" &&
      typeof item?.runtime === "string" &&
      typeof item?.last_used === "string"
    ) {
      sessions.push({
        dir: item.dir,
        runtime: item.runtime,
        last_used: item.last_used,
        uses: typeof item.uses === "number" ? item.uses : 1,
      });
    }
  }
  sessions.sort((a, b) =>
    a.last_used === b.last_used ? 0 : a.last_used < b.last_used ? 1 : -1,
  );
  return sessions;
}

export function record(directory: string, runtime: string, path: string = historyPath()): Session {
  const dir = resolve(directory.replace(/^~(?=\/|$)/, homedir()));
  const previous = load(path);
  const uses = previous.find((s) => s.dir === dir && s.runtime === runtime)?.uses ?? 0;
  const session: Session = { dir, runtime, last_used: new Date().toISOString(), uses: uses + 1 };
  const sessions = [session, ...previous.filter((s) => !(s.dir === dir && s.runtime === runtime))];
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(sessions, null, 2));
  return session;
}

export function remove(directory: string, runtime: string, path: string = historyPath()): boolean {
  const sessions = load(path);
  const kept = sessions.filter((s) => !(s.dir === directory && s.runtime === runtime));
  if (kept.length === sessions.length) return false;
  writeFileSync(path, JSON.stringify(kept, null, 2));
  return true;
}

/** Switch a session's runtime in place, keeping recency and use counts.
 *  When the target key already exists the old entry is simply dropped. */
export function rekeyRuntime(
  directory: string,
  from: string,
  to: string,
  path: string = historyPath(),
): boolean {
  const sessions = load(path);
  const idx = sessions.findIndex((s) => s.dir === directory && s.runtime === from);
  if (idx === -1) return false;
  const [entry] = sessions.splice(idx, 1);
  if (!sessions.some((s) => s.dir === directory && s.runtime === to)) {
    entry.runtime = to;
    sessions.splice(Math.min(idx, sessions.length), 0, entry);
  }
  writeFileSync(path, JSON.stringify(sessions, null, 2));
  return true;
}

export function lastRuntimeFor(directory: string, path: string = historyPath()): string | null {
  return load(path).find((s) => s.dir === directory)?.runtime ?? null;
}

export function isAtlasHistoryFile(p: string): boolean {
  return existsSync(p);
}
