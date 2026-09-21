/** Claude Code store: ~/.claude/projects/<slug>/<sessionId>.jsonl */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { NATIVE_PARSE_LIMIT, nativeHome, oneLine, readHead, type NativeSession } from "./types";

interface Parsed {
  cwd: string | null;
  preview: string | null;
}

export function parseClaudeFile(file: string): Parsed {
  const head = readHead(file, 65536);
  if (head === null) {
    return { cwd: null, preview: null };
  }
  for (const line of head.split("\n").slice(0, 80)) {
    if (!line.startsWith("{")) continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    if (obj.type !== "user") continue;
    const cwd = typeof obj.cwd === "string" ? obj.cwd : null;
    const preview = extractText(obj.message);
    if (cwd !== null || preview !== null) return { cwd, preview };
  }
  return { cwd: null, preview: null };
}

function extractText(message: unknown): string | null {
  if (typeof message === "string") return oneLine(message);
  if (typeof message === "object" && message !== null) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") return oneLine(content);
    if (Array.isArray(content)) {
      const part = content.find(
        (p): p is { type: string; text: string } =>
          typeof p === "object" && p !== null && (p as Record<string, unknown>).type === "text",
      );
      if (part && typeof part.text === "string") return oneLine(part.text);
    }
  }
  return null;
}

export interface ScanResult {
  items: NativeSession[];
  total: number;
}

export function scanClaude(
  home: string = nativeHome("claude"),
  limit: number = NATIVE_PARSE_LIMIT,
): ScanResult {
  const projects = join(home, "projects");
  if (!existsSync(projects)) return { items: [], total: 0 };
  const files: Array<{ file: string; mtime: number }> = [];
  let slugs: string[];
  try {
    slugs = readdirSync(projects);
  } catch {
    return [];
  }
  for (const slug of slugs) {
    const dir = join(projects, slug);
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(dir, name);
      try {
        files.push({ file, mtime: statSync(file).mtimeMs });
      } catch {
        continue;
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const out: NativeSession[] = [];
  for (const { file, mtime } of files.slice(0, limit)) {
    const { cwd, preview } = parseClaudeFile(file);
    out.push({
      harness: "claude",
      id: basename(file, ".jsonl"),
      dir: cwd,
      preview,
      updatedAt: mtime,
      file,
    });
  }
  return { items: out, total: files.length };
}
