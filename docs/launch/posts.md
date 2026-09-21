# Ready-to-post copy

Copy blocks are written for the project maintainer and need no placeholder
substitution. Publish only after the public v0.1.0 release and reporting
routes are live. Re-check current channel promotion rules and use permitted
showcase threads where required. Do not post all variants to the same audience.

## Show HN

Title:

```text
Show HN: Atlas – a terminal hub for coding-agent sessions
```

Submission URL:

```text
https://github.com/DEVxEAZY/atlas-cli
```

Body / first comment:

```text
I built Atlas to make coding-agent sessions easier to find and return to across projects.

It is a Linux TUI for Codex, Claude, Muse, and shell sessions. The loop is: launch in a project, detach from tmux, open Atlas in another terminal, preview the output, and attach to the same session. It also reads native agent conversation stores and resumes through the original CLI.

The v0.1.0 release has standalone Linux x64 and arm64 binaries with checksums. Bun is bundled. tmux is required for cross-terminal management; direct launch works without it. Agent CLIs must already be installed and authenticated, or you can try it with a shell. The TUI is currently Brazilian Portuguese; the README is English.

Atlas keeps local history and does not upload data or run an Atlas daemon. The agent CLIs retain their own network behavior. It manages the machine where it runs, not SSH connections or a fleet of agents.

The README's 22-second GIF is an illustrative reconstruction, not a live recording. Source and release downloads: https://github.com/DEVxEAZY/atlas-cli

I'd appreciate feedback on the first detach → preview → re-enter loop, especially anything unclear during installation or session discovery. If you already have a tmux workflow, what would this need to do to earn a place in it?
```

## X thread

Post each block as a reply to the previous one. Each is below 280 characters
even when counting the literal URL; an attachment is optional.

```text
1/4 Every coding-agent session. One terminal hub.

Atlas is a Linux TUI for finding, previewing, and re-entering Codex, Claude, Muse, and shell sessions on the same machine.

https://github.com/DEVxEAZY/atlas-cli
```

```text
2/4 The loop: launch in a project → detach from tmux → open Atlas in another terminal → preview → attach to the same session.

tmux is required for that cross-terminal loop. Direct launch works without it. The README GIF is an illustrative demo.
```

```text
3/4 v0.1.0 has standalone Linux x64/arm64 downloads. Agent CLIs must already be installed and authenticated; a shell works for a first try.

The TUI is pt-BR. Atlas has no data upload or daemon; agents keep their own network behavior.
```

```text
4/4 Try one shell session and tell me where the install or return-to-session flow gets confusing.

Questions: https://github.com/DEVxEAZY/atlas-cli/discussions
Bugs: https://github.com/DEVxEAZY/atlas-cli/issues
```

## LinkedIn

```text
Every coding-agent session. One terminal hub.

I'm sharing Atlas, an open-source Linux terminal UI for Codex, Claude, Muse, and shell sessions.

The workflow is small: pick a project, launch a runtime, detach from tmux, then find and preview the session from another terminal on the same machine. Attach when you want to return. Atlas also reads native agent conversation stores for resume.

v0.1.0 provides standalone Linux x64 and arm64 binaries. tmux is required for cross-terminal management; direct launch is available without it. Agent CLIs need their own installation and authentication. The interface is currently Brazilian Portuguese, with English documentation.

Atlas stores local history, with no Atlas upload service or daemon. Agents still use their own providers and data policies. The README animation is an illustrative demo, not a live recording.

If terminal agents are part of your workflow, try the detach → preview → re-enter loop with a shell first and share the step that needs a clearer explanation.

Code, demo, and install instructions: https://github.com/DEVxEAZY/atlas-cli
```

## Reddit: terminal / tmux community

Title:

```text
I built a tmux-backed hub for finding and re-entering coding-agent sessions
```

Body:

```text
I'm the maintainer of Atlas, an MIT-licensed Linux TUI for Codex, Claude, Muse, and shell sessions.

It adds project selection, recent sessions, native conversation discovery, and a pane preview around tmux. Detach in one terminal, open Atlas in another on the same machine, select the session, preview it, and attach. tmux still owns the session; Atlas isn't a replacement terminal multiplexer.

Linux x64/arm64 binaries are available for v0.1.0. The TUI is pt-BR. Agent CLIs must already be installed and authenticated; you can start with a shell. Without tmux, only direct launch is available. The README GIF is illustrative, not a live capture.

https://github.com/DEVxEAZY/atlas-cli

For people who already use tmux session naming or scripts: does a project-and-conversation view solve a gap for you? Specific workflow objections are welcome.
```

## Reddit: coding-agent / open-source showcase

Title:

```text
Atlas: a local Linux TUI to find and resume coding-agent sessions
```

Body:

```text
I maintain Atlas, an open-source hub for Codex, Claude, Muse, and shell sessions across projects on one machine.

You can choose a directory, launch an installed runtime, and return to its tmux session from another terminal. Atlas reads local native conversations for resume and shows running sessions first. It does not coordinate agents, upload your data, or connect to remote machines; the agents keep their own network behavior.

v0.1.0 has Linux x64/arm64 downloads. tmux is required for persistent cross-terminal management, with a direct-launch fallback. The TUI is Brazilian Portuguese; docs are English. Try a shell if you don't have an agent CLI installed and authenticated. The README demo is an illustrative reconstruction.

https://github.com/DEVxEAZY/atlas-cli

I'd like feedback on installation and on whether the first session is easy to find again. Reproducible issues or a description of the step where you got stuck would help.
```

Use these in an allowed project showcase or self-promotion thread if the
community requires one. Suggested audiences are not assertions that a
particular subreddit currently allows these posts.

## Discord

```text
Sharing a project I maintain: Atlas, a Linux terminal hub for Codex, Claude, Muse, and shell sessions.

Launch in a project → detach from tmux → find and preview it in Atlas from another terminal → attach to the same session. v0.1.0 has x64/arm64 binaries. tmux is needed for that loop; the TUI is pt-BR. Agents need their own installation/authentication, or you can try a shell first.

Code + install: https://github.com/DEVxEAZY/atlas-cli
The README GIF is illustrative. I'd appreciate one concrete note about install friction or a session that was hard to find again.
```

Post only in an appropriate, permitted project-sharing channel. Do not DM
members unsolicited or request a coordinated response to another launch post.

## Replies to predictable objections

**“Why not just tmux?”**

```text
If your tmux names and scripts already cover this, you may not need Atlas. It adds project selection, recent sessions, native agent conversation discovery/resume, and a preview-first hub. tmux still owns persistent sessions.
```

**“Does it run without tmux?”**

```text
Yes, it can launch a runtime directly in the current terminal. tmux is required for persistent sessions and cross-terminal management. The README explains both paths.
```

**“Is my code uploaded?”**

```text
Atlas does not upload your data or use an Atlas cloud service. It reads local history/conversation stores and launches installed CLIs. Those agents retain their own provider connections and data policies, so this is not a claim that all agent work stays offline.
```

**“Mac, Windows, or English UI?”**

```text
This release supports Linux x64/arm64 and the TUI is pt-BR. The docs are English. Broader packaging and an English interface are roadmap topics, with no promised delivery date. Platform-specific reports would help scope the work.
```

**“Can it manage agents on several servers?”**

```text
It manages sessions on the machine where you run it. You can run it after connecting to a remote Linux machine yourself, but Atlas does not provide SSH connections, cross-machine sync, or cloud orchestration.
```

**“Is that GIF real?”**

```text
The README GIF is a 22-second illustrative reconstruction using fictional project data and example output. Its sources and provenance are in docs/demo. It demonstrates the intended sequence, not a live agent run or a performance benchmark.
```

**“My conversation is missing.”**

```text
Discovery depends on the agent's local storage format, and not every process or conversation is necessarily visible. Please report the Atlas release, agent version, and a sanitized reproduction. Don't upload your real conversation store or credentials.
```

**“Does it replace the agents or their subscriptions?”**

```text
No. Atlas launches the agent CLIs you already have. Install and authenticate them separately. You can try Atlas with a plain shell without an agent account.
```
