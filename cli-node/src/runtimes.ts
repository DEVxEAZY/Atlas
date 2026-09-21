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

/** argv to start a runtime, resolving the binary from PATH. Exits the
 *  process when the binary is missing (CLI entry); library callers must
 *  pre-check with isAvailable. */
export function buildArgv(runtime: string, resume?: string): string[] {
  const def = getRuntime(runtime);
  if (def.name === "shell") return [process.env.SHELL ?? "/bin/sh"];
  const bin = which(def.argv[0]);
  if (!bin) {
    console.error(`atlas: runtime '${runtime}' não encontrado no PATH.`);
    process.exit(2);
  }
  if (resume) {
    if (def.name === "codex") return [bin, "resume", resume];
    if (def.name === "muse") return [bin, "resume", resume];
    return [bin, "--resume", resume];
  }
  return [bin, ...def.argv.slice(1)];
}

export function cycleRuntime(current: string): string {
  const i = RUNTIME_ORDER.indexOf(current as (typeof RUNTIME_ORDER)[number]);
  if (i === -1) return RUNTIME_ORDER[0];
  return RUNTIME_ORDER[(i + 1) % RUNTIME_ORDER.length];
}
