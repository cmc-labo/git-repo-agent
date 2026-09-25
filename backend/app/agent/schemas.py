"""Gemini の構造化出力 (response_schema) に使うモデル.

Gemini の schema は dict 型を扱えないため、すべて list / プリミティブで表現する。
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---------- Step 1: リポジトリ理解 ----------
class RepoInsight(BaseModel):
    summary: str = Field(description="Product summary (2-3 sentences)")
    product_category: str = Field(description="Product category (e.g. task-management SaaS, CLI tool)")
    target_users: str
    tech_stack: list[str]
    implemented_features: list[str] = Field(description="Main features that are evidently implemented")
    development_phase: Literal["idea", "prototype", "mvp", "beta", "production"]
    health_notes: list[str] = Field(description="Observations on engineering health: tests, CI, docs, etc.")
    search_keywords: list[str] = Field(description="3-5 keywords for web-searching competitors")
    github_search_query: str = Field(description="GitHub repository search query (English, 2-4 words)")


# ---------- Step 2: 競合分析 ----------
class Competitor(BaseModel):
    name: str
    kind: Literal["oss_repository", "web_service", "mobile_app", "library", "other"]
    url: str
    description: str
    strengths: list[str]
    weaknesses: list[str]
    feature_gap: list[str] = Field(description="Features the competitor has that this product lacks")
    threat_level: int = Field(ge=1, le=5, description="Threat level 1-5")


class CompetitorAnalysis(BaseModel):
    market_overview: str
    competitors: list[Competitor]
    differentiation: list[str] = Field(description="Differentiation points this product should pursue")
    tech_trends: list[str] = Field(description="Technology trends / technologies worth adopting in this space")


# ---------- Step 3: 計画 (初回/差分更新共通) ----------
class MilestonePlan(BaseModel):
    key: str = Field(description="Existing id for existing milestones; any key starting with 'new-' for new ones")
    title: str
    goal: str


class NewTask(BaseModel):
    title: str
    description: str
    category: Literal["feature", "bug", "refactor", "test", "infra", "docs", "security", "ux", "research"]
    urgency: int = Field(ge=1, le=5, description="Urgency 1-5")
    importance: int = Field(ge=1, le=5, description="Importance 1-5")
    effort_days: float = Field(description="Estimated effort in person-days")
    milestone_key: str
    rationale: str = Field(description="Why this priority (grounded in competitors and development status)")
    depends_on_titles: list[str] = Field(default_factory=list, description="Titles of tasks this depends on")


class TaskUpdate(BaseModel):
    task_id: str
    status: Literal["todo", "in_progress", "done", "dropped"] | None = None
    urgency: int | None = Field(default=None, ge=1, le=5)
    importance: int | None = Field(default=None, ge=1, le=5)
    effort_days: float | None = None
    milestone_key: str | None = None
    reason: str = Field(description="Reason for the change (for completion: the evidencing commit/PR)")


class PlanResult(BaseModel):
    change_summary: str = Field(description="What changed in this analysis (2-4 sentences)")
    progress_assessment: str = Field(description="Assessment of the current development status")
    next_actions: list[str] = Field(description="Top 3 things to do right now")
    milestones: list[MilestonePlan]
    task_updates: list[TaskUpdate]
    new_tasks: list[NewTask]


# ---------- UI 翻訳 ----------
class TranslationItem(BaseModel):
    key: str
    text: str


class TranslationResult(BaseModel):
    items: list[TranslationItem]
