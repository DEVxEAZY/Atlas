/** Proves execArgv replaces the image: execs sh to append a marker, then
 *  (unreachable on success) appends a failure marker. Usage:
 *  bun exec-probe.ts <marker-file> */
import { appendFileSync } from "node:fs";
import { execArgv } from "../../src/tmux";

const marker = process.argv[2];
try {
  execArgv("sh", ["sh", "-c", `echo replaced >> '${marker}'`]);
} catch {
  appendFileSync(marker, "EXEC-FAILED\n");
  process.exit(3);
}
appendFileSync(marker, "STILL-HERE\n");
