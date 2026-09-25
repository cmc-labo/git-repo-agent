"use client";

import { useMemo, useState } from "react";
import { CATEGORY_LABEL, Milestone, quadrant, Task } from "@/lib/api";
import { Score, TaskStatus } from "./StatusBadge";

const QUADS = [
  { q: 1, title: "① 今すぐやる", sub: "緊急 × 重要" },
  { q: 2, title: "② 計画してやる", sub: "重要 × 緊急でない" },
  { q: 3, title: "③ 手早く片付ける", sub: "緊急 × 重要でない" },
  { q: 4, title: "④ 後回し", sub: "緊急でも重要でもない" },
] as const;

export default function Priority({
  tasks, milestones, onOpenTask, onAddTask,
}: {
  tasks: Task[];
  milestones: Milestone[];
  onOpenTask: (t: Task) => void;
  onAddTask: () => void;
}) {
  const [hideDone, setHideDone] = useState(true);
  const [cat, setCat] = useState("");
  const visible = useMemo(
    () => tasks.filter((t) => (!hideDone || t.status !== "done") && (!cat || t.category === cat)).sort((a, b) => b.score - a.score),
    [tasks, hideDone, cat],
  );
  const msName = (id: string | null) => milestones.find((m) => m.id === id)?.title ?? "-";
  // 配置: 左上 = ②(重要/非緊急), 右上 = ①(重要/緊急), 左下 = ④, 右下 = ③
  const layout = [2, 1, 4, 3];

  return (
    <>
      <div className="page-head">
        <label className="row small"><input type="checkbox" style={{ width: "auto" }} checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> 完了を隠す</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 160 }}>
          <option value="">すべてのカテゴリ</option>
          {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="spacer" />
        <button className="btn" onClick={onAddTask}>＋ タスクを追加</button>
      </div>

      <div className="card">
        <h2 className="section">緊急度 × 重要度 マトリクス</h2>
        <div className="matrix">
          <div className="axis-y">↑ 重要度 高</div>
          {layout.map((q) => {
            const meta = QUADS[q - 1];
            const items = visible.filter((t) => quadrant(t) === q);
            return (
              <div key={q} className={`quad q${q}`}>
                <h3><span>{meta.title} <span className="faint small">{meta.sub}</span></span><span className="muted">{items.length}</span></h3>
                {items.map((t) => (
                  <div key={t.id} className={`chip ${t.status}`} onClick={() => onOpenTask(t)}>
                    <Score value={t.score} />
                    <span style={{ flex: 1 }}>{t.title}</span>
                    {t.status === "in_progress" && <TaskStatus status={t.status} />}
                  </div>
                ))}
              </div>
            );
          })}
          <div />
          <div className="axis-x">緊急度 高 →</div>
        </div>
      </div>

      <div className="card">
        <h2 className="section">スコアリング一覧</h2>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>スコア</th><th>タスク</th><th>カテゴリ</th><th>緊急</th><th>重要</th><th>工数</th><th>マイルストーン</th><th>状態</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id} className="clickable" onClick={() => onOpenTask(t)}>
                  <td><Score value={t.score} /></td>
                  <td>
                    <div>{t.title}{t.source === "user" && <span className="tag" style={{ marginLeft: 6 }}>手動</span>}</div>
                    <div className="small muted">{t.rationale}</div>
                  </td>
                  <td><span className="tag">{CATEGORY_LABEL[t.category] ?? t.category}</span></td>
                  <td>{t.urgency}</td>
                  <td>{t.importance}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{t.effort_days}日</td>
                  <td className="small">{msName(t.milestone_id)}</td>
                  <td><TaskStatus status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small">スコア = (重要度×0.55 + 緊急度×0.45) / 5 × 100 − 工数(日)×1.5</p>
      </div>
    </>
  );
}
