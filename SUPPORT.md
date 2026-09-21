# Getting help

Start with [installation and first run](README.md) or the
[development guide](cli-node/README.md).

| Need | Where to go |
| --- | --- |
| Usage question, setup help, workflow feedback | [GitHub Discussions](https://github.com/DEVxEAZY/atlas-cli/discussions) |
| Reproducible defect | [Bug report](https://github.com/DEVxEAZY/atlas-cli/issues/new?template=bug_report.yml) |
| Feature proposal | [Feature request](https://github.com/DEVxEAZY/atlas-cli/issues/new?template=feature_request.yml), after checking the [roadmap](ROADMAP.md) |
| Vulnerability | [Private security report](SECURITY.md) |
| Harassment or other conduct concern | [Confidential conduct reporting](CODE_OF_CONDUCT.md) |

For installation problems, include your Linux distribution, `uname -m`, the
release filename, and the exact error. For session problems, include tmux
and agent CLI versions, whether Atlas ran inside tmux, and the steps that
reproduce the problem. Redact credentials, personal paths, repository names,
and conversation text from logs and screenshots.

If `atlas` is not found, check that `~/.local/bin` is on `PATH`. If projects
are missing, set `ATLAS_ROOTS` or press `n` and paste an existing directory.
If an agent is unavailable, verify its CLI is installed and authenticated.
Cross-terminal management requires tmux; without it, direct launch is expected.

Support is community-based and asynchronous, with no guaranteed response time.
English or Brazilian Portuguese reports are welcome. Please keep each issue
focused on one problem and link related discussions.
