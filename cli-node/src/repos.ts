/** Domain roots and repository discovery (real filesystem, no virtual tree). */

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

export type Kind = "domain" | "repo" | "dir";

export interface Candidate {
  path: string;
  domain: string;
  kind: Kind;
}

export function defaultRoots(): string[] {
  const override = process.env.ATLAS_ROOTS;
  if (override) return override.split(":").filter((p) => p.trim());
  return [join(homedir(), "@development"), join(homedir(), "@megavale-repos")];
}

function isGitRepo(path: string): boolean {
  return existsSync(join(path, ".git"));
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** Split a path into [domain name, path relative to domain root]. Null domain when outside roots. */
export function splitDomain(path: string, roots: string[] = defaultRoots()): [string | null, string] {
  for (const root of roots) {
    const anchor = resolve(root);
    for (const candidate of [resolve(path)]) {
      if (candidate === anchor) return [basename(anchor), ""];
      if (candidate.startsWith(anchor + "/")) return [basename(anchor), relative(anchor, candidate)];
    }
  }
  return [null, path];
}

export function classify(path: string, roots: string[] = defaultRoots(), workspaces: Set<string> = new Set()): string {
  for (const root of roots) {
    if (resolve(path) === resolve(root)) return "domain";
  }
  if (workspaces.has(resolve(path))) return "workspace";
  if (isGitRepo(path)) return "repo";
  return "dir";
}

export function discover(roots: string[] = defaultRoots(), maxDepth = 2): Candidate[] {
  const found: Candidate[] = [];
  for (const root of roots) {
    if (!isDir(root)) continue;
    const domain = basename(root);
    found.push({ path: root, domain, kind: "domain" });
    let entries: string[];
    try {
      entries = readdirSync(root).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const entry = join(root, name);
      if (!isDir(entry)) continue;
      const kind: Kind = isGitRepo(entry) ? "repo" : "dir";
      found.push({ path: entry, domain, kind });
      if (maxDepth >= 2 && kind === "dir") {
        let subs: string[];
        try {
          subs = readdirSync(entry).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        } catch {
          continue;
        }
        for (const sub of subs) {
          if (sub.startsWith(".")) continue;
          const subPath = join(entry, sub);
          if (isDir(subPath) && isGitRepo(subPath)) found.push({ path: subPath, domain, kind: "repo" });
        }
      }
    }
  }
  return found;
}
