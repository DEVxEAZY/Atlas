from pathlib import Path

from atlas_cli import repos


def _repo(path: Path) -> Path:
    path.mkdir(parents=True)
    (path / ".git").mkdir()
    return path


def test_discover_lists_domain_repos_and_dirs(tmp_path):
    root = tmp_path / "@fake"
    _repo(root / "my-repo")
    (root / "plain").mkdir(parents=True)
    (root / ".hidden").mkdir(parents=True)

    found = repos.discover([root])
    by_name = {Path(c.path).name: c for c in found}
    assert by_name["@fake"].kind == "domain"
    assert by_name["my-repo"].kind == "repo"
    assert by_name["plain"].kind == "dir"
    assert ".hidden" not in by_name


def test_discover_finds_nested_repos_at_depth_2(tmp_path):
    root = tmp_path / "@fake"
    _repo(root / "group" / "nested")

    found = repos.discover([root], max_depth=2)
    kinds = {c.path: c.kind for c in found}
    assert kinds[str(root / "group" / "nested")] == "repo"


def test_discover_skips_missing_roots(tmp_path):
    assert repos.discover([tmp_path / "nope"]) == []


def test_split_domain_relative_and_root(tmp_path, monkeypatch):
    root = tmp_path / "@fake"
    (root / "group" / "proj").mkdir(parents=True)
    monkeypatch.setenv("ATLAS_ROOTS", str(root))
    assert repos.split_domain(str(root / "group" / "proj")) == ("@fake", "group/proj")
    assert repos.split_domain(str(root)) == ("@fake", "")
    assert repos.split_domain("/elsewhere/x") == (None, "/elsewhere/x")


def test_classify_domain_repo_workspace_dir(tmp_path):
    root = tmp_path / "@fake"
    repo = _repo(root / "r")
    plain = root / "p"
    plain.mkdir(parents=True)
    assert repos.classify(root, [root]) == "domain"
    assert repos.classify(repo, [root]) == "repo"
    assert repos.classify(plain, [root]) == "dir"
    ws = {str(plain.resolve())}
    assert repos.classify(plain, [root], workspaces=ws) == "workspace"
    # name alone never makes a workspace
    assert repos.classify(plain, [root], workspaces={"something-else"}) == "dir"
