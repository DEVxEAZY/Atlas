# Changelog

All notable changes to Atlas are documented in this file.

## [Unreleased]

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
