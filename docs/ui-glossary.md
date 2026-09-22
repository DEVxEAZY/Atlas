# Atlas UI glossary (pt-BR → English)

The Atlas TUI is in Brazilian Portuguese. This page explains the labels you
will see; it does not translate the interface. Labels are copied from
`cli-node/src/screens/` — the same word can mean different things on
different screens, so each action lists its key and screen.

## Hub sections

| Label | Meaning |
| --- | --- |
| `◉ agora` | Running now: every live session and conversation, pinned on top |
| `▸ Recentes` / `▾ Recentes` | Recent sessions from Atlas history (collapsed / expanded) |
| `▸ Conversas` / `▾ Conversas` | Native Claude, Codex, and Muse conversations found on disk |
| `◈ sessões tmux` | tmux sessions not already shown in another row |
| `… ver todas (N)` / `… ver menos` | Show all N conversations / show fewer |
| `… mostrar conversas de /tmp` | Show conversations started under `/tmp` (hidden by default) |
| `sessão` / `sessões`, `conversas` | Session(s), conversations (title counts) |
| `𖥠` | The row runs inside tmux and can be previewed and attached |

## Actions by screen

| Screen | Key | Label | Meaning |
| --- | --- | --- | --- |
| Hub | `Enter` | `abrir` | Open: expand a section, resume a row, or view a running one |
| Hub | `n` | `nova` | New session (directory picker, then runtime) |
| Hub | `r` | `runtime` | Cycle the selected history row's runtime |
| Hub | `d` | `remover` | Remove a stopped session from history (refused while running) |
| Hub | `X` | `matar` | Kill: end the selected running session (press twice) |
| Hub | `T` | `tmux` | Move the selected session or conversation into tmux in the background (press twice) |
| Hub | `/` | `filtrar` | Filter sessions and conversations (typing also filters; shown on narrow screens) |
| Hub | `q` | `sair` | Quit Atlas |
| Hub, filtering | `↑↓` / `esc` | `navegar` / `lista` | Move the selection / clear the filter and return to the list |
| New session (`Nova sessão`) | `Enter` | `confirmar` | Use the highlighted directory, or the pasted one (`⤷ usar …`) |
| New session, runtime | `Enter` | `escolher` | Choose Codex, Claude, Muse, or `Terminal` (a plain shell) |
| Directory and runtime pickers | `↑↓` / `esc` | `navegar` / `voltar` | Move the selection / go back |
| Running, in tmux | `Enter` | `entrar` | Attach to the tmux session |
| Running, in tmux | `r` | `atualizar` | Refresh the pane preview |
| Running | `X` | `encerrar` / `encerrar sessão` | End the session (press twice) |
| Running, outside tmux | `esc` | `voltar sem matar` | Go back without ending the process |
| Running, outside tmux | `T` | `migrar p/ tmux` | Migrate into tmux (press twice) |
| Running, ended (`Sessão encerrada`) | `Enter` | `abrir agora` | Start it again now |
| Running | `↑↓` | `rolar` | Scroll the preview |

`Sessão em execução · somente leitura` means *running session · read-only*:
the preview never types into the agent.

## Ending versus detaching

Double `X` **terminates** the selected session: the first press arms it and
the status line asks you to press `X` again. Inside tmux, the default
`Ctrl-b`, then `d` **detaches** instead — the session keeps running and
Atlas can re-enter it later.

## Example: shell, detach, preview, attach

1. Run `atlas`, press `n`, paste a project path, press `Enter`.
2. Highlight `Terminal` and press `Enter` (`escolher`); Atlas opens a shell in tmux.
3. Press `Ctrl-b`, then `d` to detach. The shell keeps running.
4. In any terminal, run `atlas`. The session is under `◉ agora`.
5. Press `Enter` to preview it, then `Enter` (`entrar`) again to attach.

From inside that project, `atlas .` skips the Hub and attaches directly.
