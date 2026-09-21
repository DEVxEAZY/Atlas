# GitHub launch setup

These are exact target values, not a statement that settings are already
applied. Repository: `DEVxEAZY/atlas-cli`.

## Metadata

Description:

```text
Every coding-agent session. One terminal hub. Linux TUI for Codex, Claude, Muse, and shell, backed by tmux.
```

Website:

```text
https://github.com/DEVxEAZY/atlas-cli#readme
```

Topics (exact set):

```text
atlas-cli
cli
tui
terminal
tmux
coding-agents
codex
claude
muse
session-manager
developer-tools
linux
typescript
bun
```

Keep Issues and Discussions enabled. Enable private vulnerability reporting
before publishing the community files; both security and confidential conduct
reports use that maintainer channel. Verify the forms and contact links as a
signed-in non-maintainer. Do not create empty wiki/project surfaces solely
for launch.

## One manual social-preview upload

In `DEVxEAZY/atlas-cli` → **Settings** → **General** → **Social preview** →
**Edit** → **Upload an image**, select [docs/social-preview.png](../social-preview.png)
from the checkout. This is the supplied 1280×640 card; confirm its displayed
crop keeps the headline and terminal content visible. The committed PNG does
not apply the GitHub setting automatically.

## Release and publication checks

- The public `v0.1.0` release contains `atlas-linux-x64.tar.gz`, `atlas-linux-x64.tar.gz.sha256`, `atlas-linux-arm64.tar.gz`, and `atlas-linux-arm64.tar.gz.sha256`.
- Archives contain respectively `atlas-linux-x64` and `atlas-linux-arm64`, matching the README install commands. Checksums verify downloaded archives.
- [Versioned release notes](../releases/v0.1.0.md) are attached by the release workflow.
- [README](../../README.md) shows the animated demo near the headline, explains the illustrative visual, and links the actual supported downloads.
- [Hero GIF](../atlas-demo.gif), [static screenshot](../atlas-hub.svg), and [social card](../social-preview.png) load from the public repository.
- The bug and feature forms render correctly; Discussions and private reporting links are usable.
- Publish the [two seed issues](seed-issues.md) only after checking duplicates, and keep `good first issue` limited to the documentation task.
- Re-check current promotion rules before using the [post copy](posts.md). Never request coordinated upvotes or a star campaign.

Local checks can establish matching names and valid files. They do not prove
that a GitHub release, setting, or external post has been published.
