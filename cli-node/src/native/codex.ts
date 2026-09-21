/** Codex store: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl + history.jsonl index */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NATIVE_PARSE_LIMIT, nativeHome, oneLine, readHead, type NativeSession } from "./types";
import type { ScanResult } from "./claude";

function walkJsonl(dir: string, out: string[], depth = 0): void {
  if (depth > 6) return;
  let entries: string[];
  try {
    entries = readdirSync(dir, { withFileTypes: true }) as unknown as string[];
  } catch {
    return;
  }
  for (const entry of entries as unknown as Array<{ name: string; isDirectory(): boolean }>) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "archived_sessions") continue;
      walkJsonl(full, out, depth + 1);
    } else if (entry.name.endsWith(".jsonl")) {
      out.push(full);
    }
  }
}

function loadPreviewIndex(home: string): Map<string, string> {
  const map = new Map<string, string>();
  const indexFile = join(home, "history.jsonl");
  if (!existsSync(indexFile)) return map;
  let text: string;
  try {
    text = readFileSync(indexFile, "utf-8");
  } catch {
    return map;
  }
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue;
    try {
      const obj = JSON.parse(line) as { session_id?: unknown; text?: unknown };
      if (typeof obj.session_id === "string" && typeof obj.text === "string" && obj.text.trim()) {
        map.set(obj.session_id, oneLine(obj.text));
      }
    } catch {
      continue;
    }
  }
  return map;
}

export function parseCodexMeta(
  file: string,
): { id: string; sessionId: string | null; cwd: string | null } | null {
  const head = readHead(file, 65536);
  if (head === null) return null;
  const first = head.split("\n", 1)[0] ?? "";
  if (!first.startsWith("{")) return null;
  try {
    const obj = JSON.parse(first) as {
      type?: unknown;
      payload?: { id?: unknown; session_id?: unknown; cwd?: unknown };
    };
    if (obj.type !== "session_meta" || !obj.payload) return null;
    const { id, session_id, cwd } = obj.payload;
    if (typeof id !== "string") return null;
    return {
      id,
      sessionId: typeof session_id === "string" ? session_id : null,
      cwd: typeof cwd === "string" ? cwd : null,
    };
  } catch {
    return null;
  }
}

export function scanCodex(
  home: string = nativeHome("codex"),
  limit: number = NATIVE_PARSE_LIMIT,
): ScanResult {
  const sessionsDir = join(home, "sessions");
  if (!existsSync(sessionsDir)) return { items: [], total: 0 };
  const previews = loadPreviewIndex(home);
  const files: string[] = [];
  walkJsonl(sessionsDir, files);
  const withTime: Array<{ file: string; mtime: number }> = [];
  for (const file of files) {
    try {
      withTime.push({ file, mtime: statSync(file).mtimeMs });
    } catch {
      continue;
    }
  }
  withTime.sort((a, b) => b.mtime - a.mtime);
  const out: NativeSession[] = [];
  for (const { file, mtime } of withTime.slice(0, limit)) {
    const meta = parseCodexMeta(file);
    if (!meta) continue;
    const preview =
      parseCodexFirstUser(file) ??
      previews.get(meta.id) ??
      (meta.sessionId ? previews.get(meta.sessionId) : undefined) ??
      null;
    out.push({
      harness: "codex",
      id: meta.id,
      dir: meta.cwd,
      preview,
      updatedAt: mtime,
      file,
    });
  }
  return { items: out, total: withTime.length };
}

/** First non-injected user message in the rollout (skips `<tag>` system blocks). */
export function parseCodexFirstUser(file: string): string | null {
  const head = readHead(file, 131072);
  if (head === null) return null;
  for (const line of head.split("\n").slice(0, 120)) {
    if (!line.startsWith("{")) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const payload = obj.payload as Record<string, unknown> | undefined;
    if (!payload || payload.role !== "user") continue;
    const content = payload.content;
    const texts: string[] = [];
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (
          typeof part === "object" &&
          part !== null &&
          typeof (part as Record<string, unknown>).text === "string"
        ) {
          texts.push((part as Record<string, unknown>).text as string);
        }
      }
    }
    for (const text of texts) {
      const trimmed = text.trim();
      if (trimmed && !trimmed.startsWith("<")) return oneLine(trimmed);
    }
  }
  return null;
}
