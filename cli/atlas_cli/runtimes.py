"""Runtime (harness) definitions and availability checks."""

from __future__ import annotations

import shutil
from dataclasses import dataclass


@dataclass(frozen=True)
class Runtime:
    name: str  # stable id: "codex" | "claude" | "muse" | "shell"
    label: str  # display label
    argv: tuple[str, ...]  # launch command


RUNTIMES: tuple[Runtime, ...] = (
    Runtime(name="codex", label="Codex", argv=("codex",)),
    Runtime(name="claude", label="Claude", argv=("claude",)),
    Runtime(name="muse", label="Muse", argv=("muse",)),
    Runtime(name="shell", label="Terminal", argv=("$SHELL",)),
)


def get(name: str) -> Runtime:
    for runtime in RUNTIMES:
        if runtime.name == name:
            return runtime
    raise KeyError(f"runtime desconhecido: {name}")


def is_available(runtime: Runtime) -> bool:
    if runtime.name == "shell":
        return True
    return shutil.which(runtime.argv[0]) is not None


def available() -> list[Runtime]:
    return [r for r in RUNTIMES if is_available(r)]
