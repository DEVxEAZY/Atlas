---
name: atlas-cron
description: Schedules a recurring agent task on this machine through Atlas — a prompt that Claude, Codex or a shell runs in a directory on a schedule ("todo dia às 9h revisa os PRs abertos", "toda segunda gera o relatório", "every 30 minutes check the deploy"). Use when the user asks to schedule, automate or repeat work, or asks what is scheduled. Not for GitHub Actions schedules, systemd timers or application job queues.
---

# atlas-cron

A scheduled task is four things: **a prompt, a directory, a runtime, a schedule**. You file it as a proposal; the user installs it with one keypress in Atlas. You never install it yourself.

## Create a task

1. Get the four facts. Ask only for what is really missing:
   - **prompt**: what the agent should do on each run, written so it works with nobody there to answer questions. Say where to put the result (a file, a commit, a message) if it matters.
   - **directory**: default to the current project.
   - **runtime**: `claude` (default), `codex`, or `shell` (then the prompt is a shell command).
   - **schedule**: turn the user's words into one of the forms below. "toda semana" or "de manhã" is not a schedule yet: ask for the day and the time.
2. Propose it:

   ```sh
   atlas cron add --when "dias úteis 09:00" --dir . --runtime claude "Revise os PRs abertos e resuma em REVIEW.md"
   ```

   Exit 0 prints the task id and its next run in plain Portuguese. Read the schedule back to the user, and check that it is what they asked for.
3. Tell the user: **open Atlas, press `C`, and press `Enter` on the task to install it.** Until then it does not run.

## Schedule forms

| The user says | `--when` |
|---|---|
| every 30 minutes | `a cada 30 min` |
| every 2 hours | `a cada 2 h` |
| every day at 9 | `todo dia 09:00` |
| weekdays at 18:30 | `dias úteis 18:30` |
| every Monday at 8 | `toda segunda 08:00` |
| anything else | a 5-field cron expression, e.g. `0 9 1 * *` (day 1 of each month, 09:00) |

Times are in the machine's timezone.

## Other commands

- `atlas cron list` shows every task with its state (`pendente`, `ativa`, `pausada`) and next run. Add `--json` to parse it.
- `atlas cron log <id>` shows the output of the latest runs.
- `atlas cron rm <id>` removes a task and its crontab entry.
- Pausing, resuming and running a task now are keys in Atlas (`p`, `Enter`, `R`).

## How a run behaves

Each run is headless in the task's directory, and its output goes to the log:

- `claude -p --permission-mode acceptEdits`: it can edit files in the directory. Any other tool that is not already on the user's allow list is denied, because nobody is there to approve it.
- `codex exec --sandbox workspace-write`.
- `shell`: `/bin/sh -c "<prompt>"`.

If a task needs more access, say so. Do not work around it.
