/** Unified native harness sessions (claude / codex / muse local stores). */

export type Harness = "claude" | "codex" | "muse";

export interface NativeSession {
  harness: Harness;
  id: string; // resume ref
  dir: string | null;
  preview: string | null;
  updatedAt: number; // ms epoch
  file: string;
}

/** Parsed per harness (bounded for startup speed). */
export const NATIVE_PARSE_LIMIT = 40;
/** Shown per harness without a filter. */
export const NATIVE_SHOW_LIMIT = 12;

export function nativeHome(harness: Harness): string {
  const { homedir } = require("node:os") as typeof import("node:os");
  const { join } = require("node:path") as typeof import("node:path");
  switch (harness) {
    case "claude":
      return process.env.ATLAS_CLAUDE_HOME ?? join(homedir(), ".claude");
    case "codex":
      return process.env.ATLAS_CODEX_HOME ?? join(homedir(), ".codex");
    case "muse":
      return (
        process.env.ATLAS_MUSE_HOME ?? join(homedir(), ".local", "share", "muse")
      );
  }
}

export function oneLine(text: string, max = 90): string {
  const flat = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(<[^<>]{1,40}>\s*)+/, "");
  const clean = flat || text.replace(/\s+/g, " ").trim();
  return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
}

/** Text left after leading harness-injected `<tag>…</tag>` blocks (command
 *  echoes, caveats, IDE context); null when nothing typed remains. */
export function typedText(text: string): string | null {
  let rest = text.trim();
  for (;;) {
    const m = /^<([A-Za-z][\w-]*)[^>]*>[\s\S]*?<\/\1>\s*/.exec(rest);
    if (!m) break;
    rest = rest.slice(m[0].length);
  }
  return rest && !rest.startsWith("<") ? rest : null;
}

/** Read at most maxBytes from the start of a file (never loads multi-MB logs fully). */
export function readHead(file: string, maxBytes: number): string | null {
  const { closeSync, openSync, readSync } = require("node:fs") as typeof import("node:fs");
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(Math.min(maxBytes, 1048576));
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).toString("utf-8");
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
