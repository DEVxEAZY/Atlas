/** Runs launch() in a child process (launch execs, so it cannot run
 *  in-process). Usage: bun launch-probe.ts <dir> <runtime> <history> [attach] */
import { launch } from "../../src/main";

const [target, runtime, history, attach] = process.argv.slice(2);
process.env.ATLAS_HISTORY_FILE = history;
const code = await launch(target, runtime, attach ? { attachTmux: attach } : {});
process.exit(code);
