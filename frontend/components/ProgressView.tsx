"use client";

import { useState } from "react";
import { Analysis, CATEGORY_LABEL, fmtDate, Progress, Status, STATUS_LABEL, Task, TRIGGER_LABEL } from "@/lib/api";
import { Score } from "./StatusBadge";

const COLS: Status[] = ["todo", "in_progress", "done"];

function BurnUp({ history }: { history: Progress["history"] }) {
  if (history.length < 1) return <div className="muted small">分析履歴がたまるとグラフが表示されます。</div>;
  const W = 560, H = 180, P = 28;
  const max = Math.max(1, ...history.map((h) => h.tasks_total));
  const n = history.length;
  const px = (i: number) => P + (n === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const py = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (f: (h: Progress["history"][0]) => number) => history.map((h, i) => `${i ? "L" : "M"}${px(i)},${py(f(h))}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="バーンアップチャート">
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
            <title>{`${fmtDate(h.started_at)} (${TRIGGER_LABEL[h.trigger] ?? h.trigger})\n完了 ${h.tasks_done} / 全体 ${h.tasks_total}`}</title>
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
  onMove: (t: Task, s: Status) => void;
}) {
  const [over, setOver] = useState<Status | null>(null);

  return (
    <>
      <div className="grid cols-2">
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">バーンアップ (分析ごとのタスク完了数)</h2>
          <BurnUp history={progress?.history ?? []} />
          <div className="row small muted">
            <span style={{ color: "#2f9e6e" }}>━ 完了</span>
            <span style={{ color: "#4488c5" }}>━ 着手済み</span>
            <span>┄ 全タスク</span>
          </div>
        </div>
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">カテゴリ別の進捗</h2>
          {Object.entries(progress?.by_category ?? {}).map(([k, v]) => (
            <div key={k} style={{ marginBottom: 8 }}>
              <div className="row small" style={{ justifyContent: "space-between" }}>
                <span>{CATEGORY_LABEL[k] ?? k}</span>
                <span className="muted">{v.done}/{v.total}</span>
              </div>
              <div className="progress"><div style={{ width: `${v.total ? (v.done / v.total) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="section">カンバン</h2>
        <p className="small muted" style={{ marginTop: -6 }}>
          ドラッグでステータスを変更できます。エージェントはコミット・PR から完了/着手を自動検知して更新しますが、手動で変更したタスクはエージェントが上書きしません。
        </p>
        <div className="kanban">
          {COLS.map((s) => {
            const items = tasks.filter((t) => t.status === s).sort((a, b) => b.score - a.score);
            return (
              <div
                key={s}
                className={`col ${over === s ? "drag-over" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setOver(s); }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const t = tasks.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                  if (t && t.status !== s) onMove(t, s);
                }}
              >
                <div className="col-head"><span className={`status ${s}`}>{STATUS_LABEL[s]}</span><span className="muted">{items.length}</span></div>
                {items.map((t) => (
                  <div
                    key={t.id}
                    className="kcard"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                    onClick={() => onOpenTask(t)}
                  >
                    <div className="row small" style={{ justifyContent: "space-between" }}>
                      <span className="tag">{CATEGORY_LABEL[t.category] ?? t.category}</span>
                      <Score value={t.score} />
                    </div>
                    <div className="t">{t.title}</div>
                    <div className="small faint">{t.effort_days}人日{t.status_locked && " · 手動"}</div>
                    {t.evidence && t.status !== "todo" && <div className="ev">🤖 {t.evidence}</div>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2 className="section">分析履歴</h2>
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>日時</th><th>トリガー</th><th>コミット</th><th>結果</th><th>完了/全体</th></tr></thead>
            <tbody>
              {analyses.map((a) => (
                <tr key={a.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(a.started_at)}</td>
                  <td><span className="tag">{TRIGGER_LABEL[a.trigger] ?? a.trigger}</span></td>
                  <td className="mono">
                    {a.base_sha && a.head_sha && a.base_sha !== a.head_sha ? `${a.base_sha.slice(0, 7)}…${a.head_sha.slice(0, 7)}` : a.head_sha?.slice(0, 7)}
                  </td>
                  <td className="small">
                    {a.status === "error" ? <span style={{ color: "var(--red)" }}>{a.error}</span> : a.status === "running" ? "実行中..." : a.changes?.summary}
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
