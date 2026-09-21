# Atlas CLI/TUI (validation prototype)

Validates the core Atlas flow without the desktop app: **pick a real
directory → open a runtime (Codex, Claude, Muse) or a shell in it → resume
later from history.**

Superseded by the maintained port in [../cli-node](../cli-node); kept for
reference.

## Usage

```sh
cd cli
uv sync          # creates the local .venv and installs deps
uv run atlas     # open the TUI
```

To have the `atlas` command in any terminal (run once):

```sh
ln -s "$PWD/.venv/bin/atlas" ~/.local/bin/atlas
```

## In the TUI

| Screen | Keys |
|---|---|
| Recents | `Enter` open · `n` new session · `r` switch runtime · `d` remove · `/` filter · `q` quit |
| New session | type to filter or paste a path · `Enter` confirm · `Esc` back |
| Runtime | `Enter` on the desired runtime · `Esc` back |

On confirm, the TUI exits and the runtime **takes over the current
terminal**, already in the chosen directory.

## Flags (no TUI)

```sh
atlas --list                              # recent sessions
atlas --dir ~/repo --runtime codex        # open directly
atlas --dir ~/repo --runtime claude --print  # print the command only
```

## Data and configuration

- History: `~/.local/share/atlas/history.json`
- `ATLAS_ROOTS`: scanned domain roots, `:`-separated (default:
  `~/@development:~/@megavale-repos`)
- `ATLAS_HISTORY_FILE`: alternate history path (handy in tests)

## Tests

```sh
uv run pytest tests/ -q
```
