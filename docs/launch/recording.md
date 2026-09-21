# Record the 22-second session loop

Record actual terminal behavior on Linux with tmux and an installed Atlas
release. Use two terminal windows on the same machine, approximately 100
columns × 28 rows with legible text. Disable notifications. Use a clean demo
OS user with no personal conversations or other tmux sessions; an alternate
history file alone does not isolate native stores or tmux.

The existing [GIF](../atlas-demo.gif) is illustrated. This plan produces a
separate live clip; do not relabel the supplied GIF as live footage.

## Prepare before the clock starts

In terminal 1, under the dedicated demo user:

```sh
mkdir -p "$HOME/atlas-demo"
git clone https://github.com/DEVxEAZY/atlas-cli.git "$HOME/atlas-demo/atlas-cli"
export ATLAS_ROOTS="$HOME/atlas-demo"
export ATLAS_HISTORY_FILE="$HOME/atlas-demo/history.json"
tmux -V
atlas --help
atlas --dir "$HOME/atlas-demo/atlas-cli" --runtime codex
```

Codex must already be installed and authenticated for this version of the
recording. Give it this benign prompt before recording:

```text
Read cli-node/package.json and summarize the build and test commands. Do not modify any files or run network commands.
```

Wait through agent startup and any approval prompts. Capture its actual
state; if the task finishes, an idle agent prompt is fine. Do not invent output
or imply Atlas made the agent faster. A shell-only version can use `--runtime
shell`; label that version as a shell demonstration, not an agent run.

In terminal 2, before recording:

```sh
export ATLAS_ROOTS="$HOME/atlas-demo"
export ATLAS_HISTORY_FILE="$HOME/atlas-demo/history.json"
clear
```

Have `atlas` typed at the prompt, ready to press Enter. Confirm that terminal
1 uses tmux's default `Ctrl-b` prefix. The agent session remains the same
throughout; do not launch another session for the re-entry shot.

## Exact storyboard: 22 seconds

| Time | Live action | English caption outside the TUI |
| --- | --- | --- |
| 0.0–3.0 | Hold terminal 1 on the existing Codex pane. | “An agent session in one project.” |
| 3.0–5.5 | Press `Ctrl-b`, release, then `d`; show the detached shell prompt. | “Detach. Keep the session.” |
| 5.5–8.0 | Switch to terminal 2 and press Enter on `atlas`. | “Open Atlas in another terminal.” |
| 8.0–11.0 | Show the live row under `◉ agora`; use arrows to select it if needed. | “Find the running session.” |
| 11.0–15.5 | Press `Enter`; hold the captured pane preview. | “Preview before you attach.” |
| 15.5–19.0 | Press `Enter` again; show the same Codex pane now attached in terminal 2. | “Re-enter the same session.” |
| 19.0–22.0 | Hold an end card with the repository URL. | “Every coding-agent session. One terminal hub.” |

End card URL: `github.com/DEVxEAZY/atlas-cli`. Keep the actual TUI text in
pt-BR. Add a small “Linux · tmux · same machine” line on the end card.
No voiceover is required. Rehearse the window switch so the live sequence
fits; if loading takes longer, retake or disclose cuts rather than presenting
sped-up footage as real-time latency evidence. The final end card is an edit.

After recording, detach or exit the demo session deliberately. Review every
frame for credentials, real paths, and conversation content. Export a 22-second
video and an optional GIF with readable text. Do not overwrite the tracked
illustrative assets without updating their provenance documentation.
