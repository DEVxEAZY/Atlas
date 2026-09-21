# Atlas CLI/TUI (Node — the maintained tool)

Opens a runtime (Codex, Claude, Muse) or a shell in the right directory, with
session history. Stack: Bun + TypeScript + Ink (React), shipped as a **single
binary** — same idea as `muse`/`claude`, no venv.

The history file (`~/.local/share/atlas/history.json`) shares its format with
the Python prototype, so sessions carry over between versions.

## Dev usage

```sh
cd cli-node
bun install        # once
bun run atlas      # open the TUI
bun test tests/    # 123 tests
```

## Installing the binary

```sh
cd cli-node
bun run build                  # produces dist/atlas (~100MB, standalone)
install dist/atlas ~/.local/bin/atlas
```

After that, `atlas` works from any directory.

## In the TUI

Home screen (hub): collapsed `▸ Recentes` + `▸ Conversas` + navigable domains.
Conversations reads the native Claude (`~/.claude`), Codex (`~/.codex`), and
Muse (`~/.local/share/muse`) stores, grouped by harness — `Enter` resumes the
conversation in its original runtime (`--resume` / `resume <id>`).
Sessions with a live agent get an animated indicator, pin to the top, and
open their sections on their own; `Enter` on them shows the read-only view
instead of starting a conflicting second instance. tmux sessions outside the
history show up as `◈ sessões tmux`: everything under `atlas-*` (orphans
included) plus foreign sessions with an agent in a pane — `Enter` attaches,
double `X` ends them. Conversations under `/tmp` hide by default; the `…`
row at the end of the section reveals them (live ones always show).

| Screen | Keys |
|---|---|
| Hub | `Enter` expand/open/resume · `←→` collapse/expand · `n` new · `r` runtime · `d` remove (refused while running) · `X` twice to kill the row · `/` filter · `q` quit · type to filter |
| Running session (tmux 𖥠) | `Enter` attach · `r` refresh pane preview · `esc` back · `X` twice to end the session · `↑↓` scroll |
| Running session (external) | `esc` back without touching the process · `X` twice to really end it · `↑↓` scroll the log |
| Domain / New session | type to filter or paste a path · `Enter` confirm · `esc` back |
| Runtime | `↑↓` move · `Enter` pick (pre-selects the directory's last runtime) · `esc` back |

`ctrl+c` quits from anywhere. Recents expands the last 10; the filter
searches all of history. For a deliberate second instance in one directory
use `n` (New session) — `Enter` on a list never duplicates.

## tmux sessions

Atlas is only the starting point: every session opens inside tmux
(`atlas-<dir>-<runtime>-<hash>`, visible in `tmux ls`) and the atlas process
becomes the attach itself via `exec` (same PID) — only the session runs in
the terminal. Opening Atlas in another terminal shows the sessions marked
with `𖥠`: `Enter` opens the management view (pane preview via
`capture-pane`, never interrupting), `Enter` again attaches, `esc` just goes
back, double `X` ends the tmux session. Inside the session, `prefix + d`
(Ctrl-b d) detaches without killing. Running Atlas from inside tmux switches
the current client (`switch-client`) instead of nesting attach. Without tmux
installed, the session opens directly in the terminal (no cross-terminal
management).

## Flags (no TUI)

```sh
atlas --list
atlas --dir ~/repo --runtime codex
atlas --dir ~/repo --runtime claude --print
```

## Data and configuration

- History: `~/.local/share/atlas/history.json`
- `ATLAS_ROOTS`: scanned roots, `:`-separated (default:
  `~/@development:~/@megavale-repos`)
- `ATLAS_HISTORY_FILE`: alternate history path
- `ATLAS_TMUX_BIN`: alternate tmux binary (default: `PATH` lookup)
