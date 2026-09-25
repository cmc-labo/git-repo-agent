"""DB アクセス層.

TURSO_DATABASE_URL が設定されていれば Turso の HTTP API (Hrana over HTTP, /v2/pipeline) を使い、
なければローカル SQLite を使う。どちらも同じ SQL (SQLite 方言) で動く。
ネイティブ拡張不要なので Cloud Run のコンテナでもそのまま動く。
"""
from __future__ import annotations

import sqlite3
import threading
from typing import Any, Iterable

import httpx

from .config import settings

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS repos (
        id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        name TEXT NOT NULL,
        full_name TEXT NOT NULL UNIQUE,
        description TEXT,
        html_url TEXT,
        is_private INTEGER DEFAULT 0,
        default_branch TEXT,
        token_enc TEXT,
        webhook_secret TEXT NOT NULL,
        last_analyzed_sha TEXT,
        last_analyzed_at TEXT,
        competitors_updated_at TEXT,
        status TEXT DEFAULT 'idle',
        pending_reanalysis INTEGER DEFAULT 0,
        error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        trigger TEXT NOT NULL,
        head_sha TEXT,
        base_sha TEXT,
        status TEXT NOT NULL,
        insight_json TEXT,
        competitors_json TEXT,
        changes_json TEXT,
        tasks_total INTEGER DEFAULT 0,
        tasks_done INTEGER DEFAULT 0,
        tasks_in_progress INTEGER DEFAULT 0,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
    )""",
    "CREATE INDEX IF NOT EXISTS idx_analyses_repo ON analyses(repo_id, started_at)",
    """CREATE TABLE IF NOT EXISTS milestones (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        title TEXT NOT NULL,
        goal TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        repo_id TEXT NOT NULL,
        milestone_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT,
        urgency INTEGER DEFAULT 3,
        importance INTEGER DEFAULT 3,
        effort_days REAL DEFAULT 1,
        score INTEGER DEFAULT 0,
        status TEXT DEFAULT 'todo',
        rationale TEXT,
        evidence TEXT,
        depends_on TEXT,
        source TEXT DEFAULT 'agent',
        status_locked INTEGER DEFAULT 0,
        created_analysis_id TEXT,
        updated_analysis_id TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_tasks_repo ON tasks(repo_id)",
    """CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        message TEXT,
        created_at TEXT NOT NULL
    )""",
    "CREATE INDEX IF NOT EXISTS idx_events_repo ON events(repo_id, id)",
    """CREATE TABLE IF NOT EXISTS translations (
        lang TEXT NOT NULL,
        hash TEXT NOT NULL,
        entries_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (lang, hash)
    )""",
]

# 既存 DB に後から追加したカラム (SQLite は ADD COLUMN IF NOT EXISTS がないので失敗は無視する)
MIGRATIONS = [
    "ALTER TABLE repos ADD COLUMN language TEXT DEFAULT 'ja'",
]


class _SQLite:
    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()

    def execute(self, sql: str, params: Iterable[Any] = ()) -> tuple[list[dict], int]:
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            rows = [dict(r) for r in cur.fetchall()] if cur.description else []
            self._conn.commit()
            return rows, cur.rowcount


class _TursoHTTP:
    def __init__(self, url: str, token: str):
        if url.startswith("libsql://"):
            url = "https://" + url[len("libsql://"):]
        self._endpoint = url.rstrip("/") + "/v2/pipeline"
        self._client = httpx.Client(
            timeout=30,
            headers={"Authorization": f"Bearer {token}"} if token else {},
        )

    @staticmethod
    def _arg(v: Any) -> dict:
        if v is None:
            return {"type": "null"}
        if isinstance(v, bool):
            return {"type": "integer", "value": str(int(v))}
        if isinstance(v, int):
            return {"type": "integer", "value": str(v)}
        if isinstance(v, float):
            return {"type": "float", "value": v}
        return {"type": "text", "value": str(v)}

    @staticmethod
    def _val(cell: dict) -> Any:
        t = cell.get("type")
        if t == "null":
            return None
        if t == "integer":
            return int(cell["value"])
        if t == "float":
            return float(cell["value"])
        return cell.get("value")

    def execute(self, sql: str, params: Iterable[Any] = ()) -> tuple[list[dict], int]:
        body = {
            "requests": [
                {"type": "execute", "stmt": {"sql": sql, "args": [self._arg(p) for p in params]}},
                {"type": "close"},
            ]
        }
        r = self._client.post(self._endpoint, json=body)
        r.raise_for_status()
        res = r.json()["results"][0]
        if res.get("type") == "error":
            raise RuntimeError(f"Turso error: {res['error'].get('message')}")
        result = res["response"]["result"]
        cols = [c["name"] for c in result.get("cols", [])]
        rows = [{c: self._val(cell) for c, cell in zip(cols, row)} for row in result.get("rows", [])]
        return rows, int(result.get("affected_row_count", 0))


_db = None


def get_db():
    global _db
    if _db is None:
        if settings.turso_url:
            _db = _TursoHTTP(settings.turso_url, settings.turso_token)
        else:
            _db = _SQLite(settings.sqlite_path)
    return _db


def query(sql: str, params: Iterable[Any] = ()) -> list[dict]:
    return get_db().execute(sql, params)[0]


def query_one(sql: str, params: Iterable[Any] = ()) -> dict | None:
    rows = query(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Iterable[Any] = ()) -> int:
    """書き込み系. 影響行数を返す."""
    return get_db().execute(sql, params)[1]


def init_db() -> None:
    for stmt in SCHEMA:
        execute(stmt)
    for stmt in MIGRATIONS:
        try:
            execute(stmt)
        except Exception as e:  # noqa: BLE001
            if "duplicate column" not in str(e).lower():
                raise
