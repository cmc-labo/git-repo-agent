"use client";

import { useState } from "react";
import { Analysis, Progress, Status, Task } from "@/lib/api";
import { MessageKey, useI18n } from "@/lib/i18n";
import { Score } from "./StatusBadge";

const COLS: Status[] = ["todo", "in_progress", "done"];

function BurnUp({ history }: { history: Progress["history"] }) {
  const { t, fmtDate } = useI18n();
  if (history.length < 1) return <div className="muted small">{t("pg.burnupEmpty")}</div>;
  const W = 560, H = 180, P = 28;
  const max = Math.max(1, ...history.map((h) => h.tasks_total));
  const n = history.length;
  const px = (i: number) => P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const py = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (f: (h: Progress["history"][0]) => number) => history.map((h, i) => `${i ? "L" : "M"}${px(i)},${py(f(h))}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label={t("pg.burnup")}>
      {[0, 0.5, 1].map((r) => (
        <g key={r}>
          <line x1={P} x2={W - P} y1={py(max * r)} y2={py(max * r)} stroke="#e1e4e8" />
          <text x={4} y={py(max * r) + 4} fontSize="10" fill="#9aa1a8">{Math.round(max * r)}</text>
        </g>
      ))}
      <path d={line((h) => h.tasks_total)} fill="none" stroke="#9aa1a8" strokeWidth="2" strokeDasharray="4 3" />
      <path d={line((h) => h.tasks_done + h.tasks_in_progress)} fill="none" stroke="#4488c5" strokeWidth="1.5" opacity="0.6" />
      <path d={`${line((h) => h.tasks_done)} L${px(n - 1)},${H - P} L${px(0)},${H - P} Z`} fill="#2f9e6e" opacity="0.15" />
      <path d={line((h) => h.tasks_done)} fill="none" stroke="#2f9e6e" strokeWidth="2.5" />
      {history.map((h, i) => (
        <g key={i}>
          <circle cx={px(i)} cy={py(h.tasks_done)} r="3.5" fill="#2f9e6e">
            <title>{`${fmtDate(h.started_at)} (${t(`trigger.${h.trigger}` as MessageKey)})\n${t("pg.burnupPoint", { done: h.tasks_done, total: h.tasks_total })}`}</title>
          </circle>
        </g>
      ))}
      <text x={P} y={H - 8} fontSize="10" fill="#9aa1a8">{fmtDate(history[0].started_at, false)}</text>
      <text x={W - P} y={H - 8} fontSize="10" fill="#9aa1a8" textAnchor="end">{fmtDate(history[n - 1].started_at, false)}</text>
    </svg>
  );
}

export default function ProgressView({
  tasks, progress, analyses, onOpenTask, onMove,
}: {
  tasks: Task[];
  progress: Progress | null;
  analyses: Analysis[];
  onOpenTask: (t: Task) => void;
  onMove?: (t: Task, s: Status) => void;
}) {
  const [over, setOver] = useState<Status | null>(null);
  const { t, fmtDate } = useI18n();

  return (
    <>
      <div className="grid cols-2">
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">{t("pg.burnup")}</h2>
          <BurnUp history={progress?.history ?? []} />
          <div className="row small muted">
            <span style={{ color: "#2f9e6e" }}>{t("pg.legendDone")}</span>
            <span style={{ color: "#4488c5" }}>{t("pg.legendStarted")}</span>
            <span>{t("pg.legendAll")}</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">{t("pg.byCategory")}</h2>
          {Object.entries(progress?.by_category ?? {}).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <div className="row small" style={{ justifyContent: "space-between" }}>
                <span>{t(`cat.${k}` as MessageKey)}</span>
                <span className="muted">{v.done}/{v.total}</span>
              </div>
              <div className="progress"><div style={{ width: `${v.total ? (v.done / v.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t("pg.kanban")}</h2>
        {onMove && <p className="small muted" style={{ marginTop: -6 }}>{t("pg.kanbanDesc")}</p>}
        <div className="kanban">
          {COLS.map((s) => {
            const items = tasks.filter((x) => x.status === s).sort((a, b) => b.score - a.score);
            return (
              <div
                key={s}
                className={`col ${over === s ? "drag-over" : ""}`}
                onDragOver={(e) => { if (!onMove) return; e.preventDefault(); setOver(s); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const t = tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  if (t && t.status !== s) onMove?.(t, s);
                }}
              >
                <div className="col-head"><span className={`status ${s}`}>{t(`status.${s}`)}</span><span className="muted">{items.length}</span></div>
                {items.map((x) => (
                  <div
                    key={x.id}
                    className="kcard"
                    draggable={!!onMove}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", x.id)}
                    onClick={() => onOpenTask(x)}
                  >
                    <div className="row small" style={{ justifyContent: "space-between" }}>
                      <span className="tag">{t(`cat.${x.category}` as MessageKey)}</span>
                      <Score value={x.score} />
                    </div>
                    <div className="t">{x.title}</div>
                    <div className="small faint">{t("common.personDays", { n: x.effort_days })}{x.status_locked && ` · ${t("pg.manual")}`}</div>
                    {x.evidence && x.status !== "todo" && <div className="ev">🤖 {x.evidence}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t("pg.history")}</h2>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>{t("col.date")}</th><th>{t("col.trigger")}</th><th>{t("col.commit")}</th><th>{t("col.result")}</th><th>{t("col.doneTotal")}</th></tr></thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(a.started_at)}</td>
                  <td><span className="tag">{t(`trigger.${a.trigger}` as MessageKey)}</span></td>
                  <td className="mono">
                    {a.base_sha && a.head_sha && a.base_sha !== a.head_sha ? `${a.base_sha.slice(0, 7)}…${a.head_sha.slice(0, 7)}` : a.head_sha?.slice(0, 7)}
                  </td>
                  <td className="small">
                    {a.status === "error" ? <span style={{ color: "var(--red)" }}>{a.error}</span> : a.status === "running" ? t("pg.running") : a.changes?.summary}
                  </td>
                  <td>{a.tasks_done}/{a.tasks_total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
