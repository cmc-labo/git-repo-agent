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


def _repo(rid="rp_test", full="acme/widget"):
    db.execute(
        "INSERT OR IGNORE INTO repos (id, owner, name, full_name, default_branch, webhook_secret, status, created_at, updated_at) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (rid, *full.split("/"), full, "main", "s3cret", "idle", now_iso(), now_iso()))
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


def test_demo_repo_seeded_once_listed_last_and_protected(monkeypatch):
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
    demo = db.query("SELECT * FROM repos WHERE full_name='antirez/kilo'")
    assert len(demo) == 1 and demo[0]["is_demo"] == 1 and demo[0]["language"] == "en"
    assert len(ran) == 1

    _repo("rp_newest", "acme/newest")  # デモより後に登録されたユーザーのリポジトリ
    c = TestClient(app)
    names = [r["full_name"] for r in c.get("/api/repos").json()]
    assert names[-1] == "antirez/kilo" and names[0] != "antirez/kilo"
    assert c.delete(f"/api/repos/{demo[0]['id']}").json()["detail"] == "demo_protected"

    # 削除されても (DB から直接消しても) 再登録しない
    db.execute("DELETE FROM repos WHERE full_name='antirez/kilo'")
    m.seed_demo_repo()
    assert not db.query("SELECT id FROM repos WHERE full_name='antirez/kilo'")
