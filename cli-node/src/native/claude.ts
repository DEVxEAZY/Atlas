/** Claude Code store: ~/.claude/projects/<slug>/<sessionId>.jsonl */

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  NATIVE_PARSE_LIMIT,
  nativeHome,
  oneLine,
  readHead,
  typedText,
  type NativeSession,
} from "./types";

interface Parsed {
  cwd: string | null;
  preview: string | null;
}

/** Head windows tried in order: attachments and hook output can push the
 *  first typed prompt past 64 KB, so a miss retries once, wider. */
export const CLAUDE_HEAD_WINDOWS = [65536, 524288];

export function parseClaudeFile(file: string): Parsed {
  let cwd: string | null = null;
  for (const window of CLAUDE_HEAD_WINDOWS) {
    const head = readHead(file, window);
    if (head === null) return { cwd, preview: null };
    const whole = Buffer.byteLength(head) < window;
    const lines = head.split("\n");
    if (!whole) lines.pop(); // cut mid-record by the window
    for (const line of lines) {
      if (!line.startsWith("{")) continue;
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }
      if (obj.type !== "user") continue;
      if (cwd === null && typeof obj.cwd === "string") cwd = obj.cwd;
      // harness-injected turns (command caveats, slash-command echoes, skill
      // bodies) are not what the user asked: keep looking for a real prompt
      if (obj.isMeta === true) continue;
      const preview = extractText(obj.message);
      if (preview !== null) return { cwd, preview };
    }
    if (whole) break; // the whole file was read
  }
  return { cwd, preview: null };
}

/** First user-typed text part; `<tag>` blocks are injected, not typed. */
function extractText(message: unknown): string | null {
  const texts: string[] = [];
  if (typeof message === "string") texts.push(message);
  else if (typeof message === "object" && message !== null) {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const p of content) {
        if (typeof p !== "object" || p === null) continue;
        const rec = p as Record<string, unknown>;
        if (rec.type === "text" && typeof rec.text === "string") texts.push(rec.text);
      }
    }
  }
  for (const text of texts) {
    const typed = typedText(text);
    if (typed) return oneLine(typed);
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
    return { items: [], total: 0 };
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
