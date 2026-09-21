/** Runtime (harness) definitions and availability checks. */

import { which } from "bun";

export interface Runtime {
  name: string;
  label: string;
  argv: string[];
}

export const RUNTIMES: Runtime[] = [
  { name: "codex", label: "Codex", argv: ["codex"] },
  { name: "claude", label: "Claude", argv: ["claude"] },
  { name: "muse", label: "Muse", argv: ["muse"] },
  { name: "shell", label: "Terminal", argv: ["$SHELL"] },
];

export const RUNTIME_ORDER = ["codex", "claude", "muse", "shell"] as const;

export function getRuntime(name: string): Runtime {
  const runtime = RUNTIMES.find((r) => r.name === name);
  if (!runtime) throw new Error(`runtime desconhecido: ${name}`);
  return runtime;
}

export function isAvailable(runtime: Runtime): boolean {
  if (runtime.name === "shell") return true;
  return which(runtime.argv[0]) !== null;
}

export function cycleRuntime(current: string): string {
  const i = RUNTIME_ORDER.indexOf(current as (typeof RUNTIME_ORDER)[number]);
  if (i === -1) return RUNTIME_ORDER[0];
  return RUNTIME_ORDER[(i + 1) % RUNTIME_ORDER.length];
}
