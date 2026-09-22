# Changelog

All notable changes to Atlas are documented in this file.

## [0.3.0] - 2026-09-22

- Double `T` in the Hub moves the selected row into tmux in the background:
  a session or conversation running elsewhere is stopped and resumed in a
  detached tmux session; an idle conversation opens there directly. The
  management view shares the same migration logic.
- Migration is safe to attempt: tmux (it must actually run), the directory
  and the runtime are checked before anything is stopped; a group where a
  process holds no resume id is refused; a live conversation relaunches in
  its process's directory. While a migration runs, every screen ignores
  keys and quitting waits for it, so an agent is never left stopped. An
  armed `X`/`T` is disarmed by any other key, even when keys arrive
  together over a slow link. `ATLAS_TMUX_BIN=""` forces direct launch.
- Fixed scrolling glitches on many terminals: the TUI now draws on the
  alternate screen (like vim or htop), so the mouse wheel no longer scrolls
  back through stale frames and the shell screen is restored on exit. List
  rows, titles, headers and hints truncate instead of wrapping; a wrapped
  row made frames taller than the terminal, which Ink redraws with a full
  clear on every tick. Every screen now budgets its rows from the live
  window size, so resizing re-fits the list.
- A little ASCII boat sails the footer of every screen as an endless
  loading loop. `ATLAS_NO_BOAT=1` hides it; it only appears where two more
  rows still fit the screen (never below 18 rows).
- The wide Hub hint bar lists `T tmux` and drops `/ filtrar`, which the
  filter placeholder already shows.
- README install links follow the latest release; added a WSL note for the
  `EBADPLATFORM` error when Windows `npm` runs inside WSL.

## [0.2.0] - 2026-09-22

- Published on npm as `@devxeazy/atlas-cli` (requires Bun on `PATH`).

- `atlas DIR` (for example `atlas .`) re-enters a directory's session: it
  attaches to a live Atlas tmux session, opens the management view of an
  agent already running there, starts the last-used runtime, or asks for one.
  `--runtime` still forces a runtime.
- Codex conversations whose `session_meta` line outgrows the 64 KB read
  window (it embeds the full base instructions) are still discovered instead
  of silently disappearing from `Conversas`.
- Claude conversations whose first prompt sits past 64 KB (large
  attachments or hook output) now show their directory and preview, so
  resuming them starts in the right project instead of `~`. Previews skip
  harness-injected turns (command caveats, slash-command echoes, skill
  bodies) in the list and in the running-session transcript.
- `--dir .` and other relative or `~` paths name the same tmux session as
  their absolute path, so every terminal finds it.
- `--print` no longer attaches when the chosen action is entering a running
  tmux session; it prints the attach command.
- The filtered `Conversas` count now matches the rows shown (full history
  once loaded, `/tmp` visibility respected).
- Added `bun run typecheck` to CI and fixed the type errors it found.
- Added a [pt-BR UI glossary](docs/ui-glossary.md) and synthetic tests for
  partially written Codex records.

## [0.1.0] - 2026-09-21

- First public release of the terminal session manager for Codex, Claude,
  Muse, and shell workflows.
- Added an Ink-based TUI for opening, finding, previewing, resuming, attaching
  to, and ending sessions by directory.
- Added tmux-backed cross-terminal session management, native conversation
  discovery, recent-session history, filtering, and guarded destructive
  actions.
- Added standalone Linux x86_64 and arm64 release binaries with SHA-256
  checksums; Bun is not required to run them.

[0.1.0]: https://github.com/DEVxEAZY/atlas-cli/releases/tag/v0.1.0
