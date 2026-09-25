import hashlib
import hmac
import json
import os
import tempfile
from datetime import date

os.environ["SQLITE_PATH"] = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DEMO_MODE"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app import db  # noqa: E402
from app.agent.pipeline import _apply_plan, compute_score, request_analysis  # noqa: E402
from app.agent.schemas import MilestonePlan, NewTask, PlanResult, TaskUpdate  # noqa: E402
from app.github_client import parse_repo_ref  # noqa: E402
from app.main import app  # noqa: E402
from app.roadmap import build_roadmap  # noqa: E402
from app.util import now_iso  # noqa: E402

db.init_db()


OWNER_A = "aaaaaaaa-1111-2222-3333-444444444444"
OWNER_B = "bbbbbbbb-1111-2222-3333-444444444444"


def _key(owner_id):
    return hashlib.sha256(owner_id.encode()).hexdigest()


def _repo(rid="rp_test", full="acme/widget", owner=None, status="idle", updated_at=None):
    db.execute(
        "INSERT OR IGNORE INTO repos (id, owner, name, full_name, default_branch, webhook_secret, status, owner_key, "
        "created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (rid, *full.split("/"), full, "main", "s3cret", status, _key(owner) if owner else None, now_iso(),
         updated_at or now_iso()))
    return rid


def test_parse_repo_ref():
    assert parse_repo_ref("octo/hello") == ("octo", "hello")
    assert parse_repo_ref("https://github.com/octo/hello.git") == ("octo", "hello")
    assert parse_repo_ref("git@github.com:octo/hello") == ("octo", "hello")


def test_score_prefers_urgent_important_and_small():
    assert compute_score(5, 5, 1) > compute_score(5, 5, 8)
    assert compute_score(5, 5, 1) > compute_score(2, 5, 1) > compute_score(2, 2, 1)
    assert 0 <= compute_score(1, 1, 10) <= 100


def test_apply_plan_initial_then_diff():
    rid = _repo("rp_plan", "acme/plan")
    plan = PlanResult(
        change_summary="init", progress_assessment="", next_actions=[],
        milestones=[MilestonePlan(key="new-1", title="M1", goal="g")],
        task_updates=[],
        new_tasks=[
            NewTask(title="A", description="", category="feature", urgency=4, importance=5, effort_days=2,
                    milestone_key="new-1", rationale="r"),
            NewTask(title="B", description="", category="test", urgency=2, importance=3, effort_days=1,
                    milestone_key="new-1", rationale="r", depends_on_titles=["A"]),
        ],
    )
    applied = _apply_plan(rid, "an1", plan)
    assert [a["type"] for a in applied] == ["created", "created"]
    tasks = {t["title"]: t for t in db.query("SELECT * FROM tasks WHERE repo_id=?", (rid,))}
    assert json.loads(tasks["B"]["depends_on"]) == [tasks["A"]["id"]]
    ms_id = tasks["A"]["milestone_id"]

    # 人が手動でステータスを決めたタスクはエージェントが上書きしない
    db.execute("UPDATE tasks SET status='todo', status_locked=1 WHERE id=?", (tasks["B"]["id"],))
    plan2 = PlanResult(
        change_summary="diff", progress_assessment="", next_actions=[],
        milestones=[MilestonePlan(key=ms_id, title="M1", goal="g")],
        task_updates=[
            TaskUpdate(task_id=tasks["A"]["id"], status="done", reason="commit abc"),
            TaskUpdate(task_id=tasks["B"]["id"], status="done", reason="commit def"),
            TaskUpdate(task_id="tk_unknown", status="done", reason="x"),
        ],
        new_tasks=[NewTask(title="a", description="", category="bug", urgency=1, importance=1, effort_days=1,
                           milestone_key="bogus", rationale="duplicate title")],
    )
    applied2 = _apply_plan(rid, "an2", plan2)
    assert [(a["title"], a["to"]) for a in applied2] == [("A", "done")]
    after = {t["title"]: t for t in db.query("SELECT * FROM tasks WHERE repo_id=?", (rid,))}
    assert after["A"]["status"] == "done" and after["A"]["completed_at"]
    assert after["B"]["status"] == "todo"
    assert len(db.query("SELECT id FROM milestones WHERE repo_id=?", (rid,))) == 1


def test_request_analysis_is_exclusive():
    rid = _repo("rp_lock", "acme/lock")
    assert request_analysis(rid) is True
    assert request_analysis(rid) is False
    assert db.query_one("SELECT pending_reanalysis FROM repos WHERE id=?", (rid,))["pending_reanalysis"] == 1


def test_roadmap_respects_dependencies_and_skips_weekends():
    ms = [{"id": "m1", "title": "M1", "goal": ""}]
    tasks = [
        {"id": "a", "title": "A", "status": "todo", "milestone_id": "m1", "score": 50, "effort_days": 2, "depends_on": None},
        {"id": "b", "title": "B", "status": "todo", "milestone_id": "m1", "score": 90, "effort_days": 1, "depends_on": '["a"]'},
    ]
    rm = build_roadmap(ms, tasks, lanes=2, today=date(2026, 9, 25))  # 金曜
    items = {t["id"]: t for t in rm["milestones"][0]["tasks"]}
    assert items["a"]["start"] == "2026-09-25" and items["a"]["end"] == "2026-09-28"  # 土日をまたぐ
    assert items["b"]["start"] == "2026-09-29"  # 依存タスクの翌営業日


def test_webhook_signature():
    _repo("rp_hook", "acme/hook")
    c = TestClient(app)
    body = json.dumps({"zen": "hi", "repository": {"full_name": "acme/hook"}}).encode()
    sig = "sha256=" + hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert c.post("/api/webhooks/github", content=body, headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": "sha256=0"}).status_code == 401
    assert c.post("/api/webhooks/github", content=body, headers={"X-GitHub-Event": "ping", "X-Hub-Signature-256": sig}).json() == {"ok": True}
    # デフォルトブランチ以外への push は無視
    body2 = json.dumps({"ref": "refs/heads/feature", "repository": {"full_name": "acme/hook"}}).encode()
    sig2 = "sha256=" + hmac.new(b"s3cret", body2, hashlib.sha256).hexdigest()
    r = c.post("/api/webhooks/github", content=body2, headers={"X-GitHub-Event": "push", "X-Hub-Signature-256": sig2})
    assert r.json()["ignored"] == "non-default branch"


def test_demo_repo_seeded_once_listed_last_and_readonly(monkeypatch):
    import app.main as m

    class FakeGH:
        def __init__(self, *_a, **_k):
            pass

        def repo(self, owner, name):
            return {"full_name": f"{owner}/{name}", "name": name, "owner": {"login": owner},
                    "default_branch": "master", "private": False}

    ran = []
    monkeypatch.setattr(m, "GitHubClient", FakeGH)
    monkeypatch.setattr(m, "run_analysis", lambda rid, trig, comp: ran.append((rid, trig)))
    m.seed_demo_repo()
    m.seed_demo_repo()  # 2 回目は何もしない
    demo = db.query("SELECT * FROM repos WHERE full_name='antirez/kilo' AND is_demo=1")
    assert len(demo) == 1 and demo[0]["language"] == "en" and demo[0]["owner_key"] is None
    demo_id = demo[0]["id"]

    # 完了した分析がなければ起動時に分析する
    m.ensure_demo_analyzed()
    assert ran == [(demo_id, "initial")]

    _repo("rp_newest", "acme/newest", owner=OWNER_A)
    c = TestClient(app)
    names = [r["full_name"] for r in c.get("/api/repos", headers={"X-Owner-Id": OWNER_A}).json()]
    assert names == ["acme/newest", "antirez/kilo"]  # デモは最後尾
    assert c.get(f"/api/repos/{demo_id}").status_code == 200  # 誰でも閲覧できる
    assert "webhook_secret" not in c.get(f"/api/repos/{demo_id}").json()["repo"]
    h = {"X-Owner-Id": OWNER_A}
    assert c.delete(f"/api/repos/{demo_id}", headers=h).json()["detail"] == "demo_readonly"
    assert c.post(f"/api/repos/{demo_id}/analyze", headers=h).json()["detail"] == "demo_readonly"

    # 削除されても再登録しない
    db.execute("DELETE FROM repos WHERE id=?", (demo_id,))
    m.seed_demo_repo()
    assert not db.query("SELECT id FROM repos WHERE full_name='antirez/kilo' AND is_demo=1")


def test_repos_are_isolated_per_browser():
    rid = _repo("rp_own_a", "acme/private-thing", owner=OWNER_A)
    task_id = "tk_own_a"
    db.execute("INSERT INTO tasks (id, repo_id, title, status, created_at, updated_at) VALUES (?,?,?,?,?,?)",
               (task_id, rid, "T", "todo", now_iso(), now_iso()))
    c = TestClient(app)
    a, b = {"X-Owner-Id": OWNER_A}, {"X-Owner-Id": OWNER_B}
    assert "acme/private-thing" in [r["full_name"] for r in c.get("/api/repos", headers=a).json()]
    assert "acme/private-thing" not in [r["full_name"] for r in c.get("/api/repos", headers=b).json()]
    assert "acme/private-thing" not in [r["full_name"] for r in c.get("/api/repos").json()]
    for path in ("", "/tasks", "/roadmap", "/progress", "/events", "/analyses"):
        assert c.get(f"/api/repos/{rid}{path}", headers=b).status_code == 404, path
        assert c.get(f"/api/repos/{rid}{path}", headers=a).status_code == 200, path
    assert c.patch(f"/api/tasks/{task_id}", json={"status": "done"}, headers=b).status_code == 404
    assert c.delete(f"/api/repos/{rid}", headers=b).status_code == 404
    got = c.get(f"/api/repos/{rid}", headers=a).json()["repo"]
    assert got["is_owner"] and got["webhook_secret"] == "s3cret" and "owner_key" not in got
    assert c.post("/api/repos", json={"repo": "acme/x"}).json()["detail"] == "missing_owner"


def test_interrupted_analysis_is_recovered():
    from app.agent.pipeline import recover_stale
    rid = _repo("rp_stale", "acme/stale", owner=OWNER_A, status="analyzing", updated_at="2020-01-01T00:00:00+00:00")
    _repo("rp_fresh", "acme/fresh", owner=OWNER_A, status="analyzing")  # heartbeat が生きているものは対象外
    db.execute("INSERT INTO analyses (id, repo_id, trigger, status, started_at) VALUES ('an_stale', ?, 'initial', "
               "'running', '2020-01-01T00:00:00+00:00')", (rid,))
    assert recover_stale() == [rid]
    assert db.query_one("SELECT status FROM analyses WHERE id='an_stale'")["status"] == "error"
    assert db.query_one("SELECT status FROM repos WHERE id=?", (rid,))["status"] == "queued"
    assert recover_stale() == []  # 確保済みなので二重に拾わない


def test_migration_drops_unique_full_name(tmp_path):
    import sqlite3
    path = tmp_path / "old.db"
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE repos (id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, "
                "full_name TEXT NOT NULL UNIQUE, webhook_secret TEXT NOT NULL, status TEXT DEFAULT 'idle', "
                "created_at TEXT NOT NULL, updated_at TEXT NOT NULL)")
    con.execute("INSERT INTO repos VALUES ('rp_old','o','n','o/n','s','idle','t','t')")
    con.commit()
    con.close()
    orig = db._db
    db._db = db._SQLite(str(path))
    try:
        db.init_db()
        db.init_db()  # 2 回目は何もしない
        assert "UNIQUE" not in db.query_one("SELECT sql FROM sqlite_master WHERE name='repos'")["sql"].upper()
        assert db.query_one("SELECT full_name, language, is_demo FROM repos WHERE id='rp_old'") == \
            {"full_name": "o/n", "language": "ja", "is_demo": 0}
        db.execute("INSERT INTO repos (id, owner, name, full_name, webhook_secret, created_at, updated_at) "
                   "VALUES ('rp_dup','o','n','o/n','s2','t','t')")  # 同じ full_name を登録できる
    finally:
        db._db = orig
