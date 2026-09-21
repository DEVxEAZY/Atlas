# Atlas — product brief

**State:** shipped TUI, in active use.

## Objective

Remove the friction of working across many directories with several coding
agents. The operator picks a real directory and a runtime (Codex, Claude,
Muse, or shell); Atlas opens it, remembers it, and later finds, enters, or
ends it — from any terminal.

A **Session** is a runtime working in a defined directory.

## Decisions

### Product and execution

1. Atlas ships as a terminal UI plus a single compiled binary (Bun +
   TypeScript + Ink). No venv, no desktop shell, no daemon.
2. With tmux available, Atlas-created sessions use a deterministic base name
   (`atlas-<dir>-<runtime>-<hash>[-r<resume>][-N]`), so any Atlas instance can
   manage them. Without tmux, Atlas launches the runtime directly.
3. Atlas never duplicates: opening a live session shows a read-only
   management view; a deliberate second instance is an explicit action.
4. Destructive keys arm on first press and act on second; removing a
   running session from history is refused with guidance.
5. Native harness sessions are respected, never corrupted: Atlas resumes
   conversations through each runtime's own resume mechanism.

### Work structure

1. A **work domain** points at a real Linux directory (`ATLAS_ROOTS`).
2. New domains follow the `@kebab-case` basename convention
   (e.g. `@development`).
3. Repositories are detected by Git; the real filesystem stays the source
   of truth — Atlas keeps no parallel tree.

### Sessions and terminals

1. **New session** offers Codex, Claude, Muse, or shell.
2. The picker works with real directories; history pre-selects each
   directory's last runtime.
3. Attaching hands the terminal to tmux via `exec` (same PID); nested
   runs switch the current client instead.
4. tmux sessions outside the history stay manageable: everything under
   `atlas-*` plus foreign sessions with an agent in a pane.

## Main flow

```text
open Atlas
  -> Hub: Recents + Conversas + tmux strays + domains
  -> Enter: expand / open / resume / attach
  -> n: New session
       -> pick a real directory
       -> pick a runtime
       -> session opens inside tmux
```

## Non-goals

- SSH client features: Atlas is a CLI for the terminal itself — it runs on
  the machine (local or already-remote) and manages that machine's sessions.
- Recreating VS Code, a terminal emulator, or an orchestration platform.
- Multi-user, RBAC, or credential sharing.
- File sync, uploads, or permission management through the UI.
- Replacing the runtimes' native conversation stores.
