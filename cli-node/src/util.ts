/** Small display helpers (UI-free so tests stay light). */

import { statSync } from "node:fs";
import { homedir } from "node:os";

export function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** PT-BR relative time, e.g. 'agora', 'há 5 min', 'há 3 h'. Accepts +00:00 and Z. */
export function ago(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return iso;
  const seconds = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} m`;
  return `há ${Math.floor(months / 12)} a`;
}

/** Collapse $HOME to ~. */
export function shorten(path: string): string {
  const home = homedir();
  if (path === home) return "~";
  if (path.startsWith(home + "/")) return "~/" + path.slice(home.length + 1);
  return path;
}

/** Truncate to a column width (narrow-pane safe). */
export function fit(text: string, width: number): string {
  const chars = [...text];
  if (chars.length <= width) return text;
  if (width <= 1) return "…".slice(0, width);
  return `${chars.slice(0, width - 1).join("")}…`;
}
