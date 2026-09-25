"""Gemini の認証情報がないとき用の固定出力 (UI 確認・オフラインデモ用)."""
from __future__ import annotations

from .schemas import (Competitor, CompetitorAnalysis, MilestonePlan, NewTask, PlanResult, RepoInsight,
                      TaskUpdate)


def insight(ctx: dict) -> RepoInsight:
    langs = list(ctx.get("languages", {}).keys())[:5] or ["unknown"]
    return RepoInsight(
        summary=f"[DEMO] {ctx['full_name']} は {ctx['description'] or '説明未設定'} を提供するプロジェクトです。",
        product_category="開発者向けツール",
        target_users="個人開発者・小規模チーム",
        tech_stack=langs,
        implemented_features=["基本機能", "README"],
        development_phase="prototype",
        health_notes=["テストが少ない可能性", "CI 設定の確認が必要"],
        search_keywords=[ctx["full_name"].split("/")[1], "developer tool"],
        github_search_query=ctx["full_name"].split("/")[1],
    )


def competitors(gh_repos: list[dict]) -> CompetitorAnalysis:
    comps = [
        Competitor(
            name=r["full_name"], kind="oss_repository", url=r["html_url"],
            description=r["description"] or "(説明なし)",
            strengths=[f"{r['stars']} stars のコミュニティ"], weaknesses=["[DEMO] 未分析"],
            feature_gap=["[DEMO] 未分析"], threat_level=min(5, 1 + r["stars"] // 2000),
        )
        for r in gh_repos[:4]
    ]
    comps.append(Competitor(
        name="Example SaaS", kind="web_service", url="https://example.com",
        description="[DEMO] サンプルの Web サービス競合", strengths=["UI が洗練"], weaknesses=["有料"],
        feature_gap=["チーム共有"], threat_level=3,
    ))
    return CompetitorAnalysis(
        market_overview="[DEMO] Gemini 未設定のためサンプル出力です。GEMINI_API_KEY か Vertex AI を設定してください。",
        competitors=comps, differentiation=["AI による自動化", "日本語対応"], tech_trends=["LLM エージェント"],
    )


_SEED = [
    ("CI でテストを自動実行する", "test", 4, 4, 1, "new-1"),
    ("README にセットアップ手順を追記", "docs", 3, 3, 0.5, "new-1"),
    ("エラーハンドリングを統一する", "refactor", 3, 4, 2, "new-1"),
    ("競合にある共有機能を実装", "feature", 3, 5, 5, "new-2"),
    ("オンボーディング UI を改善", "ux", 2, 4, 3, "new-2"),
    ("依存パッケージの脆弱性チェック", "security", 4, 3, 1, "new-1"),
    ("パフォーマンス計測を導入", "infra", 2, 3, 2, "new-3"),
    ("利用状況分析のためのログ設計", "research", 2, 2, 2, "new-3"),
]


def plan(ctx: dict, milestones: list[dict], tasks: list[dict], is_initial: bool) -> PlanResult:
    if is_initial:
        return PlanResult(
            change_summary="[DEMO] 初回分析を実施し、マイルストーンとタスクを作成しました。",
            progress_assessment="[DEMO] プロトタイプ段階です。",
            next_actions=[s[0] for s in _SEED[:3]],
            milestones=[
                MilestonePlan(key="new-1", title="基盤整備", goal="品質と開発体制を整える"),
                MilestonePlan(key="new-2", title="差別化機能", goal="競合に対する優位性を作る"),
                MilestonePlan(key="new-3", title="運用・計測", goal="改善サイクルを回せるようにする"),
            ],
            task_updates=[],
            new_tasks=[
                NewTask(title=t, description=f"[DEMO] {t}", category=c, urgency=u, importance=i,
                        effort_days=e, milestone_key=m, rationale="[DEMO] サンプル")
                for t, c, u, i, e, m in _SEED
            ],
        )
    diff = ctx.get("diff") or {}
    commits = diff.get("commits") or []
    updates: list[TaskUpdate] = []
    open_tasks = [t for t in tasks if t["status"] in ("todo", "in_progress")]
    if commits and open_tasks:
        t = open_tasks[0]
        nxt = "done" if t["status"] == "in_progress" else "in_progress"
        updates.append(TaskUpdate(task_id=t["id"], status=nxt, reason=f"[DEMO] コミット {commits[-1]['sha']} を検知"))
    return PlanResult(
        change_summary=f"[DEMO] {len(commits)} 件の新しいコミットを検知し、タスクを更新しました。",
        progress_assessment="[DEMO] 順調に進行中です。",
        next_actions=[t["title"] for t in open_tasks[:3]],
        milestones=[MilestonePlan(key=m["id"], title=m["title"], goal=m.get("goal") or "") for m in milestones],
        task_updates=updates,
        new_tasks=[],
    )
