"""Gemini の構造化出力 (response_schema) に使うモデル.

Gemini の schema は dict 型を扱えないため、すべて list / プリミティブで表現する。
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------- Step 1: リポジトリ理解 ----------
class RepoInsight(BaseModel):
    summary: str = Field(description="プロダクトの概要 (日本語, 2-3文)")
    product_category: str = Field(description="プロダクトのカテゴリ (例: タスク管理SaaS, CLIツール)")
    target_users: str
    tech_stack: list[str]
    implemented_features: list[str] = Field(description="実装済みと判断できる主要機能")
    development_phase: Literal["idea", "prototype", "mvp", "beta", "production"]
    health_notes: list[str] = Field(description="テスト/CI/ドキュメント等の開発体制に関する所見")
    search_keywords: list[str] = Field(description="競合を Web 検索するための英語/日本語キーワード (3-5個)")
    github_search_query: str = Field(description="GitHub リポジトリ検索用のクエリ (英語, 2-4語)")


# ---------- Step 2: 競合分析 ----------
class Competitor(BaseModel):
    name: str
    kind: Literal["oss_repository", "web_service", "mobile_app", "library", "other"]
    url: str
    description: str
    strengths: list[str]
    weaknesses: list[str]
    feature_gap: list[str] = Field(description="競合にあって自リポジトリにない機能")
    threat_level: int = Field(ge=1, le=5, description="脅威度 1-5")


class CompetitorAnalysis(BaseModel):
    market_overview: str
    competitors: list[Competitor]
    differentiation: list[str] = Field(description="自プロダクトが取るべき差別化ポイント")
    tech_trends: list[str] = Field(description="この領域の技術トレンド・採用すべき技術要素")


# ---------- Step 3: 計画 (初回/差分更新共通) ----------
class MilestonePlan(BaseModel):
    key: str = Field(description="既存マイルストーンは既存ID, 新規は 'new-' で始まる任意のキー")
    title: str
    goal: str


class NewTask(BaseModel):
    title: str
    description: str
    category: Literal["feature", "bug", "refactor", "test", "infra", "docs", "security", "ux", "research"]
    urgency: int = Field(ge=1, le=5, description="緊急度 1-5")
    importance: int = Field(ge=1, le=5, description="重要度 1-5")
    effort_days: float = Field(description="想定工数(人日)")
    milestone_key: str
    rationale: str = Field(description="この優先度にした理由 (競合・開発状況を根拠に)")
    depends_on_titles: list[str] = Field(default_factory=list, description="依存する他タスクのタイトル")


class TaskUpdate(BaseModel):
    task_id: str
    status: Literal["todo", "in_progress", "done", "dropped"] | None = None
    urgency: int | None = Field(default=None, ge=1, le=5)
    importance: int | None = Field(default=None, ge=1, le=5)
    effort_days: float | None = None
    milestone_key: str | None = None
    reason: str = Field(description="変更理由 (完了判定ならコミット/PR等の根拠)")


class PlanResult(BaseModel):
    change_summary: str = Field(description="今回の分析で何が変わったか (日本語, 2-4文)")
    progress_assessment: str = Field(description="現在の開発状況の評価")
    next_actions: list[str] = Field(description="今すぐやるべきこと トップ3")
    milestones: list[MilestonePlan]
    task_updates: list[TaskUpdate]
    new_tasks: list[NewTask]
