# Atlas CLI

## Every coding-agent session. One terminal hub.

Find, preview, and re-enter your Codex, Claude, Muse, and shell sessions on the
same machine. Atlas is a Linux terminal UI backed by tmux. The TUI is pt-BR;
documentation is English.

![Atlas: detach an agent, find it from another terminal, preview and re-enter it](docs/atlas-demo.gif)

*22-second illustrative demo, reconstructed from the TUI; not a live recording.
[Static screenshot](docs/atlas-hub.svg) · [How the visuals were made](docs/demo/README.md)*

- **Pick up where you left off.** Find running sessions and native agent conversations in one hub.
- **Move between terminals.** Detach, preview output, and attach to the same tmux session on the same machine.
- **Start in the right project.** Choose a directory and runtime, or paste a path; Atlas remembers your recent sessions.

## Install

Linux x86_64 and arm64 are supported. The release binary includes Bun; no
separate language runtime is needed. Install [tmux](https://github.com/tmux/tmux)
for persistent sessions and cross-terminal management. Without tmux, Atlas
can launch directly in the current terminal.

For coding-agent sessions, install and authenticate Codex, Claude, or Muse
separately and make its command available on `PATH`. You can try Atlas with
a plain shell first.

Download from [v0.1.0 releases](https://github.com/DEVxEAZY/atlas-cli/releases/tag/v0.1.0):

| Linux architecture (`uname -m`) | Archive | Checksum |
| --- | --- | --- |
| `x86_64` | [atlas-linux-x64.tar.gz](https://github.com/DEVxEAZY/atlas-cli/releases/download/v0.1.0/atlas-linux-x64.tar.gz) | [SHA-256](https://github.com/DEVxEAZY/atlas-cli/releases/download/v0.1.0/atlas-linux-x64.tar.gz.sha256) |
| `aarch64` / `arm64` | [atlas-linux-arm64.tar.gz](https://github.com/DEVxEAZY/atlas-cli/releases/download/v0.1.0/atlas-linux-arm64.tar.gz) | [SHA-256](https://github.com/DEVxEAZY/atlas-cli/releases/download/v0.1.0/atlas-linux-arm64.tar.gz.sha256) |

For x86_64, run the following. On arm64, replace `atlas-linux-x64` with
`atlas-linux-arm64` on the first line. Downloads stay in a temporary directory.

```sh
atlas_asset=atlas-linux-x64
(
  atlas_download_dir=$(mktemp -d) &&
  cd "$atlas_download_dir" &&
  curl -fLO "https://github.com/DEVxEAZY/atlas-cli/releases/download/v0.1.0/$atlas_asset.tar.gz" &&
  curl -fLO "https://github.com/DEVxEAZY/atlas-cli/releases/download/v0.1.0/$atlas_asset.tar.gz.sha256" &&
  sha256sum --check "$atlas_asset.tar.gz.sha256" &&
  tar -xzf "$atlas_asset.tar.gz" &&
  mkdir -p "$HOME/.local/bin" &&
  install -m 0755 "$atlas_asset" "$HOME/.local/bin/atlas"
) && export PATH="$HOME/.local/bin:$PATH" && atlas --help
```

If needed, add that `PATH` export to your shell startup file.
[Release notes](docs/releases/v0.1.0.md) include platform details.

## First run

```sh
atlas
```

Press `n`, paste an existing project path, press `Enter`, then select a
runtime. Choose **Terminal** to try a shell without an agent account.
With tmux installed, detach using `Ctrl-b`, then `d`. Open `atlas` in
another terminal, select the running session, press `Enter` to preview it,
then `Enter` again to attach.

The interface is **Brazilian Portuguese (pt-BR)**: `agora` means running now,
`Recentes` means recent sessions, and `Conversas` means conversations.

To discover projects automatically, set your own scan roots:

```sh
export ATLAS_ROOTS="$HOME/projects:$HOME/work"
atlas
```

Any existing directory can also be pasted into the picker without configuring
roots. The default roots are `~/@development` and `~/@megavale-repos`.

## Everyday use

| Action | Keys |
| --- | --- |
| Navigate / open / resume | Arrow keys / `Enter` |
| New session / filter | `n` / `/` |
| Preview a running tmux session / attach | `Enter` / `Enter` again |
| Leave a preview / quit Atlas | `Esc` / `Ctrl-c` |
| End the selected running session | `X`, then `X` again to confirm |
| Migrate an external agent session into tmux | `T`, then `T` again (requires a resume ID) |
| Detach inside tmux without ending the session | `Ctrl-b`, then `d` (default tmux prefix) |

For a deliberate second session in the same directory, use `n`. Opening a
running row shows its management view. Ending a session stops its work;
detaching leaves it running.

Migration stops the external process and resumes its conversation in a
detached tmux session. It works from conversation and history rows; history
rows need one unambiguous resume ID. Atlas refuses unsupported or ambiguous
migrations with guidance.

```sh
atlas --list
atlas --dir "$HOME/projects/my-app" --runtime codex
atlas --dir "$HOME/projects/my-app" --runtime shell --print
```

`--print` shows the launch command without starting a session.

## Local data and privacy

Atlas stores session history at `~/.local/share/atlas/history.json` and reads
local Claude, Codex, and Muse conversation stores to list and resume them.
Previews may display conversation text, terminal output, and local paths.
Use `ATLAS_HISTORY_FILE` to select another history file.

Atlas does not upload your data, run an Atlas daemon, or require an Atlas
cloud account. Agent CLIs retain their own authentication, network behavior,
and data policies. Avoid sharing screenshots or logs containing secrets.

## How it works and limitations

The maintained implementation is [Bun + TypeScript + Ink](cli-node/README.md).
Atlas discovers real directories, reads local history and native conversation
stores, and launches installed runtimes. tmux owns persistent sessions;
Atlas captures pane output for previews and hands the terminal to tmux when
you attach. `ATLAS_TMUX_BIN` can override tmux discovery on `PATH`.

Atlas-created tmux sessions use
`atlas-<dir>-<runtime>-<hash>[-r<resume>][-N]`. Foreign tmux sessions linked
to a history row or live conversation mark that row `𖥠` instead of appearing
twice. Unlinked agent sessions and orphaned `atlas-*` sessions appear under
`◈ sessões tmux`; idle foreign shells are omitted.

- Linux is the supported platform; macOS and Windows binaries are not provided.
- Cross-terminal session management requires tmux. Direct launch remains available without it.
- Native conversation discovery depends on agent storage formats and may need updates as those CLIs change. Not every arbitrary process is discoverable.
- Atlas manages the machine where it runs, including an already-remote shell. It does not connect over SSH, synchronize machines, or orchestrate agents in the cloud.
- The TUI is currently pt-BR only. English documentation does not imply an English interface.

The original Python prototype in `cli/` is retained for reference; development
targets `cli-node/`.

## Build from source

Install [Bun](https://bun.sh) (release builds use 1.4.2), then:

```sh
git clone https://github.com/DEVxEAZY/atlas-cli.git
cd atlas-cli/cli-node
bun install --frozen-lockfile
bun run build
mkdir -p "$HOME/.local/bin"
install -m 0755 dist/atlas "$HOME/.local/bin/atlas"
export PATH="$HOME/.local/bin:$PATH"
atlas
```

## Help and contribute

Try the detach → preview → re-enter flow and tell us where it breaks or feels
unclear. [Support](SUPPORT.md) explains where to ask questions or report bugs.
See [Contributing](CONTRIBUTING.md), the [roadmap](ROADMAP.md), and our
[Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately using
the [security policy](SECURITY.md).

## License

[MIT](LICENSE).
