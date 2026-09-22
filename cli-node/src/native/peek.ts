/** Read-only transcript peek for the running-session view (bounded tail). */

import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { oneLine, typedText, type Harness } from "./types";

/** Last maxBytes of a file (never loads multi-MB logs fully). */
export function readTail(file: string, maxBytes: number): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const size = fstatSync(fd).size;
    const n = Math.min(size, Math.min(maxBytes, 262144));
    if (n <= 0) return "";
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, size - n);
    return buf.toString("utf-8");
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

export interface PeekLine {
  role: "você" | "agente";
  text: string;
}

/** Harnesses with a readable line transcript (muse's log is opaque frames). */
export const TRANSCRIPT_PEEK: Record<Harness, boolean> = {
  claude: true,
  codex: true,
  muse: false,
};

function textParts(content: unknown): string[] {
  const out: string[] = [];
  if (typeof content === "string") {
    out.push(content);
    return out;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part !== "object" || part === null) continue;
      const rec = part as Record<string, unknown>;
      if (typeof rec.text === "string") out.push(rec.text);
    }
  }
  return out;
}

function peekClaudeLine(line: string): PeekLine | null {
  if (!line.startsWith("{")) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (obj.isSidechain === true || obj.isMeta === true) return null;
  const role = obj.type === "user" ? "você" : obj.type === "assistant" ? "agente" : null;
  if (!role) return null;
  const message = obj.message as Record<string, unknown> | undefined;
  const content = typeof message === "string" ? message : message?.content;
  for (const text of textParts(content)) {
    // `<command-name>`, `<local-command-stdout>`…: harness echoes, not turns
    const shown = role === "você" ? typedText(text) : text.trim();
    if (shown) return { role, text: oneLine(shown) };
  }
  return null;
}

function peekCodexLine(line: string): PeekLine | null {
  if (!line.startsWith("{")) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  const payload = obj.payload as Record<string, unknown> | undefined;
  if (!payload) return null;
  const role = payload.role === "user" ? "você" : payload.role === "assistant" ? "agente" : null;
  if (!role) return null;
  for (const text of textParts(payload.content)) {
    const trimmed = text.trim();
    if (trimmed && !trimmed.startsWith("<")) return { role, text: oneLine(trimmed) };
  }
  return null;
}

/** Last readable (role, text) lines of a session log; [] when unsupported/unreadable. */
export function peekTranscript(harness: Harness, file: string, maxLines = 200): PeekLine[] {
  if (!TRANSCRIPT_PEEK[harness]) return [];
  const tail = readTail(file, 65536);
  if (tail === null) return [];
  const out: PeekLine[] = [];
  for (const line of tail.split("\n")) {
    const parsed = harness === "claude" ? peekClaudeLine(line) : peekCodexLine(line);
    if (parsed) out.push(parsed);
  }
  return out.slice(-maxLines);
}
