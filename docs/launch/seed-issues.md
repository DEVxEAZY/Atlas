# Seed issue drafts

These drafts are drawn from the [roadmap](../../ROADMAP.md). Check for
duplicates before creating them. Apply labels only after ensuring those
labels exist. No contributor is assigned and no delivery date is promised.
The body between each pair of fences is ready to paste.

## 1. Approachable documentation contribution

Title: `docs: add a pt-BR interface glossary for English-speaking users`

Labels: `documentation`, `good first issue`

```markdown
## Problem

The TUI is in Brazilian Portuguese while the README is English. The first-run section explains three section names, but an English-speaking user may still not recognize the action labels in the hint bar.

## Scope

Add `docs/ui-glossary.md` with a compact pt-BR → English glossary, and link it from the README's first-run section. This is documentation only; do not change UI strings or introduce localization code.

Start with the actual labels in `cli-node/src/screens/Hub.tsx`, `cli-node/src/screens/DirPicker.tsx`, `cli-node/src/screens/Runtime.tsx`, and `cli-node/src/screens/Running.tsx`. No agent account or implementation change is needed. The source labels and existing screenshot can be reviewed without running an agent.

## Acceptance criteria

- Cover at least `agora`, `Recentes`, `Conversas`, `abrir`, `nova`, `remover`, `matar`, `filtrar`, `sair`, `navegar`, and `confirmar`, checking exact spelling and context against the source.
- For action labels, include the associated key and screen so that labels with different meanings are not conflated.
- Explain that double `X` terminates a selected session, while the default tmux `Ctrl-b`, then `d` detaches without ending it.
- Include one short “launch a shell, detach, preview, attach” example consistent with the root README.
- Link the glossary from the first-run section without making the install instructions longer.
- Use English explanations, preserve the original pt-BR labels, and verify local Markdown links and `git diff --check`.

## Getting started

Read `CONTRIBUTING.md`. In a PR, mention which source labels you checked. A small table and one example are enough; no runtime translation, dependencies, or new tests are required for this documentation-only change.
```

## 2. Runtime-store compatibility coverage

Title: `test: cover partially written Codex records during native discovery`

Labels: `enhancement`, `help wanted`

```markdown
## Problem

Atlas reads Codex JSONL files while an agent may still be writing them. Existing native tests cover normal metadata and preview discovery. We need explicit synthetic coverage showing that a malformed or partial record does not hide valid neighboring data or crash discovery.

This is a coverage proposal, not a claim that a production failure has been reproduced.

## Scope

Add focused cases in `cli-node/tests/native.test.ts` for `scanCodex`, `parseCodexMeta`, and/or `parseCodexFirstUser` in `cli-node/src/native/codex.ts`. Use a temporary synthetic store or small fixtures; never use a real Codex history directory.

## Acceptance criteria

- A valid rollout and a separate rollout with a truncated metadata line can coexist: scanning does not throw, skips the invalid session, and still returns the valid session.
- A valid metadata line and valid user message followed by a truncated JSONL tail still yield that session and its valid preview.
- A malformed history-index line alongside a valid index entry does not prevent the valid fallback preview from being used when the rollout has no user message.
- Assertions check IDs and preview content, not just “does not throw,” and preserve the existing meaning of total file count versus parsed items.
- Tests isolate filesystem state, avoid depending on the user's agent stores, and clean temporary data they create.
- Run `bun test tests/` and `bun run build` from `cli-node/`, plus `git diff --check`.

## Boundaries

Do not redesign the parser, change parse limits, or broaden supported storage formats as part of this issue. If a case reveals a bug, include the smallest fix with its reproducing test and explain the behavior change. There is no promised implementation date.
```
