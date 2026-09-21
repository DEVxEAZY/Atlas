# Atlas roadmap

Atlas focuses on finding and returning to coding-agent sessions on one
machine. This is a direction for discussion, not a release schedule or a
promise that every proposal will ship. Priorities can change with evidence
from [issues](https://github.com/DEVxEAZY/atlas-cli/issues) and
[Discussions](https://github.com/DEVxEAZY/atlas-cli/discussions).

## Make the first session easier

- Add a short pt-BR → English key-label glossary with concrete first-run examples. This is a small documentation contribution; it does not translate the UI.
- Collect Linux install and checksum-verification friction before choosing an upgrade mechanism.
- Improve troubleshooting for missing roots, unavailable runtimes, and tmux setup based on reproducible reports.

## Keep sessions dependable

- Expand synthetic compatibility fixtures for evolving Codex, Claude, and Muse stores, starting with a malformed or partially written Codex record alongside a valid record.
- Investigate lifecycle bugs with minimal reproductions, preserving preview, explicit termination confirmation, and direct launch without tmux.
- Document supported runtime versions when repeatable compatibility evidence is available.

## Explore broader access

- Evaluate macOS packaging and platform-specific process behavior before claiming support.
- Consider an English TUI and a maintainable localization approach. The current UI remains pt-BR.
- Evaluate simpler upgrades after the release-archive installation path has feedback.

## Outside the current direction

SSH connection management, cloud orchestration, multi-user authorization,
credential sharing, and cross-machine synchronization are outside the current
scope. Atlas uses installed agent CLIs and native conversation stores; it
does not replace them. See [contributing](CONTRIBUTING.md) before taking on
a large feature or introducing a new dependency.
