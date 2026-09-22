# Atlas development

This directory contains the maintained Bun + TypeScript + Ink application.
For installation and everyday use, start with the [root README](../README.md).
The Python prototype in `../cli/` is not the development target.

## Run, test, build

From the repository root, with Bun installed (release builds pin 1.4.2):

```sh
cd cli-node
bun install --frozen-lockfile
bun run atlas
bun run typecheck
bun test tests/
bun run build
```

`bun run build` produces the standalone `dist/atlas` binary for the build
machine. The [release workflow](../.github/workflows/release.yml) builds
`bun-linux-x64-baseline` and `bun-linux-arm64`, archives each executable,
and attaches SHA-256 checksums. The release version lives in `package.json`.
CI installs with the frozen lockfile, typechecks, runs the full suite, and builds.

`bun run pack:npm` stages the npm package in `dist/npm`: a single
Bun-targeted bundle (dependencies inlined), a generated `package.json` for
`@devxeazy/atlas-cli`, the root README with repository-absolute links, and
the license. Publish with `npm publish dist/npm` after bumping the version.

Tests expect commands named `codex`, `claude`, and `muse` on `PATH`; CI uses
no-op shims. Tests use fixtures/fake tmux and do not require agent accounts.
If those commands are absent locally, use temporary shims for tests only:

```sh
atlas_test_bin=$(mktemp -d)
for runtime in codex claude muse; do
  printf '#!/bin/sh\nexit 0\n' > "$atlas_test_bin/$runtime"
  chmod +x "$atlas_test_bin/$runtime"
done
PATH="$atlas_test_bin:$PATH" bun test tests/
```

Do not use these shims for interactive agent sessions. See
[Contributing](../CONTRIBUTING.md) for review expectations.

## Source map

| File or directory | Responsibility |
| --- | --- |
| `src/main.tsx` | CLI arguments, launch planning, process handoff |
| `src/App.tsx`, `src/screens/` | Screen transitions and Ink UI |
| `src/components/`, `src/theme.ts` | Shared UI and display conventions |
| `src/repos.ts`, `src/rows.ts` | Filesystem discovery, grouping, filtering |
| `src/runtimes.ts` | Runtime availability, launch and resume arguments |
| `src/history.ts` | Local session history |
| `src/native/` | Native conversation adapters and previews |
| `src/tmux.ts`, `src/process.ts` | Session lifecycle and live process discovery |
| `tests/` | Unit, TUI, process, and stress tests |

## Behavior to preserve

Opening a live row shows a management view; `n` explicitly creates a new
session. Double `X` confirms termination. Removing running history is refused.
Atlas-created tmux sessions use
`atlas-<dir>-<runtime>-<hash>[-r<resume>][-N]`; history rows also recognize
resume-suffixed sessions. A foreign tmux session linked to a history row or
live conversation marks that row `𖥠` instead of appearing twice. Unlinked
agent sessions and orphaned `atlas-*` sessions can appear under
`◈ sessões tmux`. Idle foreign shells are omitted. Atlas turns mouse mode on
for every session it creates or enters, so wheel scroll works; the
server-wide default stays untouched.

Outside tmux, attach uses process handoff; inside tmux, Atlas switches the
current client. Missing tmux falls back to direct runtime launch. Native
conversations resume through each runtime's own arguments, not a replacement
conversation store. Keep the shipped UI in pt-BR and launch documentation in
English unless a localization change is explicitly designed.

External conversation and history rows offer double `T` (in the Hub and in
the management view) to migrate into tmux in the background. Migration stops the external processes before resuming the
conversation. History rows require exactly one resume ID; shell sessions,
missing IDs, and ambiguous groups are refused with guidance. Verify
runtime-specific behavior before changing this path.
`r` refreshes a tmux preview. `d` removes non-running history entries.

## Data and development isolation

| Setting | Default / purpose |
| --- | --- |
| `ATLAS_ROOTS` | Colon-separated roots; default `~/@development:~/@megavale-repos` |
| `ATLAS_HISTORY_FILE` | Defaults to `~/.local/share/atlas/history.json` |
| `ATLAS_TMUX_BIN` | Override the tmux executable (empty = no tmux, direct launch); default lookup on `PATH` |
| `ATLAS_NO_BOAT` | Set to `1` to hide the footer boat (`ོ𓂃𖠳𓂃`) |

Use disposable repositories and an alternate history file for manual checks.
History isolation alone does not hide native conversations or other tmux
sessions. Use a separate OS user for clean screenshots or invasive lifecycle
experiments. Never commit real conversation transcripts, credentials, or
private repository paths. The history format is shared with the Python
prototype; preserve compatibility when changing it.

## Launch assets

[Release notes](../docs/releases/v0.1.0.md), [visual sources](../docs/demo/README.md),
and the [launch kit](../docs/launch/README.md) live outside this directory.
