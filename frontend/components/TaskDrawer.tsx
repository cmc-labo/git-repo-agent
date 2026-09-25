"use client";

import { useState } from "react";
import { Milestone, Task } from "@/lib/api";
import { MessageKey, useI18n } from "@/lib/i18n";
import { errorText } from "@/lib/errors";
import { CATEGORIES } from "./Priority";
import { Score } from "./StatusBadge";

const STATUSES = ["todo", "in_progress", "done", "dropped"] as const;

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
  const { t, fmtDate } = useI18n();
  const [d, setD] = useState<TaskDraft>(
    task ?? { title: "", description: "", category: "feature", urgency: 3, importance: 3, effort_days: 1, milestone_id: milestones[0]?.id ?? null },
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof TaskDraft>(k: K, v: TaskDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const deps = (task?.depends_on ?? []).map((id) => allTasks.find((x) => x.id === id)?.title).filter(Boolean);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await onSave(d);
      onClose();
    } catch (e) {
      setErr(errorText(e, t));
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
            <span className="tag">{task ? (task.source === "agent" ? t("td.agent") : t("td.user")) : t("td.new")}</span>
          </div>
          <button className="btn sm" onClick={onClose} aria-label={t("common.close")}>✕</button>
        </div>

        <div className="stack">
          <div>
            <label className="field">{t("td.title")}</label>
            <input value={d.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label className="field">{t("td.description")}</label>
            <textarea rows={4} value={d.description ?? ""} onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="grid cols-3" style={{ gap: 10 }}>
            <div><label className="field">{t("td.urgency")}</label>{num("urgency")}</div>
            <div><label className="field">{t("td.importance")}</label>{num("importance")}</div>
            <div>
              <label className="field">{t("td.effort")}</label>
              <input type="number" min={0.5} step={0.5} value={d.effort_days ?? 1} onChange={(e) => set("effort_days", Number(e.target.value))} />
            </div>
          </div>
          <div className="grid cols-3" style={{ gap: 10 }}>
            <div>
              <label className="field">{t("td.status")}</label>
              <select value={d.status ?? "todo"} onChange={(e) => set("status", e.target.value as Task["status"])} disabled={!task}>
                {STATUSES.map((k) => <option key={k} value={k}>{t(`status.${k}`)}</option>)}
              </select>
            </div>
            <div>
              <label className="field">{t("td.category")}</label>
              <select value={d.category ?? "feature"} onChange={(e) => set("category", e.target.value)} disabled={!!task}>
                {CATEGORIES.map((k) => <option key={k} value={k}>{t(`cat.${k}` as MessageKey)}</option>)}
              </select>
            </div>
            <div>
              <label className="field">{t("td.milestone")}</label>
              <select value={d.milestone_id ?? ""} onChange={(e) => set("milestone_id", e.target.value || null)}>
                <option value="">{t("rm.uncategorized")}</option>
                {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </div>
          </div>
        </div>

        {task && (
          <div className="card" style={{ marginTop: 16, background: "var(--green-light)", borderColor: "var(--green-mid)" }}>
            <div className="small" style={{ fontWeight: 700, marginBottom: 4 }}>{t("td.rationale")}</div>
            <div className="small">{task.rationale || "-"}</div>
            {task.evidence && (
              <>
                <div className="small" style={{ fontWeight: 700, margin: "10px 0 4px" }}>{t("td.latest")}</div>
                <div className="small">{task.evidence}</div>
              </>
            )}
            {!!deps.length && (
              <>
                <div className="small" style={{ fontWeight: 700, margin: "10px 0 4px" }}>{t("td.deps")}</div>
                <ul className="plain small">{deps.map((x, i) => <li key={i}>{x}</li>)}</ul>
              </>
            )}
          </div>
        )}
        {task && (
          <div className="small faint" style={{ marginTop: 10 }}>
            {t("td.meta", { created: fmtDate(task.created_at), started: fmtDate(task.started_at), completed: fmtDate(task.completed_at) })}
            {task.status_locked && t("td.locked")}
          </div>
        )}

        {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}
        <div className="row" style={{ marginTop: 18, justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn primary" onClick={save} disabled={saving || !d.title.trim()}>
            {saving && <span className="spinner" />} {t("common.save")}
          </button>
        </div>
      </aside>
    </>
  );
}
