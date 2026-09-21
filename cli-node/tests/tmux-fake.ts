/** Fake-tmux harness: points ATLAS_TMUX_BIN at the stub so the tmux
 *  module talks to it (Bun.which snapshots PATH at startup, so PATH games
 *  would not work). Canned sessions/pane plus a call log. */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FakeTmux {
  dir: string;
  restore: () => void;
}

export function setupFakeTmux(
  sessions: string[] = [],
  pane: string[] = [],
  panes: string[] = [],
): FakeTmux {
  const dir = mkdtempSync(join(tmpdir(), "atlas-faketmux-"));
  writeFileSync(join(dir, "sessions"), sessions.length ? sessions.join("\n") + "\n" : "");
  writeFileSync(join(dir, "pane"), pane.length ? pane.join("\n") + "\n" : "");
  writeFileSync(join(dir, "panes"), panes.length ? panes.join("\n") + "\n" : "");
  writeFileSync(join(dir, "calls"), "");
  const prevBin = process.env.ATLAS_TMUX_BIN;
  const prevState = process.env.TMUX_FAKE_STATE;
  process.env.ATLAS_TMUX_BIN = join(import.meta.dir, "fixtures", "bin", "tmux");
  process.env.TMUX_FAKE_STATE = dir;
  return {
    dir,
    restore: () => {
      if (prevBin === undefined) delete process.env.ATLAS_TMUX_BIN;
      else process.env.ATLAS_TMUX_BIN = prevBin;
      if (prevState === undefined) delete process.env.TMUX_FAKE_STATE;
      else process.env.TMUX_FAKE_STATE = prevState;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Logged stub invocations (one per line, without read-only commands). */
export function fakeCalls(fake: FakeTmux): string[] {
  const raw = readFileSync(join(fake.dir, "calls"), "utf-8").trim();
  return raw ? raw.split("\n") : [];
}

export function writeFakePane(fake: FakeTmux, pane: string[]): void {
  writeFileSync(join(fake.dir, "pane"), pane.length ? pane.join("\n") + "\n" : "");
}
