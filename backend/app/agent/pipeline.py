"""エージェントの分析パイプライン.

  GitHub 収集 → ① リポジトリ理解 → ② 競合分析 (Search Grounding + GitHub 検索)
             → ③ 計画 (初回: タスク/マイルストーン生成, 2回目以降: 差分からタスク状態・優先度を更新)
             → DB 反映 → 進捗スナップショット
"""
from __future__ import annotations

import json
import logging
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from .. import db
from ..config import settings
from ..github_client import GitHubClient, collect_context
from ..util import decrypt, new_id, now_iso, parse_iso
from . import demo, llm, prompts
from .schemas import CompetitorAnalysis, PlanResult, RepoInsight

log = logging.getLogger(__name__)

# 分析中は HEARTBEAT_SECONDS ごとに updated_at を更新する. STALE_MINUTES 更新がなければ
# インスタンス停止などで中断されたとみなし、再実行の対象にする.
HEARTBEAT_SECONDS = 60
STALE_MINUTES = 3


def compute_score(urgency: int, importance: int, effort_days: float) -> int:
    """緊急度×重要度 を主軸に、工数が大きいほど少し減点 (0-100)."""
    base = (importance * 0.55 + urgency * 0.45) / 5 * 100
    penalty = min(max(effort_days or 0, 0), 10) * 1.5
    return max(0, min(100, round(base - penalty)))


def log_event(repo_id: str, kind: str, key: str | None = None, **params) -> None:
    """アクティビティを記録. 文言は画面側で翻訳するため {"k": 翻訳キー, "p": パラメータ} を保存する."""
    message = json.dumps({"k": key or kind, "p": params}, ensure_ascii=False)
    db.execute("INSERT INTO events (repo_id, kind, message, created_at) VALUES (?,?,?,?)",
               (repo_id, kind, message, now_iso()))


def _stale_cutoff() -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=STALE_MINUTES)).replace(microsecond=0).isoformat()


@contextmanager
def _heartbeat(repo_id: str):
    stop = threading.Event()

    def beat():
        while not stop.wait(HEARTBEAT_SECONDS):
            try:
                db.execute("UPDATE repos SET updated_at=? WHERE id=?", (now_iso(), repo_id))
            except Exception:  # noqa: BLE001
                log.warning("heartbeat failed", exc_info=True)

    t = threading.Thread(target=beat, daemon=True)
    t.start()
    try:
        yield
    finally:
        stop.set()


def recover_stale() -> list[str]:
    """中断された分析 (heartbeat が途絶えたもの) を片付けて再実行枠を確保し、その repo id を返す."""
    claimed = []
    for r in db.query("SELECT id FROM repos WHERE status IN ('queued','analyzing') AND updated_at < ?",
                      (_stale_cutoff(),)):
        if request_analysis(r["id"]):  # 複数インスタンスでも 1 つだけが確保できる
            db.execute("UPDATE analyses SET status='error', error='interrupted', finished_at=? "
                       "WHERE repo_id=? AND status='running'", (now_iso(), r["id"]))
            log_event(r["id"], "error", "analysis_interrupted")
            claimed.append(r["id"])
    return claimed


def request_analysis(repo_id: str) -> bool:
    """分析枠を確保する. 実行中なら pending フラグを立てて False (実行後に1回だけ再実行される)."""
    stale = _stale_cutoff()
    n = db.execute(
        "UPDATE repos SET status='queued', pending_reanalysis=0, updated_at=? "
        "WHERE id=? AND (status NOT IN ('queued','analyzing') OR updated_at < ?)",
        (now_iso(), repo_id, stale),
    )
    if n == 0:
        db.execute("UPDATE repos SET pending_reanalysis=1 WHERE id=?", (repo_id,))
        return False
    return True


def run_analysis(repo_id: str, trigger: str, force_competitors: bool = False) -> None:
    """request_analysis で枠を確保した後にバックグラウンドで呼ぶ."""
    while True:
        try:
            with _heartbeat(repo_id):
                _run_once(repo_id, trigger, force_competitors)
        except Exception as e:  # noqa: BLE001
            log.exception("analysis failed")
            db.execute("UPDATE repos SET error=?, updated_at=? WHERE id=?", (str(e)[:1000], now_iso(), repo_id))
            db.execute("UPDATE analyses SET status='error', error=?, finished_at=? WHERE repo_id=? AND status='running'",
                       (str(e)[:1000], now_iso(), repo_id))
            log_event(repo_id, "error", "analysis_failed", error=str(e)[:300])
        # 実行中に更新が来ていたらもう一度 (pending を消費して queued に戻す)
        db.execute(
            "UPDATE repos SET status = CASE WHEN pending_reanalysis=1 THEN 'queued' "
            "ELSE (CASE WHEN error IS NULL THEN 'idle' ELSE 'error' END) END, "
            "pending_reanalysis=0, updated_at=? WHERE id=?",
            (now_iso(), repo_id),
        )
        r = db.query_one("SELECT status FROM repos WHERE id=?", (repo_id,))
        if not r or r["status"] != "queued":
            return
        trigger, force_competitors = "pending", False


def _run_once(repo_id: str, trigger: str, force_competitors: bool) -> None:
    repo = db.query_one("SELECT * FROM repos WHERE id=?", (repo_id,))
    if not repo:
        return
    db.execute("UPDATE repos SET status='analyzing', error=NULL, updated_at=? WHERE id=?", (now_iso(), repo_id))

    token = decrypt(repo["token_enc"]) or settings.github_token or None
    gh = GitHubClient(token)
    owner, name = repo["owner"], repo["name"]
    meta = gh.repo(owner, name)
    branch = meta.get("default_branch") or "main"
    head = gh.head_sha(owner, name, branch)
    base = repo["last_analyzed_sha"]
    db.execute(
        "UPDATE repos SET description=?, html_url=?, is_private=?, default_branch=? WHERE id=?",
        (meta.get("description"), meta.get("html_url"), int(meta.get("private", False)), branch, repo_id),
    )

    analysis_id = new_id("an")
    started = now_iso()
    db.execute(
        "INSERT INTO analyses (id, repo_id, trigger, head_sha, base_sha, status, started_at) VALUES (?,?,?,?,?,?,?)",
        (analysis_id, repo_id, trigger, head, base, "running", started),
    )
    log_event(repo_id, "analysis_started", trigger=trigger, sha=head[:7] if head else "-")

    use_llm = settings.gemini_available
    lang = repo.get("language") or "ja"
    system = prompts.system(lang)
    ctx = collect_context(gh, owner, name, meta, head, base)

    # ① リポジトリ理解
    if use_llm:
        insight = llm.generate_json(system, prompts.insight_prompt(ctx), RepoInsight)
    else:
        insight = demo.insight(ctx)
    insight_d = insight.model_dump()

    # ② 競合分析 (初回・期限切れ・明示指定のときのみ。それ以外は前回結果を引き継ぐ)
    competitors_d = _previous_competitors(repo_id)
    refreshed_at = parse_iso(repo["competitors_updated_at"])
    need_comp = (
        force_competitors or competitors_d is None or refreshed_at is None
        or datetime.now(timezone.utc) - refreshed_at > timedelta(days=settings.competitor_refresh_days)
    )
    if need_comp:
        try:
            competitors_d = _analyze_competitors(gh, ctx, insight_d, use_llm, system)
            db.execute("UPDATE repos SET competitors_updated_at=? WHERE id=?", (now_iso(), repo_id))
            log_event(repo_id, "competitors", n=len(competitors_d["competitors"]))
        except Exception as e:  # noqa: BLE001  競合分析の失敗で全体を止めない
            log.exception("competitor analysis failed")
            log_event(repo_id, "error", "competitors_failed", error=str(e)[:300])

    # ③ 計画
    milestones = db.query("SELECT id, title, goal FROM milestones WHERE repo_id=? ORDER BY order_index", (repo_id,))
    tasks = db.query(
        "SELECT id, title, category, status, urgency, importance, effort_days, milestone_id, source "
        "FROM tasks WHERE repo_id=? AND status != 'dropped'", (repo_id,))
    is_initial = not tasks
    if use_llm:
        plan = llm.generate_json(
            system,
            prompts.plan_prompt(ctx, insight_d, competitors_d, milestones, tasks, is_initial),
            PlanResult,
        )
    else:
        plan = demo.plan(ctx, milestones, tasks, is_initial)
    applied = _apply_plan(repo_id, analysis_id, plan)

    counts = db.query_one(
        "SELECT COUNT(*) AS total, "
        "SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done, "
        "SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) AS ip "
        "FROM tasks WHERE repo_id=? AND status != 'dropped'", (repo_id,)) or {}
    changes = {
        "summary": plan.change_summary,
        "progress_assessment": plan.progress_assessment,
        "next_actions": plan.next_actions,
        "applied": applied,
        "diff_commits": len((ctx.get("diff") or {}).get("commits") or []),
        "demo": not use_llm,
    }
    db.execute(
        "UPDATE analyses SET status='done', insight_json=?, competitors_json=?, changes_json=?, "
        "tasks_total=?, tasks_done=?, tasks_in_progress=?, finished_at=? WHERE id=?",
        (json.dumps(insight_d, ensure_ascii=False),
         json.dumps(competitors_d, ensure_ascii=False) if competitors_d else None,
         json.dumps(changes, ensure_ascii=False),
         counts.get("total") or 0, counts.get("done") or 0, counts.get("ip") or 0, now_iso(), analysis_id),
    )
    db.execute("UPDATE repos SET last_analyzed_sha=?, last_analyzed_at=? WHERE id=?", (head, now_iso(), repo_id))
    n_new = sum(1 for a in applied if a["type"] == "created")
    n_upd = len(applied) - n_new
    log_event(repo_id, "analysis_completed", created=n_new, updated=n_upd, summary=plan.change_summary)


def _previous_competitors(repo_id: str) -> dict | None:
    r = db.query_one(
        "SELECT competitors_json FROM analyses WHERE repo_id=? AND competitors_json IS NOT NULL "
        "ORDER BY started_at DESC LIMIT 1", (repo_id,))
    return json.loads(r["competitors_json"]) if r else None


def _analyze_competitors(gh: GitHubClient, ctx: dict, insight: dict, use_llm: bool, system: str) -> dict:
    gh_repos = []
    q = insight.get("github_search_query") or ""
    if q:
        try:
            gh_repos = [r for r in gh.search_repos(q, 8) if r["full_name"].lower() != ctx["full_name"].lower()]
        except Exception:  # noqa: BLE001
            log.warning("github search failed", exc_info=True)
    if not use_llm:
        result = demo.competitors(gh_repos).model_dump()
        result.update(sources=[], github_similar=gh_repos)
        return result
    research, sources = llm.grounded_search(system + "\n\n" + prompts.competitor_search_prompt(insight, ctx))
    structured = llm.generate_json(
        system, prompts.competitor_structure_prompt(insight, research, gh_repos, sources), CompetitorAnalysis)
    result = structured.model_dump()
    result.update(sources=sources, github_similar=gh_repos)
    return result


def _apply_plan(repo_id: str, analysis_id: str, plan: PlanResult) -> list[dict]:
    ts = now_iso()
    applied: list[dict] = []

    # --- マイルストーン ---
    existing_ms = {m["id"] for m in db.query("SELECT id FROM milestones WHERE repo_id=?", (repo_id,))}
    key_to_id: dict[str, str] = {}
    for i, m in enumerate(plan.milestones):
        if m.key in existing_ms:
            key_to_id[m.key] = m.key
            db.execute("UPDATE milestones SET title=?, goal=?, order_index=? WHERE id=?", (m.title, m.goal, i, m.key))
        else:
            mid = new_id("ms")
            key_to_id[m.key] = mid
            db.execute("INSERT INTO milestones (id, repo_id, title, goal, order_index, created_at) VALUES (?,?,?,?,?,?)",
                       (mid, repo_id, m.title, m.goal, i, ts))
    fallback_ms = next(iter(key_to_id.values()), None) or next(iter(existing_ms), None)

    def ms_id(key: str | None) -> str | None:
        if not key:
            return None
        return key_to_id.get(key) or (key if key in existing_ms else fallback_ms)

    # --- 既存タスクの更新 ---
    tasks = {t["id"]: t for t in db.query("SELECT * FROM tasks WHERE repo_id=?", (repo_id,))}
    for u in plan.task_updates:
        t = tasks.get(u.task_id)
        if not t:
            continue
        sets: dict = {}
        if u.status and u.status != t["status"] and not t["status_locked"]:
            sets["status"] = u.status
            if u.status == "in_progress" and not t["started_at"]:
                sets["started_at"] = ts
            if u.status == "done":
                sets["completed_at"] = ts
                sets.setdefault("started_at", t["started_at"] or ts)
        for f in ("urgency", "importance", "effort_days"):
            v = getattr(u, f)
            if v is not None and v != t[f]:
                sets[f] = v
        if u.milestone_key and ms_id(u.milestone_key) and ms_id(u.milestone_key) != t["milestone_id"]:
            sets["milestone_id"] = ms_id(u.milestone_key)
        if not sets:
            continue
        merged = {**t, **sets}
        sets["score"] = compute_score(merged["urgency"], merged["importance"], merged["effort_days"])
        sets["evidence"] = u.reason
        sets["updated_analysis_id"] = analysis_id
        sets["updated_at"] = ts
        cols = ", ".join(f"{k}=?" for k in sets)
        db.execute(f"UPDATE tasks SET {cols} WHERE id=?", (*sets.values(), t["id"]))
        applied.append({
            "type": "status" if "status" in sets else "rescored",
            "task_id": t["id"], "title": t["title"],
            "from": t["status"], "to": sets.get("status", t["status"]),
            "reason": u.reason,
        })
        if sets.get("status") == "done":
            log_event(repo_id, "task_completed", title=t["title"], reason=u.reason)

    # --- 新規タスク ---
    titles = {t["title"].strip().lower(): tid for tid, t in tasks.items() if t["status"] != "dropped"}
    created: list[tuple[str, list[str]]] = []
    for nt in plan.new_tasks:
        if nt.title.strip().lower() in titles:
            continue
        tid = new_id("tk")
        db.execute(
            "INSERT INTO tasks (id, repo_id, milestone_id, title, description, category, urgency, importance, "
            "effort_days, score, status, rationale, source, created_analysis_id, updated_analysis_id, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (tid, repo_id, ms_id(nt.milestone_key) or fallback_ms, nt.title, nt.description, nt.category,
             nt.urgency, nt.importance, nt.effort_days, compute_score(nt.urgency, nt.importance, nt.effort_days),
             "todo", nt.rationale, "agent", analysis_id, analysis_id, ts, ts),
        )
        titles[nt.title.strip().lower()] = tid
        created.append((tid, nt.depends_on_titles))
        applied.append({"type": "created", "task_id": tid, "title": nt.title, "from": None, "to": "todo",
                        "reason": nt.rationale})
    for tid, deps in created:
        dep_ids = [titles[d.strip().lower()] for d in deps if d.strip().lower() in titles]
        if dep_ids:
            db.execute("UPDATE tasks SET depends_on=? WHERE id=?", (json.dumps(dep_ids), tid))
    return applied
