/** Test preload: scheduled tasks live in a throwaway directory and the
 *  "crontab" is a file, so no test ever reads or writes the real one. */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "atlas-cron-test-"));
process.env.ATLAS_CRON_DIR = join(root, "jobs");
process.env.ATLAS_CRON_STATE_DIR = join(root, "state");
process.env.ATLAS_CRONTAB_FILE = join(root, "crontab");

// a developer's ATLAS_GLYPHS=safe must not change expected output
// (tests/glyphs.test.ts covers both sets)
delete process.env.ATLAS_GLYPHS;

// the footer's sail setting lives in a throwaway file, never the real one
process.env.ATLAS_SETTINGS_FILE = join(root, "settings.json");
