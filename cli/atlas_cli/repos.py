"""Domain roots and repository discovery (real filesystem, no virtual tree)."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass
class Candidate:
    path: str
    domain: str  # display name, e.g. "@megavale-repos"
    kind: str  # "domain" | "repo" | "dir"


def default_roots() -> list[Path]:
    override = os.environ.get("ATLAS_ROOTS")
    if override:
        return [Path(p).expanduser() for p in override.split(":") if p.strip()]
    home = Path.home()
    return [home / "@development", home / "@megavale-repos"]


def split_domain(path: str, roots: list[Path] | None = None) -> tuple[str | None, str]:
    """Split a path into (domain name, path relative to the domain root).

    Returns (None, path) when the path is outside every known root.
    The relative part is "" when path is the domain root itself.
    """
    roots = roots if roots is not None else default_roots()
    target = Path(path)
    candidates = [target]
    if target.exists():
        candidates.append(target.resolve())
    for root in roots:
        anchor = root.resolve() if root.exists() else root
        for candidate in candidates:
            try:
                rel = candidate.relative_to(anchor)
            except ValueError:
                continue
            return (root.name, "" if str(rel) == "." else str(rel))
    return (None, path)


def classify(path: Path, roots: list[Path], workspaces: set[str] | None = None) -> str:
    """Classify a real path as domain, workspace, repo, or plain dir.

    Mirrors the brief: a workspace is recognised only when the path matches a
    registered bookmark, never by folder name alone.
    """
    resolved = str(path.resolve()) if path.exists() else str(path)
    for root in roots:
        try:
            if path.resolve() == root.resolve():
                return "domain"
        except OSError:
            continue
    if workspaces and resolved in workspaces:
        return "workspace"
    if (path / ".git").exists():
        return "repo"
    return "dir"


def discover(roots: list[Path] | None = None, max_depth: int = 2) -> list[Candidate]:
    """List domain roots plus repos/dirs up to max_depth (depth 1 always listed)."""
    roots = roots if roots is not None else default_roots()
    found: list[Candidate] = []
    for root in roots:
        if not root.is_dir():
            continue
        domain = root.name
        found.append(Candidate(path=str(root), domain=domain, kind="domain"))
        try:
            entries = sorted(root.iterdir(), key=lambda p: p.name.lower())
        except OSError:
            continue
        for entry in entries:
            if entry.name.startswith(".") or not entry.is_dir():
                continue
            kind = "repo" if (entry / ".git").is_dir() or (entry / ".git").is_file() else "dir"
            found.append(Candidate(path=str(entry), domain=domain, kind=kind))
            if max_depth >= 2 and kind == "dir":
                try:
                    subentries = sorted(entry.iterdir(), key=lambda p: p.name.lower())
                except OSError:
                    continue
                for sub in subentries:
                    if sub.name.startswith(".") or not sub.is_dir():
                        continue
                    if (sub / ".git").is_dir() or (sub / ".git").is_file():
                        found.append(Candidate(path=str(sub), domain=domain, kind="repo"))
    return found
