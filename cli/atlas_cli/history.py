"""Recent-session history for the Atlas CLI prototype.

A session is a (directory, runtime) pair, matching the product brief:
"Sessão é um runtime escolhido trabalhando em um diretório definido."
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path


@dataclass
class Session:
    dir: str
    runtime: str
    last_used: str  # ISO 8601 UTC
    uses: int = 1


def history_path() -> Path:
    override = os.environ.get("ATLAS_HISTORY_FILE")
    if override:
        return Path(override)
    return Path.home() / ".local" / "share" / "atlas" / "history.json"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load(path: Path | None = None) -> list[Session]:
    """Load sessions ordered by most recent first. Missing/corrupt file -> []."""
    path = path or history_path()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    sessions = []
    for item in raw if isinstance(raw, list) else []:
        try:
            sessions.append(
                Session(
                    dir=str(item["dir"]),
                    runtime=str(item["runtime"]),
                    last_used=str(item["last_used"]),
                    uses=int(item.get("uses", 1)),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    sessions.sort(key=lambda s: s.last_used, reverse=True)
    return sessions


def record(directory: str, runtime: str, path: Path | None = None) -> Session:
    """Record a session launch, bumping it to the top of the history."""
    path = path or history_path()
    directory = str(Path(directory).expanduser().resolve())
    sessions = [s for s in load(path) if not (s.dir == directory and s.runtime == runtime)]
    uses = 1
    for s in load(path):
        if s.dir == directory and s.runtime == runtime:
            uses = s.uses + 1
            break
    session = Session(dir=directory, runtime=runtime, last_used=_now_iso(), uses=uses)
    sessions.insert(0, session)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps([asdict(s) for s in sessions], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return session


def remove(directory: str, runtime: str, path: Path | None = None) -> bool:
    """Remove one entry. Returns True when something was removed."""
    path = path or history_path()
    sessions = load(path)
    kept = [s for s in sessions if not (s.dir == directory and s.runtime == runtime)]
    if len(kept) == len(sessions):
        return False
    path.write_text(
        json.dumps([asdict(s) for s in kept], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return True
