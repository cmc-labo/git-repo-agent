"use client";

import { Analysis, EventItem, Progress, Repo, Task } from "@/lib/api";
import { MessageKey, useI18n } from "@/lib/i18n";
import { Score, TaskStatus } from "./StatusBadge";

export default function Overview({
  repo, analysis, tasks, progress, events, onOpenTask,
}: {
  repo: Repo;
  analysis: Analysis | null;
  tasks: Task[];
  progress: Progress | null;
  events: EventItem[];
  onOpenTask: (t: Task) => void;
}) {
  const { t, fmtDate, eventText } = useI18n();
  const insight = analysis?.insight;
  const changes = analysis?.changes;
  const next = tasks.filter((x) => x.status !== "done").sort((a, b) => b.score - a.score).slice(0, 5);

  if (!analysis) {
    return (
      <div className="card">
        {repo.status === "error" ? (
          <div className="err">{t("ov.failed", { error: repo.error })}</div>
        ) : (
          <div className="row muted"><span className="spinner" /> {t("ov.analyzingFirst")}</div>
        )}
      </div>
    );
  }

  const changeLabel = { created: "ov.changeCreated", status: "ov.changeStatus", rescored: "ov.changeRescored" } as const;

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">{t("ov.phase")}</div>
          <div className="value">{insight ? t(`phase.${insight.development_phase}` as MessageKey) : "-"}</div>
        </div>
        <div className="card stat">
          <div className="label">{t("ov.progress")}</div>
          <div className="value">{progress?.percent ?? 0}<small>%</small></div>
          <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${progress?.percent ?? 0}%` }} /></div>
        </div>
        <div className="card stat">
          <div className="label">{t("ov.tasks")}</div>
          <div className="value">
            {progress?.by_status.done ?? 0}<small> {t("ov.tasksDone", { total: tasks.length })}</small>
          </div>
          <div className="small muted">
            {t("ov.tasksSub", { ip: progress?.by_status.in_progress ?? 0, todo: progress?.by_status.todo ?? 0 })}
          </div>
        </div>
        <div className="card stat">
          <div className="label">{t("ov.lastAnalysis")}</div>
          <div className="value" style={{ fontSize: 16, marginTop: 6 }}>{fmtDate(analysis.finished_at)}</div>
          <div className="small muted">
            {t(`trigger.${analysis.trigger}` as MessageKey)}
            {analysis.head_sha && <span className="mono"> @{analysis.head_sha.slice(0, 7)}</span>}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card">
            <h2 className="section">{t("ov.next")}</h2>
            {changes?.next_actions?.length ? (
              <ol style={{ margin: "0 0 12px", paddingInlineStart: 20 }}>
                {changes.next_actions.map((a, i) => <li key={i} style={{ marginBottom: 4 }}><b>{a}</b></li>)}
              </ol>
            ) : null}
            <table className="list">
              <tbody>
                {next.map((x) => (
                  <tr key={x.id} className="clickable" onClick={() => onOpenTask(x)}>
                    <td style={{ width: 44 }}><Score value={x.score} /></td>
                    <td>{x.title}</td>
                    <td style={{ width: 70 }}><TaskStatus status={x.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="section">{t("ov.latest")}</h2>
            <p style={{ marginTop: 0 }}>{changes?.summary}</p>
            {changes?.progress_assessment && <p className="muted">{changes.progress_assessment}</p>}
            {!!changes?.applied?.length && (
              <div>
                {changes.applied.slice(0, 12).map((c, i) => (
                  <div className="change" key={i}>
                    <span className={`tag ${c.type === "created" ? "green" : ""}`}>{t(changeLabel[c.type])}</span>
                    <div>
                      <div>
                        {c.title}
                        {c.type === "status" && (
                          <span className="muted small">
                            {" "}{t(`status.${c.from}` as MessageKey)} → <b>{t(`status.${c.to}` as MessageKey)}</b>
                          </span>
                        )}
                      </div>
                      {c.type !== "created" && <div className="small muted">{c.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          {insight && (
            <div className="card">
              <h2 className="section">{t("ov.understanding")}</h2>
              <p style={{ marginTop: 0 }}>{insight.summary}</p>
              <div className="kv" style={{ marginBottom: 12 }}>
                <div>{t("ov.category")}</div><div>{insight.product_category}</div>
                <div>{t("ov.target")}</div><div>{insight.target_users}</div>
                <div>{t("ov.tech")}</div>
                <div className="row">{insight.tech_stack.map((s) => <span key={s} className="tag">{s}</span>)}</div>
              </div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{t("ov.features")}</div>
              <ul className="plain small">{insight.implemented_features.map((f, i) => <li key={i}>{f}</li>)}</ul>
              <div className="small" style={{ fontWeight: 600, margin: "10px 0 4px" }}>{t("ov.health")}</div>
              <ul className="plain small">{insight.health_notes.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}

          <div className="card">
            <h2 className="section">{t("ov.activity")}</h2>
            <ul className="timeline">
              {events.slice(0, 15).map((e) => (
                <li key={e.id} className={`k-${e.kind}`}>
                  <div className="when">{fmtDate(e.created_at)}</div>
                  <div className="small">{eventText(e.message)}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
