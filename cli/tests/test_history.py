import json

from atlas_cli import history


def test_record_and_load_order(tmp_path, monkeypatch):
    db = tmp_path / "history.json"
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(db))
    history.record(str(tmp_path / "a"), "codex")
    history.record(str(tmp_path / "b"), "claude")
    sessions = history.load()
    assert [s.dir for s in sessions] == [str(tmp_path / "b"), str(tmp_path / "a")]
    assert sessions[0].runtime == "claude"


def test_record_bumps_and_counts_uses(tmp_path, monkeypatch):
    db = tmp_path / "history.json"
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(db))
    history.record(str(tmp_path), "codex")
    history.record(str(tmp_path), "codex")
    sessions = history.load()
    assert len(sessions) == 1
    assert sessions[0].uses == 2


def test_load_missing_and_corrupt(tmp_path, monkeypatch):
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(tmp_path / "nope.json"))
    assert history.load() == []
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(bad))
    assert history.load() == []


def test_load_skips_invalid_entries(tmp_path, monkeypatch):
    db = tmp_path / "history.json"
    db.write_text(
        json.dumps([{"dir": "/x", "runtime": "codex"}, {"dir": "/y"}]),
        encoding="utf-8",
    )
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(db))
    assert history.load() == []


def test_remove(tmp_path, monkeypatch):
    db = tmp_path / "history.json"
    monkeypatch.setenv("ATLAS_HISTORY_FILE", str(db))
    history.record(str(tmp_path), "codex")
    assert history.remove(str(tmp_path), "codex") is True
    assert history.load() == []
    assert history.remove(str(tmp_path), "codex") is False
