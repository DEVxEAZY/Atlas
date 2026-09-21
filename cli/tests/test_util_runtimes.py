from datetime import datetime, timedelta, timezone

from atlas_cli import runtimes, util


def test_ago_pt_br():
    now = datetime(2026, 9, 19, 12, 0, tzinfo=timezone.utc)
    assert util.ago(now.isoformat(), now) == "agora"
    assert util.ago((now - timedelta(minutes=5)).isoformat(), now) == "há 5 min"
    assert util.ago((now - timedelta(hours=3)).isoformat(), now) == "há 3 h"
    assert util.ago((now - timedelta(days=2)).isoformat(), now) == "há 2 d"
    assert util.ago("not-a-date", now) == "not-a-date"


def test_shorten_home(monkeypatch, tmp_path):
    monkeypatch.setenv("HOME", str(tmp_path))
    assert util.shorten(str(tmp_path)) == "~"
    assert util.shorten(str(tmp_path / "a" / "b")) == "~/a/b"
    assert util.shorten("/elsewhere/x") == "/elsewhere/x"


def test_runtimes_registry():
    assert runtimes.get("codex").argv == ("codex",)
    assert runtimes.get("shell").label == "Terminal"
    try:
        runtimes.get("nope")
    except KeyError:
        pass
    else:
        raise AssertionError("expected KeyError")
    assert runtimes.is_available(runtimes.get("shell")) is True
