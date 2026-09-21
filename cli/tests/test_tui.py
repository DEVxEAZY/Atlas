"""Headless Textual tests for the Atlas TUI (pilot) plus pure-helper tests."""

import shutil

from atlas_cli import history, repos, runtimes, tui


def test_cycle_runtime_wraps_and_recovers():
    assert tui.cycle_runtime("codex") == "claude"
    assert tui.cycle_runtime("shell") == "codex"
    assert tui.cycle_runtime("unknown") == "codex"


def test_runtime_label_shell_shows_resolved_shell(monkeypatch):
    monkeypatch.setenv("SHELL", "/bin/bash")
    assert tui.runtime_label(runtimes.get("shell")) == "  ✓ Terminal (/bin/bash)"


def test_runtime_label_unavailable(monkeypatch):
    monkeypatch.setattr(shutil, "which", lambda cmd: None)
    assert tui.runtime_label(runtimes.get("codex")) == "  ✗ Codex    (não instalado)"


def test_session_rows_group_by_domain_and_activity(monkeypatch, tmp_path):
    root_a = tmp_path / "@a"
    root_b = tmp_path / "@b"
    root_a.mkdir()
    (root_a / "proj").mkdir()
    root_b.mkdir()
    monkeypatch.setenv("ATLAS_ROOTS", f"{root_a}:{root_b}")
    old = history.Session(dir=str(root_a / "proj"), runtime="codex", last_used="2026-01-01T00:00:00+00:00")
    new = history.Session(dir=str(root_b), runtime="claude", last_used="2026-09-01T00:00:00+00:00")
    rows = tui.session_rows([old, new])
    assert rows[0] == ("header", "@b  ·  1 sessão")
    assert rows[1] == ("item", new)
    assert rows[2] == ("header", "@a  ·  1 sessão")
    assert rows[3] == ("item", old)


def test_session_display_uses_relative_path(monkeypatch, tmp_path):
    root = tmp_path / "@a"
    (root / "group" / "proj").mkdir(parents=True)
    monkeypatch.setenv("ATLAS_ROOTS", str(root))
    session = history.Session(dir=str(root / "group" / "proj"), runtime="codex", last_used="x")
    assert tui.session_display(session) == "group/proj"
    outside = history.Session(dir="/elsewhere/x", runtime="codex", last_used="x")
    assert tui.session_display(outside) == "/elsewhere/x"


def test_candidate_display_nested_relative(monkeypatch, tmp_path):
    root = tmp_path / "@a"
    monkeypatch.setenv("ATLAS_ROOTS", str(root))
    nested = repos.Candidate(path=str(root / "group" / "proj"), domain="@a", kind="repo")
    assert tui.candidate_display(nested) == "group/proj"
    domain = repos.Candidate(path=str(root), domain="@a", kind="domain")
    assert tui.candidate_display(domain) == "⌂ raiz do domínio"


def test_filter_candidates_prefers_name_prefix():
    repo = repos.Candidate(path="/roots/esl-api-server", domain="@d", kind="repo")
    nested = repos.Candidate(path="/roots/esl-stuff/deep", domain="@d", kind="repo")
    assert tui.filter_candidates([nested, repo], "esl-a") == [repo]
    assert tui.filter_candidates([repo, nested], "") == [repo, nested]
    assert tui.filter_candidates([repo, nested], "zzz") == []


def test_session_label_marks_missing_dirs(tmp_path):
    gone = tmp_path / "gone"
    label = tui.session_label(history.Session(dir=str(gone), runtime="codex", last_used="x"))
    assert label.endswith("⚠")
    assert "codex" in label


async def test_open_recent_returns_choice(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    target = tmp_path / "proj"
    target.mkdir()
    history.record(str(target), "codex")

    app = tui.AtlasApp()
    async with app.run_test() as pilot:
        await pilot.press("enter")

    assert app.return_value == tui.Choice(dir=str(target.resolve()), runtime="codex")


async def test_quit_returns_none(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    target = tmp_path / "proj"
    target.mkdir()
    history.record(str(target), "muse")

    app = tui.AtlasApp()
    async with app.run_test() as pilot:
        await pilot.press("q")

    assert app.return_value is None


async def test_new_session_free_path_then_runtime(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    monkeypatch.setenv("ATLAS_ROOTS", str(tmp_path / "empty-root"))
    monkeypatch.setattr(shutil, "which", lambda cmd: f"/bin/{cmd}")
    seed = tmp_path / "seed"
    seed.mkdir()
    history.record(str(seed), "codex")
    target = tmp_path / "my-project"
    target.mkdir()

    app = tui.AtlasApp()
    async with app.run_test() as pilot:
        await pilot.press("n")
        for char in str(target):
            await pilot.press(char)
        await pilot.pause()
        await pilot.press("enter")  # choose "use <typed path>"
        await pilot.pause()
        await pilot.press("enter")  # choose first runtime (codex)

    assert app.return_value == tui.Choice(dir=str(target.resolve()), runtime="codex")


async def test_cycle_runtime_changes_choice(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    target = tmp_path / "proj"
    target.mkdir()
    history.record(str(target), "codex")

    app = tui.AtlasApp()
    async with app.run_test() as pilot:
        await pilot.press("r")
        await pilot.press("enter")

    assert app.return_value == tui.Choice(dir=str(target.resolve()), runtime="claude")


async def test_recents_filter_narrows_and_enter_opens(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    alpha = tmp_path / "alpha-proj"
    alpha.mkdir()
    beta = tmp_path / "beta-proj"
    beta.mkdir()
    history.record(str(alpha), "codex")
    history.record(str(beta), "muse")

    app = tui.AtlasApp()
    async with app.run_test() as pilot:
        await pilot.press("slash")
        for char in "beta":
            await pilot.press(char)
        await pilot.pause()
        screen = app.screen
        assert [row for row in screen.rows if row[0] == "item"] != []
        await pilot.press("enter")

    assert app.return_value == tui.Choice(dir=str(beta.resolve()), runtime="muse")


async def test_runtime_preselects_last_runtime_for_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    monkeypatch.setenv("ATLAS_ROOTS", str(tmp_path / "empty-root"))
    monkeypatch.setattr(shutil, "which", lambda cmd: f"/bin/{cmd}")
    target = tmp_path / "my-project"
    target.mkdir()
    history.record(str(target), "muse")

    app = tui.AtlasApp()
    async with app.run_test() as pilot:
        await pilot.press("n")
        for char in str(target):
            await pilot.press(char)
        await pilot.pause()
        await pilot.press("enter")  # choose typed path -> runtime screen
        await pilot.pause()
        await pilot.press("enter")  # accept preselected runtime

    assert app.return_value == tui.Choice(dir=str(target.resolve()), runtime="muse")
