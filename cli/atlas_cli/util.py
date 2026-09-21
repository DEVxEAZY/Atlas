"""Small display helpers (kept Textual-free so tests stay light)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path


def ago(iso: str, now: datetime | None = None) -> str:
    """PT-BR relative time, e.g. 'agora', 'há 5 min', 'há 3 h', 'há 2 d'."""
    try:
        then = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    if then.tzinfo is None:
        then = then.replace(tzinfo=timezone.utc)
    now = now or datetime.now(timezone.utc)
    seconds = max(0, int((now - then).total_seconds()))
    if seconds < 60:
        return "agora"
    minutes = seconds // 60
    if minutes < 60:
        return f"há {minutes} min"
    hours = minutes // 60
    if hours < 24:
        return f"há {hours} h"
    days = hours // 24
    if days < 30:
        return f"há {days} d"
    months = days // 30
    if months < 12:
        return f"há {months} m"
    return f"há {months // 12} a"


def shorten(path: str) -> str:
    """Collapse $HOME to ~ and keep the tail readable."""
    home = str(Path.home())
    if path == home:
        return "~"
    if path.startswith(home + "/"):
        return "~/" + path[len(home) + 1 :]
    return path


def candidate_label(domain: str, path: str, kind: str) -> str:
    name = Path(path).name
    marker = {"domain": "◆", "repo": "●", "dir": "○"}.get(kind, "○")
    return f"{marker} {name}  [{domain}]"
