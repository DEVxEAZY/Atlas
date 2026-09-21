from atlas_cli import history, main


def test_dry_run_prints_and_does_not_record(monkeypatch, tmp_path, capsys):
    db = tmp_path / "h.json"
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(db))
    target = tmp_path / "proj"
    target.mkdir()
    assert main.launch(str(target), "shell", dry_run=True) == 0
    assert not db.exists()
    assert str(target.resolve()) in capsys.readouterr().out


def test_launch_missing_dir_returns_2(monkeypatch, tmp_path):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "h.json"))
    assert main.launch(str(tmp_path / "nope"), "shell") == 2


def test_build_argv_shell_uses_env(monkeypatch):
    monkeypatch.setenv("SHELL", "/bin/bash")
    assert main.build_argv("shell") == ["/bin/bash"]


def test_launch_records_before_exec(monkeypatch, tmp_path):
    # exec is unreachable in-process; prove record happens via dry-run sibling
    # plus a monkeypatched os.execvp that raises instead of replacing.
    import os

    db = tmp_path / "h.json"
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(db))
    target = tmp_path / "proj"
    target.mkdir()

    seen = {}

    def fake_execvp(file, args):
        seen["file"] = file
        seen["args"] = args
        raise RuntimeError("exec-reached")

    monkeypatch.setattr(os, "execvp", fake_execvp)
    monkeypatch.chdir(tmp_path)
    try:
        main.launch(str(target), "shell")
    except RuntimeError as exc:
        assert str(exc) == "exec-reached"
    else:
        raise AssertionError("expected execvp to be reached")
    assert seen["file"].endswith("sh") or seen["file"] == os.environ.get("SHELL", "/bin/sh")
    assert history.load(db)[0].dir == str(target.resolve())
