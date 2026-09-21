# Contributing to Atlas

Contributions to the maintained TypeScript app, tests, documentation, and
reproducible bug reports are welcome. Participation follows our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Choose a change

Check existing [issues](https://github.com/DEVxEAZY/atlas-cli/issues) and the
[roadmap](ROADMAP.md) before starting. Small fixes can go straight to a pull
request. For a new runtime, platform, dependency, or a change in session
behavior, open a feature request first so scope can be discussed. There is no
guaranteed acceptance or delivery date. Questions belong in
[Discussions](https://github.com/DEVxEAZY/atlas-cli/discussions); security
reports belong in the [private reporting flow](SECURITY.md).

## Set up

Use Linux, Git, and Bun (1.4.2 is used for release builds). Install tmux for
manual session checks. Agent CLIs must be installed and authenticated for
interactive agent checks; tests can use the temporary shims documented in
the [development guide](cli-node/README.md).

```sh
git clone https://github.com/DEVxEAZY/atlas-cli.git
cd atlas-cli
git switch -c my-change
cd cli-node
bun install --frozen-lockfile
bun test tests/
bun run atlas
```

Use a fork if you do not have repository write access. Keep changes in
`cli-node/` unless the task concerns documentation or repository tooling.
Use `ATLAS_HISTORY_FILE` and disposable projects for manual testing; a separate
OS user also isolates native conversation stores and tmux sessions.

## Before opening a pull request

- Explain the concrete problem, resulting behavior, and how you verified it.
- Keep the patch focused. Match surrounding TypeScript/React conventions and avoid unrelated dependency or formatting changes.
- Add a regression test when fixing behavior; use synthetic conversation data rather than personal logs.
- Preserve direct launch without tmux, explicit confirmation before termination, and native runtime resume behavior.
- Keep UI text in pt-BR and user-facing launch documentation in English. Include sanitized before/after screenshots for UI changes.
- Update relevant usage documentation when flags, configuration, or behavior change.

Run these checks from the repository root:

```sh
cd cli-node
bun test tests/
bun run build
cd ..
git diff --check
```

There is no separate configured lint command. State any check you could not
run and why. CI is required evidence, not a substitute for explaining the
change. Maintainers may ask for a smaller scope or a test before merging.
By contributing, you agree that your contributions are licensed under the
repository's [MIT license](LICENSE); no separate CLA is required.

## Release maintenance

Release changes keep `cli-node/package.json`, versioned notes under
`docs/releases/`, and installation examples consistent. Tags matching `v*`
trigger the release workflow after its test job; publication is a maintainer
action. See the [launch kit](docs/launch/README.md) for the v0.1.0 checklist
and copy. Do not include credentials or private data in artifacts.
