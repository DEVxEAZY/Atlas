"""Atlas launcher: resolve (directory, runtime) then exec the runtime there."""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

from atlas_cli import history as history_mod
from atlas_cli import runtimes, tui, util


def build_argv(runtime: str) -> list[str]:
    """Resolve the launch command for a runtime id. Raises SystemExit(2) if missing."""
    definition = runtimes.get(runtime)
    if definition.name == "shell":
        shell = os.environ.get("SHELL", "/bin/sh")
        return [shell]
    binary = shutil.which(definition.argv[0])
    if binary is None:
        print(f"atlas: runtime '{runtime}' não encontrado no PATH.", file=sys.stderr)
        raise SystemExit(2)
    return [binary, *definition.argv[1:]]


def launch(directory: str, runtime: str, dry_run: bool = False) -> int:
    """Record the session and exec the runtime in directory. Returns only on error."""
    target = Path(directory).expanduser()
    if not target.is_dir():
        print(f"atlas: diretório não existe: {directory}", file=sys.stderr)
        return 2
    argv = build_argv(runtime)
    if dry_run:
        print(f"cd {target.resolve()} && exec {' '.join(argv)}")
        return 0
    history_mod.record(str(target.resolve()), runtime)
    os.chdir(target)
    os.execvp(argv[0], argv)
    return 0  # unreachable


def list_sessions() -> int:
    sessions = history_mod.load()
    if not sessions:
        print("Nenhuma sessão registrada.")
        return 0
    for session in sessions:
        missing = " ⚠" if not Path(session.dir).is_dir() else ""
        print(
            f"{session.runtime:<7} {util.shorten(session.dir)}  "
            f"· {util.ago(session.last_used)} · {session.uses}x{missing}"
        )
    return 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="atlas",
        description="Abra um runtime (codex/claude/muse) no diretório certo.",
    )
    parser.add_argument("-d", "--dir", help="diretório da sessão (pula a TUI com --runtime)")
    parser.add_argument(
        "-r", "--runtime", choices=[r.name for r in runtimes.RUNTIMES], help="runtime a iniciar"
    )
    parser.add_argument("-l", "--list", action="store_true", help="lista sessões recentes e sai")
    parser.add_argument(
        "--print", dest="dry_run", action="store_true", help="mostra o comando sem executar"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if args.list:
        return list_sessions()
    if args.dir and args.runtime:
        return launch(args.dir, args.runtime, dry_run=args.dry_run)
    if args.dir or args.runtime:
        print("atlas: use --dir e --runtime juntos, ou nenhum (abre a TUI).", file=sys.stderr)
        return 2
    try:
        choice = tui.pick()
    except KeyboardInterrupt:
        return 130
    if choice is None:
        return 0
    return launch(choice.dir, choice.runtime, dry_run=args.dry_run)


if __name__ == "__main__":
    raise SystemExit(main())
