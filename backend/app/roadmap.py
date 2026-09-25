"""タスクとマイルストーンから WBS / ガント用のスケジュールを算出する.

マイルストーン順 → 依存関係 → スコア順 で並べ、ROADMAP_LANES 人の並列レーンに貪欲に割り当てる (土日を除く)。
"""
from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta

from .util import parse_iso


def _add_workdays(d: date, n: int) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    added = 0
    while added < n:
        d += timedelta(days=1)
        if d.weekday() < 5:
            added += 1
    return d


def _next_workday(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def build_roadmap(milestones: list[dict], tasks: list[dict], lanes: int, today: date | None = None) -> dict:
    today = _next_workday(today or date.today())
    ms_order = {m["id"]: i for i, m in enumerate(milestones)}
    live = [t for t in tasks if t["status"] != "dropped"]
    by_id = {t["id"]: t for t in live}
    sched: dict[str, dict] = {}

    # 完了タスクは実績で表示
    for t in live:
        if t["status"] == "done":
            end = (parse_iso(t.get("completed_at")) or datetime.now()).date()
            start = (parse_iso(t.get("started_at")) or parse_iso(t.get("created_at")) or datetime.now()).date()
            sched[t["id"]] = {"start": min(start, end), "end": end, "lane": None}

    remaining = sorted(
        (t for t in live if t["status"] != "done"),
        key=lambda t: (ms_order.get(t.get("milestone_id"), 999), t["status"] != "in_progress", -(t.get("score") or 0)),
    )
    lane_free = [today] * max(1, lanes)
    pending = list(remaining)
    while pending:
        for idx, t in enumerate(pending):
            deps = [d for d in json.loads(t.get("depends_on") or "[]") if d in by_id]
            if all(d in sched for d in deps):
                break
        else:
            idx = 0  # 循環依存などは無視して先頭から
        t = pending.pop(idx)
        deps = [d for d in json.loads(t.get("depends_on") or "[]") if d in sched]
        dep_end = max((_add_workdays(sched[d]["end"], 1) for d in deps), default=today)
        lane = min(range(len(lane_free)), key=lambda i: lane_free[i])
        start = _next_workday(max(lane_free[lane], dep_end))
        days = max(1, math.ceil(float(t.get("effort_days") or 1)))
        end = _add_workdays(start, days - 1)
        sched[t["id"]] = {"start": start, "end": end, "lane": lane}
        lane_free[lane] = _add_workdays(end, 1)

    out_ms = []
    all_dates: list[date] = []
    groups = milestones + [{"id": "__none__", "title": "未分類", "goal": ""}]
    for m in groups:
        if m["id"] == "__none__":
            mts = [t for t in live if t.get("milestone_id") not in ms_order]
        else:
            mts = [t for t in live if t.get("milestone_id") == m["id"]]
        if not mts:
            continue
        items = []
        for t in sorted(mts, key=lambda t: sched[t["id"]]["start"]):
            s = sched[t["id"]]
            all_dates += [s["start"], s["end"]]
            items.append({**_task_public(t), "start": s["start"].isoformat(), "end": s["end"].isoformat(),
                          "lane": s["lane"]})
        effort_total = sum(float(t.get("effort_days") or 1) for t in mts)
        effort_done = sum(float(t.get("effort_days") or 1) for t in mts if t["status"] == "done")
        out_ms.append({
            "id": m["id"], "title": m["title"], "goal": m.get("goal"),
            "start": min(sched[t["id"]]["start"] for t in mts).isoformat(),
            "end": max(sched[t["id"]]["end"] for t in mts).isoformat(),
            "progress": round(effort_done / effort_total * 100) if effort_total else 0,
            "tasks": items,
        })
    return {
        "start": min(all_dates).isoformat() if all_dates else today.isoformat(),
        "end": max(all_dates).isoformat() if all_dates else today.isoformat(),
        "today": date.today().isoformat(),
        "lanes": lanes,
        "milestones": out_ms,
    }


def _task_public(t: dict) -> dict:
    return {k: t.get(k) for k in ("id", "title", "status", "category", "score", "effort_days", "urgency", "importance")}
