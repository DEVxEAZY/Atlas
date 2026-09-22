# Security policy

## Supported versions

Security fixes target the latest published Atlas release (currently the
`0.3.x` series, on npm as `@devxeazy/atlas-cli` and as GitHub Release
binaries). Older releases and the legacy Python prototype in `cli/` do not
receive dedicated security backports. Upgrade to the latest release before
checking whether a previously reported issue is fixed. This volunteer
project does not promise a response or remediation SLA.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/DEVxEAZY/atlas-cli/security/advisories/new)
to contact repository maintainers. Do not report exploitable details in public
issues, Discussions, or pull requests. Include:

- Atlas release or commit, Linux distribution/architecture, and tmux version.
- The affected feature and a minimal reproduction using synthetic data.
- Expected versus observed behavior, impact, and any suggested mitigation.
- Relevant agent runtime versions when native discovery or launching is involved.

Do not send API keys, authentication tokens, real conversation stores, or
private repository content. Maintainers will assess the report, coordinate
follow-up privately, and discuss disclosure and credit with the reporter.
Publication timing depends on impact and the availability of a fix; do not
assume that submitting a report makes it public.

## Scope

Atlas launches local commands, reads local agent history, and manages tmux
sessions with the current OS user's permissions. Command injection, unsafe
path handling, unexpected disclosure, or unintended termination of another
session are examples of relevant reports. Atlas is not a sandbox or a
security boundary between mutually untrusted users.

Agent providers manage their own authentication and network traffic. Report
vulnerabilities in those agents to their maintainers, while telling us privately
if an Atlas integration is involved. Ordinary bugs and usage questions follow
the [support guide](SUPPORT.md).
