"""Textual TUI: pick a recent session or start a new one.

Flow: recents -> [n] new session (pick dir) -> pick runtime -> exit(Choice).
The launcher (main.py) takes the Choice and execs the runtime in that dir.
"""

from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.screen import Screen
from textual.widgets import Footer, Header, Input, OptionList
from textual.widgets._option_list import Option  # no public export in Textual 8

from atlas_cli import history as history_mod
from atlas_cli import repos as repos_mod
from atlas_cli import runtimes, util


@dataclass
class Choice:
    dir: str
    runtime: str


RUNTIME_ORDER = ("codex", "claude", "muse", "shell")

RUNTIME_ICON = {"codex": "⬢", "claude": "✳", "muse": "◈", "shell": "▸"}

# A sectioned list: ("header", label) rows are disabled, ("item", payload) rows act.
Row = tuple[str, Any]


def render_rows(
    option_list: OptionList, rows: list[Row], label: Callable[[Any], str]
) -> None:
    """Render sectioned rows, highlighting the first selectable item."""
    option_list.clear_options()
    for kind, payload in rows:
        if kind == "header":
            option_list.add_option(Option(str(payload), disabled=True))
        else:
            option_list.add_option(label(payload))
    for index, (kind, _) in enumerate(rows):
        if kind == "item":
            option_list.highlighted = index
            return
    option_list.highlighted = None


def highlight_payload(option_list: OptionList, rows: list[Row], payload: Any) -> None:
    for index, (kind, candidate) in enumerate(rows):
        if kind == "item" and candidate == payload:
            option_list.highlighted = index
            return


def session_display(session: history_mod.Session) -> str:
    domain, rel = repos_mod.split_domain(session.dir)
    if domain is None:
        return util.shorten(session.dir)
    return rel or domain


def session_label(session: history_mod.Session) -> str:
    icon = RUNTIME_ICON.get(session.runtime, "•")
    missing = " ⚠" if not Path(session.dir).is_dir() else ""
    return (
        f"  {icon} {session.runtime:<6} {session_display(session)}  "
        f"· {util.ago(session.last_used)} · {session.uses}x{missing}"
    )


def session_rows(sessions: list[history_mod.Session]) -> list[Row]:
    """Group sessions by domain, groups ordered by most recent activity."""
    groups: dict[str, list[history_mod.Session]] = {}
    for session in sessions:
        domain, _ = repos_mod.split_domain(session.dir)
        groups.setdefault(domain or "outros", []).append(session)
    ordered = sorted(
        groups.items(), key=lambda kv: max(s.last_used for s in kv[1]), reverse=True
    )
    rows: list[Row] = []
    for domain, items in ordered:
        items.sort(key=lambda s: s.last_used, reverse=True)
        word = "sessão" if len(items) == 1 else "sessões"
        rows.append(("header", f"{domain}  ·  {len(items)} {word}"))
        rows.extend(("item", session) for session in items)
    return rows


def match_session(session: history_mod.Session, query: str) -> bool:
    query = query.strip().lower()
    if not query:
        return True
    haystack = f"{session.runtime} {session.dir} {session_display(session)}".lower()
    return all(word in haystack for word in query.split())


def cycle_runtime(current: str) -> str:
    try:
        i = RUNTIME_ORDER.index(current)
    except ValueError:
        return RUNTIME_ORDER[0]
    return RUNTIME_ORDER[(i + 1) % len(RUNTIME_ORDER)]


def runtime_label(runtime: runtimes.Runtime) -> str:
    if not runtimes.is_available(runtime):
        return f"  ✗ {runtime.label:<8} (não instalado)"
    detail = runtime.argv[0]
    if runtime.name == "shell":
        detail = os.environ.get("SHELL", "/bin/sh")
    return f"  ✓ {runtime.label:<8} ({detail})"


class RecentsScreen(Screen):
    BINDINGS = [
        Binding("n", "new_session", "Nova sessão"),
        Binding("r", "cycle_runtime", "Trocar runtime"),
        Binding("d", "remove", "Remover"),
        Binding("slash", "focus_filter", "Filtrar"),
        Binding("escape", "focus_list", "Lista"),
        Binding("q", "quit_app", "Sair"),
    ]

    def __init__(self, sessions: list[history_mod.Session]) -> None:
        super().__init__()
        self.sessions = sessions
        self.rows: list[Row] = []

    def compose(self) -> ComposeResult:
        yield Header(show_clock=False)
        yield Input(placeholder="filtrar sessões…  ( / foca · esc volta )", id="filter")
        yield OptionList(id="recents")
        yield Footer()

    def on_mount(self) -> None:
        self.refresh_list()
        self.query_one("#recents", OptionList).focus()

    def refresh_list(self, keep: history_mod.Session | None = None) -> None:
        query = self.query_one("#filter", Input).value
        visible = [s for s in self.sessions if match_session(s, query)]
        self.rows = session_rows(visible)
        if not self.rows:
            hint = f"nada combina com “{query}”" if query.strip() else "nenhuma sessão ainda · n cria"
            self.rows = [("header", f"— {hint} —")]
        render_rows(self.query_one("#recents", OptionList), self.rows, session_label)
        if keep is not None:
            highlight_payload(self.query_one("#recents", OptionList), self.rows, keep)
        total = len(self.sessions)
        word = "sessão" if total == 1 else "sessões"
        shown = f" · {len(visible)} visíveis" if query.strip() else ""
        self.sub_title = f"{total} {word}{shown}"

    def highlighted_session(self) -> history_mod.Session | None:
        option_list = self.query_one("#recents", OptionList)
        index = option_list.highlighted
        if index is None or not 0 <= index < len(self.rows):
            return None
        kind, payload = self.rows[index]
        return payload if kind == "item" else None

    def open_session(self, session: history_mod.Session | None) -> None:
        if session is None:
            self.notify("Nada selecionado — pressione n para criar uma sessão.")
            return
        if not Path(session.dir).is_dir():
            self.notify(f"Diretório não existe mais: {session.dir}", severity="warning")
            return
        self.app.exit(Choice(dir=session.dir, runtime=session.runtime))

    def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        index = event.option_index
        if 0 <= index < len(self.rows) and self.rows[index][0] == "item":
            self.open_session(self.rows[index][1])

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self.open_session(self.highlighted_session())

    def on_input_changed(self, event: Input.Changed) -> None:
        self.refresh_list()

    def action_focus_filter(self) -> None:
        self.query_one("#filter", Input).focus()

    def action_focus_list(self) -> None:
        self.query_one("#recents", OptionList).focus()

    def action_new_session(self) -> None:
        self.app.push_screen(NewSessionScreen())

    def action_cycle_runtime(self) -> None:
        session = self.highlighted_session()
        if session is None:
            return
        session.runtime = cycle_runtime(session.runtime)
        self.refresh_list(keep=session)

    def action_remove(self) -> None:
        session = self.highlighted_session()
        if session is None:
            return
        history_mod.remove(session.dir, session.runtime)
        self.sessions.remove(session)
        self.refresh_list()
        self.notify("Sessão removida do histórico.")

    def action_quit_app(self) -> None:
        self.app.exit(None)


def filter_candidates(
    candidates: list[repos_mod.Candidate], query: str
) -> list[repos_mod.Candidate]:
    query = query.strip().lower()
    if not query:
        return candidates
    words = query.split()
    scored: list[tuple[int, repos_mod.Candidate]] = []
    for candidate in candidates:
        _, rel = repos_mod.split_domain(candidate.path)
        name = Path(candidate.path).name.lower()
        haystack = f"{candidate.path} {rel} {candidate.domain}".lower()
        if not all(word in haystack for word in words):
            continue
        if name.startswith(words[0]):
            scored.append((0, candidate))
        elif words[0] in name:
            scored.append((1, candidate))
        else:
            scored.append((2, candidate))
    scored.sort(key=lambda item: (item[0], item[1].path))
    return [candidate for _, candidate in scored]


def candidate_display(candidate: repos_mod.Candidate) -> str:
    if candidate.kind == "domain":
        return "⌂ raiz do domínio"
    _, rel = repos_mod.split_domain(candidate.path)
    return rel or Path(candidate.path).name


def candidate_label(candidate: repos_mod.Candidate) -> str:
    marker = {"domain": "◆", "repo": "●", "dir": "○"}.get(candidate.kind, "○")
    return f"  {marker} {candidate_display(candidate)}"


class NewSessionScreen(Screen):
    BINDINGS = [Binding("escape", "back", "Voltar")]

    def __init__(self) -> None:
        super().__init__()
        self.candidates = repos_mod.discover()
        self.rows: list[Row] = []

    def compose(self) -> ComposeResult:
        yield Header(show_clock=False)
        yield Input(placeholder="filtrar ou colar um caminho…", id="filter")
        yield OptionList(id="dirs")
        yield Footer()

    def on_mount(self) -> None:
        self.refresh_list("")
        self.query_one("#filter", Input).focus()

    def refresh_list(self, query: str) -> None:
        option_list = self.query_one("#dirs", OptionList)
        rows: list[Row] = []
        typed = query.strip()
        if typed:
            expanded = Path(typed).expanduser()
            if expanded.is_dir():
                rows.append(("item", ("free", str(expanded.resolve()))))
        groups: dict[str, list[repos_mod.Candidate]] = {}
        for candidate in filter_candidates(self.candidates, query):
            groups.setdefault(candidate.domain, []).append(candidate)
        for domain in sorted(groups):
            items = sorted(
                groups[domain],
                key=lambda c: (0 if c.kind == "repo" else 1, candidate_display(c).lower()),
            )
            kinds = {"repo": ("repo", "repos"), "dir": ("pasta", "pastas")}
            counts: dict[str, int] = {}
            for item in items:
                if item.kind in kinds:
                    counts[item.kind] = counts.get(item.kind, 0) + 1
            summary = " · ".join(
                f"{counts[k]} {kinds[k][0] if counts[k] == 1 else kinds[k][1]}"
                for k in ("repo", "dir")
                if k in counts
            )
            rows.append(("header", f"{domain}  ·  {summary}"))
            rows.extend(("item", ("candidate", item)) for item in items)
        self.rows = rows
        render_rows(option_list, rows, self.row_label)
        total = sum(1 for kind, _ in rows if kind == "item")
        self.sub_title = f"nova sessão · {total} locais"

    def row_label(self, payload: tuple[str, Any]) -> str:
        kind, value = payload
        if kind == "free":
            return f"⤷ usar {util.shorten(value)}"
        return candidate_label(value)

    def _choose(self, index: int | None) -> None:
        if index is None or not 0 <= index < len(self.rows):
            return
        kind, payload = self.rows[index]
        if kind != "item":
            return
        _, value = payload
        path = value if isinstance(value, str) else value.path
        self.app.push_screen(RuntimeScreen(path))

    def on_input_changed(self, event: Input.Changed) -> None:
        self.refresh_list(event.value)

    def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        self._choose(event.option_index)

    def on_input_submitted(self, event: Input.Submitted) -> None:
        self._choose(self.query_one("#dirs", OptionList).highlighted)

    def action_back(self) -> None:
        self.app.pop_screen()


def last_runtime_for(directory: str) -> str | None:
    for session in history_mod.load():
        if session.dir == directory:
            return session.runtime
    return None


class RuntimeScreen(Screen):
    BINDINGS = [Binding("escape", "back", "Voltar")]

    AGENTS = ("codex", "claude", "muse")

    def __init__(self, directory: str) -> None:
        super().__init__()
        self.directory = directory
        self.rows: list[Row] = []

    def compose(self) -> ComposeResult:
        yield Header(show_clock=False)
        yield OptionList(id="runtimes")
        yield Footer()

    def on_mount(self) -> None:
        self.sub_title = f"runtime · {util.shorten(self.directory)}"
        agents = [runtimes.get(name) for name in self.AGENTS]
        shell = runtimes.get("shell")
        self.rows = (
            [("header", "Agentes")]
            + [("item", r) for r in agents]
            + [("header", "Terminal")]
            + [("item", shell)]
        )
        option_list = self.query_one("#runtimes", OptionList)
        render_rows(option_list, self.rows, runtime_label)
        preferred = last_runtime_for(self.directory)
        if preferred is not None:
            try:
                candidate = runtimes.get(preferred)
            except KeyError:
                candidate = None
            if candidate is not None and runtimes.is_available(candidate):
                highlight_payload(option_list, self.rows, candidate)
                option_list.focus()
                return
        for index, (kind, payload) in enumerate(self.rows):
            if kind == "item" and runtimes.is_available(payload):
                option_list.highlighted = index
                break
        option_list.focus()

    def on_option_list_option_selected(self, event: OptionList.OptionSelected) -> None:
        index = event.option_index
        if not 0 <= index < len(self.rows) or self.rows[index][0] != "item":
            return
        runtime = self.rows[index][1]
        if not runtimes.is_available(runtime):
            self.notify(f"{runtime.label} não está instalado.", severity="warning")
            return
        self.app.exit(Choice(dir=self.directory, runtime=runtime.name))

    def action_back(self) -> None:
        self.app.pop_screen()


class AtlasApp(App):
    TITLE = "Atlas"
    CSS = """
    #filter { margin: 1 2 0 2; }
    #dirs, #recents, #runtimes { margin: 1 2; }
    """

    def __init__(self, sessions: list[history_mod.Session] | None = None) -> None:
        super().__init__()
        self.sessions = sessions if sessions is not None else history_mod.load()

    def on_mount(self) -> None:
        self.push_screen(RecentsScreen(self.sessions))
        if not self.sessions:
            self.push_screen(NewSessionScreen())


def pick(sessions: list[history_mod.Session] | None = None) -> Choice | None:
    """Run the TUI and return the user's choice (None when cancelled)."""
    return AtlasApp(sessions).run()
