"use client";

import { useMemo, useState } from "react";
import { Milestone, quadrant, Task } from "@/lib/api";
import { MessageKey, useI18n } from "@/lib/i18n";
import { Score, TaskStatus } from "./StatusBadge";

export const CATEGORIES = ["feature", "bug", "refactor", "test", "infra", "docs", "security", "ux", "research"] as const;

const QUADS = [
  { q: 1, title: "pr.q1", sub: "pr.q1sub" },
  { q: 2, title: "pr.q2", sub: "pr.q2sub" },
  { q: 3, title: "pr.q3", sub: "pr.q3sub" },
  { q: 4, title: "pr.q4", sub: "pr.q4sub" },
] as const;

export default function Priority({
  tasks, milestones, onOpenTask, onAddTask,
}: {
  tasks: Task[];
  milestones: Milestone[];
  onOpenTask: (t: Task) => void;
  onAddTask?: () => void;
}) {
  const { t } = useI18n();
  const [hideDone, setHideDone] = useState(true);
  const [cat, setCat] = useState("");
  const visible = useMemo(
    () => tasks.filter((x) => (!hideDone || x.status !== "done") && (!cat || x.category === cat)).sort((a, b) => b.score - a.score),
    [tasks, hideDone, cat],
  );
  const msName = (id: string | null) => milestones.find((m) => m.id === id)?.title ?? "-";
  const catLabel = (c: string) => t(`cat.${c}` as MessageKey);
  // 配置: 左上 = ②(重要/非緊急), 右上 = ①(重要/緊急), 左下 = ④, 右下 = ③
  const layout = [2, 1, 4, 3];

  return (
    <>
      <div className="page-head">
        <label className="row small"><input type="checkbox" style={{ width: "auto" }} checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> {t("pr.hideDone")}</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ width: 160 }}>
          <option value="">{t("pr.allCategories")}</option>
          {CATEGORIES.map((k) => <option key={k} value={k}>{catLabel(k)}</option>)}
        </select>
        <span className="spacer" />
        {onAddTask && <button className="btn" onClick={onAddTask}>{t("pr.addTask")}</button>}
      </div>

      <div className="card">
        <h2 className="section">{t("pr.matrix")}</h2>
        <div className="matrix">
          <div className="axis-y">{t("pr.axisY")}</div>
          {layout.map((q) => {
            const meta = QUADS[q - 1];
            const items = visible.filter((x) => quadrant(x) === q);
            return (
              <div key={q} className={`quad q${q}`}>
                <h3><span>{t(meta.title)} <span className="faint small">{t(meta.sub)}</span></span><span className="muted">{items.length}</span></h3>
                {items.map((x) => (
                  <div key={x.id} className={`chip ${x.status}`} onClick={() => onOpenTask(x)}>
                    <Score value={x.score} />
                    <span style={{ flex: 1 }}>{x.title}</span>
                    {x.status === "in_progress" && <TaskStatus status={x.status} />}
                  </div>
                ))}
              </div>
            );
          })}
          <div />
          <div className="axis-x">{t("pr.axisX")}</div>
        </div>
      </div>

      <div className="card">
        <h2 className="section">{t("pr.list")}</h2>
        <div className="table-wrap">
          <table className="list">
            <thead>
              <tr>
                <th>{t("col.score")}</th><th>{t("col.task")}</th><th>{t("col.category")}</th><th>{t("col.urgency")}</th>
                <th>{t("col.importance")}</th><th>{t("col.effort")}</th><th>{t("col.milestone")}</th><th>{t("col.status")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((x) => (
                <tr key={x.id} className="clickable" onClick={() => onOpenTask(x)}>
                  <td><Score value={x.score} /></td>
                  <td>
                    <div>{x.title}{x.source === "user" && <span className="tag" style={{ marginInlineStart: 6 }}>{t("pr.manual")}</span>}</div>
                    <div className="small muted">{x.rationale}</div>
                  </td>
                  <td><span className="tag">{catLabel(x.category)}</span></td>
                  <td>{x.urgency}</td>
                  <td>{x.importance}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{t("common.days", { n: x.effort_days })}</td>
                  <td className="small">{msName(x.milestone_id)}</td>
                  <td><TaskStatus status={x.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="faint small">{t("pr.formula")}</p>
      </div>
    </>
  );
}
