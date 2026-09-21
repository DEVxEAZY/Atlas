/** Muse store: ~/.local/share/muse/sessions/YYYY/MM/DD/<id>/session.jsonl
 *  + session-index.db (titles) + tui-history.jsonl (typed prompts fallback).
 *
 *  Only the exact 4-level layout counts as a session: deeper session.jsonl
 *  files belong to subagents and are not resumable conversations.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  NATIVE_PARSE_LIMIT,
  nativeHome,
  oneLine,
  readHead,
  type NativeSession,
} from "./types";

const CWD_RE = /\\?"cwd\\?":\\?"([^"\\]+)/;

function listDirs(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Exactly sessions/YYYY/MM/DD/<id>/session.jsonl — never deeper. */
export function topLevelSessions(home: string): string[] {
  const out: string[] = [];
  const root = join(home, "sessions");
  for (const y of listDirs(root)) {
    for (const m of listDirs(join(root, y))) {
      for (const d of listDirs(join(root, y, m))) {
        for (const id of listDirs(join(root, y, m, d))) {
          const file = join(root, y, m, d, id, "session.jsonl");
          if (existsSync(file)) out.push(file);
        }
      }
    }
  }
  return out;
}

export function parseMuseCwd(file: string): string | null {
  const text = readHead(file, 131072);
  if (text === null) return null;
  const lines = text.split("\n", 40);
  for (const line of lines) {
    const match = CWD_RE.exec(line);
    if (match) return match[1];
  }
  return null;
}

interface MuseIndexEntry {
  text: string | null;
  root: string | null;
}

const indexCache = new Map<string, Map<string, MuseIndexEntry>>();
const tuiCache = new Map<string, Map<string, string>>();

function pickMuseText(row: Record<string, unknown>): string | null {
  for (const key of [
    "msp_first_user_prompt",
    "first_user_prompt",
    "msp_title",
    "effective_long_title",
    "title",
  ]) {
    const value = row[key];
    if (typeof value === "string" && value.trim() && value.trim() !== "New session") {
      return oneLine(value);
    }
  }
  return null;
}

/** Titles + workspace roots from session-index.db (SELECT * tolerates schema drift). */
export function queryMuseIndex(home: string): Map<string, MuseIndexEntry> {
  const dbPath = join(home, "session-index.db");
  const hit = indexCache.get(dbPath);
  if (hit) return hit;
  const cache = new Map<string, MuseIndexEntry>();
  indexCache.set(dbPath, cache);
  try {
    const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
    const db = new Database(dbPath, { readonly: true });
    try {
      const rows = db.query(`SELECT * FROM sessions`).all() as Array<
        Record<string, unknown>
      >;
      for (const row of rows) {
        const id = row.session_id;
        if (typeof id !== "string") continue;
        const root = row.workspace_root;
        cache.set(id, {
          text: pickMuseText(row),
          root: typeof root === "string" && root ? root : null,
        });
      }
    } finally {
      db.close();
    }
  } catch {
    /* no index available */
  }
  return cache;
}

/** session -> last typed prompt from tui-history.jsonl ("text" line + {"session": id} line). */
export function loadTuiHistory(home: string): Map<string, string> {
  const file = join(home, "tui-history.jsonl");
  const hit = tuiCache.get(file);
  if (hit) return hit;
  const map = new Map<string, string>();
  tuiCache.set(file, map);
  let text: string;
  try {
    const stat = statSync(file);
    if (stat.size > 2 * 1024 * 1024) return map;
    text = readFileSync(file, "utf-8");
  } catch {
    return map;
  }
  let pending: string | null = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("{")) {
      try {
        const obj = JSON.parse(trimmed) as { session?: unknown };
        if (typeof obj.session === "string" && pending) map.set(obj.session, pending);
      } catch {
        /* ignore */
      }
      pending = null;
    } else {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        pending = typeof parsed === "string" ? oneLine(parsed) : null;
      } catch {
        pending = oneLine(trimmed);
      }
    }
  }
  return map;
}

/** Backward-compatible single preview lookup (index, then tui history). */
export function queryMusePreview(home: string, sessionId: string): string | null {
  return (
    queryMuseIndex(home).get(sessionId)?.text ?? loadTuiHistory(home).get(sessionId) ?? null
  );
}

export function scanMuse(
  home: string = nativeHome("muse"),
  limit: number = NATIVE_PARSE_LIMIT,
): { items: NativeSession[]; total: number } {
  const files = topLevelSessions(home);
  if (files.length === 0) return { items: [], total: 0 };
  const withTime: Array<{ file: string; mtime: number }> = [];
  for (const file of files) {
    try {
      withTime.push({ file, mtime: statSync(file).mtimeMs });
    } catch {
      continue;
    }
  }
  withTime.sort((a, b) => b.mtime - a.mtime);
  const index = queryMuseIndex(home);
  const tui = loadTuiHistory(home);
  const out: NativeSession[] = [];
  for (const { file, mtime } of withTime.slice(0, limit)) {
    const id = file.split("/").at(-2) ?? file;
    const entry = index.get(id);
    out.push({
      harness: "muse",
      id,
      dir: entry?.root ?? parseMuseCwd(file),
      preview: entry?.text ?? tui.get(id) ?? null,
      updatedAt: mtime,
      file,
    });
  }
  return { items: out, total: withTime.length };
}
