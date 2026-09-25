from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import db
from .agent import llm, prompts
from .agent.pipeline import compute_score, log_event, request_analysis, run_analysis
from .agent.schemas import TranslationResult
from .config import settings
from .github_client import GitHubClient, GitHubError, parse_repo_ref
from .roadmap import build_roadmap
from .util import decrypt, encrypt, new_id, new_secret, now_iso

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("app")

# BCP-47 (例: ja, en, pt-BR, zh-Hant, es-419)
LANG_PATTERN = r"^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    db.init_db()
    # GitHub API を呼ぶので起動をブロックしないよう別スレッドで
    threading.Thread(target=seed_demo_repo, daemon=True).start()
    yield


app = FastAPI(title="Git Repository Agent API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _repo_or_404(repo_id: str) -> dict:
    r = db.query_one("SELECT * FROM repos WHERE id=?", (repo_id,))
    if not r:
        raise HTTPException(404, "repository not found")
    return r


def _public_repo(r: dict, with_secret: bool = False) -> dict:
    out = {k: v for k, v in r.items() if k not in ("token_enc", "webhook_secret")}
    out["has_token"] = bool(r.get("token_enc"))
    out["is_private"] = bool(r.get("is_private"))
    out["is_demo"] = bool(r.get("is_demo"))
    if with_secret:
        out["webhook_url"] = settings.public_base_url.rstrip("/") + "/api/webhooks/github"
        out["webhook_secret"] = r["webhook_secret"]
    return out


def _loads(s: str | None):
    return json.loads(s) if s else None


# ------------------------------------------------------------------ misc
@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/config")
def get_config():
    return {
        "demo_mode": not settings.gemini_available,
        "model": settings.gemini_model,
        "backend": "vertex-ai" if settings.use_vertex else ("gemini-api" if settings.gemini_api_key else "demo"),
        "db": "turso" if settings.turso_url else "sqlite",
    }


# ------------------------------------------------------------------ repos
class RepoCreate(BaseModel):
    repo: str = Field(description="owner/repo or a GitHub URL")
    token: str | None = Field(default=None, description="GitHub token for private repositories (read access)")
    language: str = Field(default="en", pattern=LANG_PATTERN, description="Output language of the analysis")


class RepoPatch(BaseModel):
    token: str | None = None
    language: str | None = Field(default=None, pattern=LANG_PATTERN)


@app.get("/api/repos")
def list_repos():
    # ユーザーが登録したものを新しい順に、デモは最後尾
    repos = db.query("SELECT * FROM repos ORDER BY COALESCE(is_demo, 0) ASC, created_at DESC")
    stats = {
        r["repo_id"]: r for r in db.query(
            "SELECT repo_id, COUNT(*) AS total, SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, "
            "SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS in_progress "
            "FROM tasks WHERE status != 'dropped' GROUP BY repo_id")
    }
    out = []
    for r in repos:
        s = stats.get(r["id"], {})
        out.append({**_public_repo(r), "tasks_total": s.get("total") or 0, "tasks_done": s.get("done") or 0,
                    "tasks_in_progress": s.get("in_progress") or 0})
    return out


@app.post("/api/repos", status_code=201)
def create_repo(body: RepoCreate, bg: BackgroundTasks):
    try:
        owner, name = parse_repo_ref(body.repo)
    except ValueError as e:
        raise HTTPException(400, "invalid_repo_ref") from e
    token = (body.token or "").strip() or None
    try:
        meta = GitHubClient(token or settings.github_token or None).repo(owner, name)
    except GitHubError as e:
        if e.status in (401, 403, 404):
            raise HTTPException(400, "repo_inaccessible") from e
        raise HTTPException(502, str(e)) from e
    if db.query_one("SELECT id FROM repos WHERE full_name=?", (meta["full_name"],)):
        raise HTTPException(409, "repo_exists")
    rid = _register(meta, token, body.language, is_demo=False)
    if request_analysis(rid):
        bg.add_task(run_analysis, rid, "initial", True)
    return _public_repo(_repo_or_404(rid), with_secret=True)


def _register(meta: dict, token: str | None, language: str, is_demo: bool) -> str:
    rid = new_id("rp")
    ts = now_iso()
    db.execute(
        "INSERT INTO repos (id, owner, name, full_name, description, html_url, is_private, default_branch, token_enc, "
        "webhook_secret, status, language, is_demo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (rid, meta["owner"]["login"], meta["name"], meta["full_name"], meta.get("description"), meta.get("html_url"),
         int(meta.get("private", False)), meta.get("default_branch"), encrypt(token), new_secret(), "idle", language,
         int(is_demo), ts, ts),
    )
    log_event(rid, "registered", repo=meta["full_name"])
    return rid


def seed_demo_repo() -> None:
    """デモ用リポジトリを一度だけ登録して分析する. 登録済みかは app_meta に記録 (削除後に復活させない)."""
    if not settings.demo_repo:
        return
    try:
        key = f"demo_seeded:{settings.demo_repo.lower()}"
        if db.query_one("SELECT value FROM app_meta WHERE key=?", (key,)):
            return
        owner, name = parse_repo_ref(settings.demo_repo)
        existing = db.query_one("SELECT id FROM repos WHERE LOWER(full_name)=LOWER(?)", (f"{owner}/{name}",))
        if existing:
            db.execute("UPDATE repos SET is_demo=1 WHERE id=?", (existing["id"],))
            rid = None
        else:
            meta = GitHubClient(settings.github_token or None).repo(owner, name)
            rid = _register(meta, None, settings.demo_repo_language, is_demo=True)
        # 複数インスタンスが同時に起動しても 1 回だけ記録される
        if db.execute("INSERT OR IGNORE INTO app_meta (key, value) VALUES (?, ?)", (key, now_iso())) and rid:
            if request_analysis(rid):
                run_analysis(rid, "initial", True)
    except Exception:  # noqa: BLE001  デモの登録失敗で API を止めない
        log.warning("failed to seed demo repository", exc_info=True)


@app.get("/api/repos/{repo_id}")
def get_repo(repo_id: str):
    r = _repo_or_404(repo_id)
    latest = db.query_one(
        "SELECT * FROM analyses WHERE repo_id=? AND status='done' ORDER BY started_at DESC LIMIT 1", (repo_id,))
    comp = db.query_one(
        "SELECT competitors_json FROM analyses WHERE repo_id=? AND competitors_json IS NOT NULL "
        "ORDER BY started_at DESC LIMIT 1", (repo_id,))
    return {
        "repo": _public_repo(r, with_secret=True),
        "latest_analysis": _analysis_public(latest) if latest else None,
        "competitors": _loads(comp["competitors_json"]) if comp else None,
    }


@app.patch("/api/repos/{repo_id}")
def patch_repo(repo_id: str, body: RepoPatch):
    _repo_or_404(repo_id)
    if body.token is not None:
        db.execute("UPDATE repos SET token_enc=?, updated_at=? WHERE id=?",
                   (encrypt(body.token.strip() or None), now_iso(), repo_id))
    if body.language is not None:
        db.execute("UPDATE repos SET language=?, updated_at=? WHERE id=?", (body.language, now_iso(), repo_id))
    return _public_repo(_repo_or_404(repo_id))


@app.delete("/api/repos/{repo_id}", status_code=204)
def delete_repo(repo_id: str):
    if _repo_or_404(repo_id).get("is_demo"):
        raise HTTPException(403, "demo_protected")
    for t in ("tasks", "milestones", "analyses", "events"):
        db.execute(f"DELETE FROM {t} WHERE repo_id=?", (repo_id,))
    db.execute("DELETE FROM repos WHERE id=?", (repo_id,))


class AnalyzeReq(BaseModel):
    competitors: bool = False


@app.post("/api/repos/{repo_id}/analyze", status_code=202)
def analyze(repo_id: str, bg: BackgroundTasks, body: AnalyzeReq | None = None):
    _repo_or_404(repo_id)
    started = request_analysis(repo_id)
    if started:
        bg.add_task(run_analysis, repo_id, "manual", bool(body and body.competitors))
    return {"started": started, "queued": not started}


# ------------------------------------------------------------------ analyses / events
def _analysis_public(a: dict) -> dict:
    return {
        **{k: a[k] for k in ("id", "trigger", "head_sha", "base_sha", "status", "tasks_total", "tasks_done",
                              "tasks_in_progress", "error", "started_at", "finished_at")},
        "insight": _loads(a.get("insight_json")),
        "changes": _loads(a.get("changes_json")),
    }


@app.get("/api/repos/{repo_id}/analyses")
def list_analyses(repo_id: str, limit: int = 30):
    rows = db.query(
        "SELECT id, trigger, head_sha, base_sha, status, tasks_total, tasks_done, tasks_in_progress, error, "
        "started_at, finished_at, changes_json FROM analyses WHERE repo_id=? ORDER BY started_at DESC LIMIT ?",
        (repo_id, limit))
    return [_analysis_public(r) for r in rows]


@app.get("/api/repos/{repo_id}/events")
def list_events(repo_id: str, limit: int = 50):
    return db.query("SELECT * FROM events WHERE repo_id=? ORDER BY id DESC LIMIT ?", (repo_id, limit))


# ------------------------------------------------------------------ tasks
def _task_out(t: dict) -> dict:
    t = dict(t)
    t["depends_on"] = _loads(t.get("depends_on")) or []
    t["status_locked"] = bool(t.get("status_locked"))
    return t


@app.get("/api/repos/{repo_id}/tasks")
def list_tasks(repo_id: str, include_dropped: bool = False):
    sql = "SELECT * FROM tasks WHERE repo_id=?" + ("" if include_dropped else " AND status != 'dropped'")
    tasks = [_task_out(t) for t in db.query(sql + " ORDER BY score DESC", (repo_id,))]
    milestones = db.query("SELECT * FROM milestones WHERE repo_id=? ORDER BY order_index", (repo_id,))
    return {"tasks": tasks, "milestones": milestones}


class TaskCreate(BaseModel):
    title: str
    description: str = ""
    category: str = "feature"
    urgency: int = Field(default=3, ge=1, le=5)
    importance: int = Field(default=3, ge=1, le=5)
    effort_days: float = Field(default=1, gt=0)
    milestone_id: str | None = None


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = Field(default=None, pattern="^(todo|in_progress|done|dropped)$")
    urgency: int | None = Field(default=None, ge=1, le=5)
    importance: int | None = Field(default=None, ge=1, le=5)
    effort_days: float | None = Field(default=None, gt=0)
    milestone_id: str | None = None


@app.post("/api/repos/{repo_id}/tasks", status_code=201)
def create_task(repo_id: str, body: TaskCreate):
    _repo_or_404(repo_id)
    tid, ts = new_id("tk"), now_iso()
    db.execute(
        "INSERT INTO tasks (id, repo_id, milestone_id, title, description, category, urgency, importance, effort_days, "
        "score, status, source, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (tid, repo_id, body.milestone_id, body.title, body.description, body.category, body.urgency, body.importance,
         body.effort_days, compute_score(body.urgency, body.importance, body.effort_days), "todo", "user", ts, ts))
    return _task_out(db.query_one("SELECT * FROM tasks WHERE id=?", (tid,)))


@app.patch("/api/tasks/{task_id}")
def patch_task(task_id: str, body: TaskPatch):
    t = db.query_one("SELECT * FROM tasks WHERE id=?", (task_id,))
    if not t:
        raise HTTPException(404, "task not found")
    sets = body.model_dump(exclude_unset=True)
    ts = now_iso()
    if "status" in sets and sets["status"] != t["status"]:
        sets["status_locked"] = 1  # 人が決めたステータスはエージェントが上書きしない
        if sets["status"] == "in_progress" and not t["started_at"]:
            sets["started_at"] = ts
        if sets["status"] == "done":
            sets["completed_at"] = ts
            if not t["started_at"]:
                sets["started_at"] = ts
        if sets["status"] in ("todo", "in_progress"):
            sets["completed_at"] = None
        log_event(t["repo_id"], "task_status", title=t["title"], status=sets["status"])
    merged = {**t, **sets}
    sets["score"] = compute_score(merged["urgency"], merged["importance"], merged["effort_days"])
    sets["updated_at"] = ts
    cols = ", ".join(f"{k}=?" for k in sets)
    db.execute(f"UPDATE tasks SET {cols} WHERE id=?", (*sets.values(), task_id))
    return _task_out(db.query_one("SELECT * FROM tasks WHERE id=?", (task_id,)))


# ------------------------------------------------------------------ roadmap / progress
@app.get("/api/repos/{repo_id}/roadmap")
def roadmap(repo_id: str):
    _repo_or_404(repo_id)
    milestones = db.query("SELECT * FROM milestones WHERE repo_id=? ORDER BY order_index", (repo_id,))
    tasks = db.query("SELECT * FROM tasks WHERE repo_id=?", (repo_id,))
    return build_roadmap(milestones, tasks, settings.roadmap_lanes)


@app.get("/api/repos/{repo_id}/progress")
def progress(repo_id: str):
    _repo_or_404(repo_id)
    tasks = db.query("SELECT status, category, effort_days, milestone_id FROM tasks WHERE repo_id=? AND status != 'dropped'",
                     (repo_id,))
    history = db.query(
        "SELECT started_at, tasks_total, tasks_done, tasks_in_progress, trigger, head_sha FROM analyses "
        "WHERE repo_id=? AND status='done' ORDER BY started_at", (repo_id,))
    by_status: dict[str, int] = {"todo": 0, "in_progress": 0, "done": 0}
    by_category: dict[str, dict] = {}
    effort_total = effort_done = 0.0
    for t in tasks:
        by_status[t["status"]] = by_status.get(t["status"], 0) + 1
        c = by_category.setdefault(t["category"] or "other", {"total": 0, "done": 0})
        c["total"] += 1
        c["done"] += t["status"] == "done"
        e = float(t["effort_days"] or 1)
        effort_total += e
        effort_done += e if t["status"] == "done" else 0
    return {
        "by_status": by_status,
        "by_category": by_category,
        "effort_total": effort_total,
        "effort_done": effort_done,
        "percent": round(effort_done / effort_total * 100) if effort_total else 0,
        "history": history,
    }


# ------------------------------------------------------------------ triggers
TRIGGER_EVENTS = {"push", "pull_request", "issues", "release"}


@app.post("/api/webhooks/github")
async def github_webhook(request: Request, bg: BackgroundTasks,
                         x_github_event: str = Header(default=""),
                         x_hub_signature_256: str = Header(default="")):
    raw = await request.body()
    try:
        payload = json.loads(raw or b"{}")
    except json.JSONDecodeError as e:
        raise HTTPException(400, "invalid json") from e
    full = (payload.get("repository") or {}).get("full_name")
    repo = db.query_one("SELECT * FROM repos WHERE full_name=?", (full,)) if full else None
    if not repo:
        raise HTTPException(404, "unknown repository")
    expected = "sha256=" + hmac.new(repo["webhook_secret"].encode(), raw, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, x_hub_signature_256):
        raise HTTPException(401, "invalid signature")

    if x_github_event == "ping":
        log_event(repo["id"], "webhook", "webhook_ping")
        return {"ok": True}
    if x_github_event not in TRIGGER_EVENTS:
        return {"ok": True, "ignored": x_github_event}

    action = payload.get("action")
    if x_github_event == "push":
        if payload.get("ref") != f"refs/heads/{repo['default_branch']}":
            return {"ok": True, "ignored": "non-default branch"}
        msg = ("webhook_push", {"n": len(payload.get("commits") or []), "sha": payload.get("after", "")[:7]})
    elif x_github_event == "pull_request":
        if action != "closed" or not (payload.get("pull_request") or {}).get("merged"):
            return {"ok": True, "ignored": f"pull_request.{action}"}
        msg = ("webhook_pr", {"number": payload["pull_request"]["number"], "title": payload["pull_request"]["title"]})
    elif x_github_event == "issues":
        if action not in ("opened", "closed", "reopened"):
            return {"ok": True, "ignored": f"issues.{action}"}
        msg = ("webhook_issue", {"number": payload["issue"]["number"], "action": action, "title": payload["issue"]["title"]})
    else:
        if action != "published":
            return {"ok": True, "ignored": f"release.{action}"}
        msg = ("webhook_release", {"tag": payload["release"].get("tag_name")})

    log_event(repo["id"], "webhook", msg[0], **msg[1])
    started = request_analysis(repo["id"])
    if started:
        bg.add_task(run_analysis, repo["id"], "webhook", False)
    return {"ok": True, "started": started, "queued": not started}


@app.post("/api/cron/poll")
def cron_poll(bg: BackgroundTasks, x_cron_token: str = Header(default="")):
    """Cloud Scheduler から定期実行. Webhook を設定できない repo も HEAD の変化で再分析する."""
    if settings.cron_token and not hmac.compare_digest(settings.cron_token, x_cron_token):
        raise HTTPException(401, "invalid cron token")
    triggered = []
    for r in db.query("SELECT * FROM repos WHERE status NOT IN ('queued','analyzing')"):
        try:
            gh = GitHubClient(decrypt(r["token_enc"]) or settings.github_token or None)
            head = gh.head_sha(r["owner"], r["name"], r["default_branch"] or "main")
        except Exception:  # noqa: BLE001
            log.warning("poll failed for %s", r["full_name"], exc_info=True)
            continue
        if head and head != r["last_analyzed_sha"] and request_analysis(r["id"]):
            log_event(r["id"], "poll", sha=head[:7])
            bg.add_task(run_analysis, r["id"], "poll", False)
            triggered.append(r["full_name"])
    return {"triggered": triggered}


# ------------------------------------------------------------------ i18n
class TranslateReq(BaseModel):
    entries: dict[str, str]


MAX_I18N_ENTRIES = 600
MAX_I18N_CHARS = 60000
I18N_CHUNK = 60
PLACEHOLDER = re.compile(r"\{[a-zA-Z_]+\}")


@app.post("/api/i18n/{lang}")
def translate_ui(lang: str, body: TranslateReq):
    """英語の UI 文言を Gemini で指定言語に翻訳する. (言語, 原文ハッシュ) 単位で Turso にキャッシュ."""
    if not re.match(LANG_PATTERN, lang):
        raise HTTPException(400, "invalid_language")
    entries = body.entries
    if len(entries) > MAX_I18N_ENTRIES or sum(len(k) + len(v) for k, v in entries.items()) > MAX_I18N_CHARS:
        raise HTTPException(413, "too_many_entries")
    digest = hashlib.sha256(json.dumps(entries, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:32]
    cached = db.query_one("SELECT entries_json FROM translations WHERE lang=? AND hash=?", (lang, digest))
    if cached:
        return {"lang": lang, "entries": json.loads(cached["entries_json"]), "cached": True}
    if not settings.gemini_available:
        return {"lang": lang, "entries": entries, "fallback": True}

    # 1 回で全件訳すと遅いので分割して並列に翻訳する
    items = list(entries.items())
    chunks = [dict(items[i:i + I18N_CHUNK]) for i in range(0, len(items), I18N_CHUNK)]

    def translate_chunk(chunk: dict[str, str]) -> dict[str, str]:
        r = llm.generate_json("You are a professional software localizer.", prompts.translate_prompt(lang, chunk),
                              TranslationResult, temperature=0.1)
        return {i.key: i.text for i in r.items}

    got: dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=6) as ex:
        for part in ex.map(translate_chunk, chunks):
            got.update(part)
    out: dict[str, str] = {}
    for k, src in entries.items():
        t = (got.get(k) or "").strip()
        # 欠落やプレースホルダ崩れは英語にフォールバック
        out[k] = t if t and sorted(PLACEHOLDER.findall(t)) == sorted(PLACEHOLDER.findall(src)) else src
    db.execute("INSERT OR REPLACE INTO translations (lang, hash, entries_json, created_at) VALUES (?,?,?,?)",
               (lang, digest, json.dumps(out, ensure_ascii=False), now_iso()))
    return {"lang": lang, "entries": out, "cached": False}
