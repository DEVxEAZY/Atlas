# Positioning and evidence

## Core message

**Every coding-agent session. One terminal hub.**

Atlas is a Linux terminal session manager for Codex, Claude, Muse, and shell.
Choose a project, launch a runtime, and return to its tmux session from
another terminal on the same machine.

Primary audience: developers already using terminal coding agents across
multiple projects who lose track of which session is running where.
Secondary audience: tmux users who want project-aware discovery and native
conversation resume without memorizing every session name.

The first useful action is one successful detach → preview → re-enter loop.
The preferred CTA is “Try it with a shell session and tell us where you got
stuck.” Agent accounts are not required to try that loop.

## Claims and boundaries

| Say | Evidence / boundary |
| --- | --- |
| Find, preview, and re-enter sessions | Hub, running view, tmux attach, native store adapters in `cli-node/src/` |
| Move between terminals on the same machine | tmux owns the session; Atlas can attach another client |
| Launch Codex, Claude, Muse, or shell | These are the current runtime definitions; agent CLIs are installed and authenticated separately |
| Standalone Linux binaries | x64 baseline and arm64 archive targets in the release workflow; Bun is bundled |
| Local Atlas history and discovery | No Atlas upload service, cloud account, or Atlas daemon; launched agents have their own network policies |
| Preview output before attaching | tmux pane capture is read-only; the underlying agent can still be running |
| Explicit termination confirmation | Double `X` confirms termination; this is not a guarantee that work is saved |
| Open source under MIT | Repository license; no adoption or quality claim follows from it |

The headline is positioning, not a promise to discover every arbitrary process
or every agent product. Runtime store changes can affect discovery. State
Linux and the pt-BR interface early. Recommend tmux and explain that it is
required for cross-terminal management; direct launch exists without it.

## Do not claim

- macOS/Windows support, an English TUI, an installer, package-manager distribution, or automatic upgrades.
- Remote SSH connection management, multi-machine sync, cloud orchestration, or autonomous agent coordination.
- That agent data never leaves the machine: Atlas does not upload it, but an agent may use its provider's services.
- Universal compatibility with future runtime storage formats or discovery of every process.
- User counts, performance improvements, benchmarks, endorsements, or testimonials without published evidence.
- That the supplied GIF is a live recording or shows real agent output.
- A delivery date for roadmap items, guaranteed support, or a bug bounty.

## Assets

- [Animated demo](../atlas-demo.gif): 22-second illustrated sequence; label it “illustrative demo.”
- [Hub screenshot](../atlas-hub.svg): static illustrative TUI reconstruction with fictional project data.
- [Social preview](../social-preview.png): 1280×640 repository preview card.
- [Visual sources and provenance](../demo/README.md).
- [Release notes](../releases/v0.1.0.md).
