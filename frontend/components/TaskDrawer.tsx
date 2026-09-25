"use client";

import { useState } from "react";
import { CATEGORY_LABEL, fmtDate, Milestone, STATUS_LABEL, Task } from "@/lib/api";
import { Score } from "./StatusBadge";

export type TaskDraft = Partial<Task> & { title: string };

export default function TaskDrawer({
  task, milestones, allTasks, onClose, onSave,
}: {
  task: Task | null; // null = 新規作成
  milestones: Milestone[];
  allTasks: Task[];
  onClose: () => void;
  onSave: (draft: TaskDraft) => Promise<void>;
}) {
  const [d, setD] = useState<TaskDraft>(
    task ?? { title: "", description: "", category: "feature", urgency: 3, importance: 3, effort_days: 1, milestone_id: milestones[0]?.id ?? null },
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const deps = (task?.depends_on ?? []).map((id) => allTasks.find((t) => t.id === id)?.title).filter(Boolean);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await onSave(d);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const num = (k: "urgency" | "importance") => (
    <select value={d[k] ?? 3} onChange={(e) => set(k, Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <aside className="drawer">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="row">
            {task && <Score value={task.score} />}
            <span className="tag">{task ? (task.source === "agent" ? "🤖 エージェント提案" : "手動作成") : "新規タスク"}</span>
          </div>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>

        <div className="stack">
          <div>
            <label className="field">タイトル</label>
            <input value={d.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label className="field">説明</label>
            <textarea rows={4} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid cols-3" style={{ gap: 10 }}>
            <div><label className="field">緊急度</label>{num("urgency")}</div>
            <div><label className="field">重要度</label>{num("importance")}</div>
            <div>
              <label className="field">工数 (人日)</label>
              <input type="number" min={0.5} step={0.5} value={d.effort_days ?? 1} onChange={(e) => set("effort_days", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid cols-3" style={{ gap: 10 }}>
            <div>
              <label className="field">ステータス</label>
              <select value={d.status ?? "todo"} onChange={(e) => set("status", e.target.value as Task["status"])} disabled={!task}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="field">カテゴリ</label>
              <select value={d.category ?? "feature"} onChange={(e) => set("category", e.target.value)} disabled={!!task}>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="field">マイルストーン</label>
              <select value={d.milestone_id ?? ""} onChange={(e) => set("milestone_id", e.target.value || null)}>
                <option value="">未分類</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          </div>
        </div>

        {task && (
          <div className="card" style={{ marginTop: 16, background: "var(--green-light)", borderColor: "var(--green-mid)" }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>🤖 エージェントの判断根拠</div>
            <div className="small">{task.rationale || "-"}</div>
            {task.evidence && (
              <>
                <div className="small" style={{ fontWeight: 700, margin: "10px 0 4px" }}>最新の更新理由</div>
                <div className="small">{task.evidence}</div>
              </>
            )}
            {!!deps.length && (
              <>
                <div className="small" style={{ fontWeight: 700, margin: "10px 0 4px" }}>依存タスク</div>
                <ul className="plain small">{deps.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </>
            )}
          </div>
        )}
        {task && (
          <div className="small faint" style={{ marginTop: 10 }}>
            作成 {fmtDate(task.created_at)} · 着手 {fmtDate(task.started_at)} · 完了 {fmtDate(task.completed_at)}
            {task.status_locked && " · ステータスは手動管理中"}
          </div>
        )}

        {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>キャンセル</button>
          <button className="btn primary" onClick={save} disabled={saving || !d.title.trim()}>
            {saving && <span className="spinner" />} 保存
          </button>
        </div>
      </aside>
    </>
  );
}
