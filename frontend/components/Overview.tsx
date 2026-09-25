"use client";

import { Analysis, EventItem, fmtDate, Progress, Repo, STATUS_LABEL, Task, TRIGGER_LABEL } from "@/lib/api";
import { Score, TaskStatus } from "./StatusBadge";

const PHASE: Record<string, string> = {
  idea: "アイデア", prototype: "プロトタイプ", mvp: "MVP", beta: "ベータ", production: "本番運用",
};

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
  const insight = analysis?.insight;
  const changes = analysis?.changes;
  const next = tasks.filter((t) => t.status !== "done").sort((a, b) => b.score - a.score).slice(0, 5);

  if (!analysis) {
    return (
      <div className="card">
        {repo.status === "error" ? (
          <div className="err">分析に失敗しました: {repo.error}</div>
        ) : (
          <div className="row muted"><span className="spinner" /> エージェントがリポジトリを分析しています。初回は 1〜2 分ほどかかります...</div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="label">開発フェーズ</div>
          <div className="value">{insight ? PHASE[insight.development_phase] ?? insight.development_phase : "-"}</div>
        </div>
        <div className="card stat">
          <div className="label">進捗 (工数ベース)</div>
          <div className="value">{progress?.percent ?? 0}<small>%</small></div>
          <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${progress?.percent ?? 0}%` }} /></div>
        </div>
        <div className="card stat">
          <div className="label">タスク</div>
          <div className="value">
            {progress?.by_status.done ?? 0}<small> / {tasks.length} 完了</small>
          </div>
          <div className="small muted">処理中 {progress?.by_status.in_progress ?? 0} · 未対応 {progress?.by_status.todo ?? 0}</div>
        </div>
        <div className="card stat">
          <div className="label">最終分析</div>
          <div className="value" style={{ fontSize: 16, marginTop: 6 }}>{fmtDate(analysis.finished_at)}</div>
          <div className="small muted">
            {TRIGGER_LABEL[analysis.trigger] ?? analysis.trigger}
            {analysis.head_sha && <span className="mono"> @{analysis.head_sha.slice(0, 7)}</span>}
          </div>
        </div>
      </div>

      <div className="grid cols-2">
        <div>
          <div className="card">
            <h2 className="section">次にやるべきこと</h2>
            {changes?.next_actions?.length ? (
              <ol style={{ margin: "0 0 12px", paddingLeft: 20 }}>
                {changes.next_actions.map((a, i) => <li key={i} style={{ marginBottom: 4 }}><b>{a}</b></li>)}
              </ol>
            ) : null}
            <table className="list">
              <tbody>
                {next.map((t) => (
                  <tr key={t.id} className="clickable" onClick={() => onOpenTask(t)}>
                    <td style={{ width: 44 }}><Score value={t.score} /></td>
                    <td>{t.title}</td>
                    <td style={{ width: 70 }}><TaskStatus status={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2 className="section">エージェントの最新判断</h2>
            <p style={{ marginTop: 0 }}>{changes?.summary}</p>
            {changes?.progress_assessment && <p className="muted">{changes.progress_assessment}</p>}
            {!!changes?.applied?.length && (
              <div>
                {changes.applied.slice(0, 12).map((c, i) => (
                  <div className="change" key={i}>
                    <span className={`tag ${c.type === "created" ? "green" : ""}`}>
                      {c.type === "created" ? "新規" : c.type === "status" ? "状態" : "優先度"}
                    </span>
                    <div>
                      <div>
                        {c.title}
                        {c.type === "status" && (
                          <span className="muted small"> {STATUS_LABEL[c.from ?? ""] ?? c.from} → <b>{STATUS_LABEL[c.to ?? ""] ?? c.to}</b></span>
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
              <h2 className="section">リポジトリの理解</h2>
              <p style={{ marginTop: 0 }}>{insight.summary}</p>
              <div className="kv" style={{ marginBottom: 12 }}>
                <div>カテゴリ</div><div>{insight.product_category}</div>
                <div>ターゲット</div><div>{insight.target_users}</div>
                <div>技術</div>
                <div className="row">{insight.tech_stack.map((s) => <span key={s} className="tag">{s}</span>)}</div>
              </div>
              <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>実装済みの機能</div>
              <ul className="plain small">{insight.implemented_features.map((f, i) => <li key={i}>{f}</li>)}</ul>
              <div className="small" style={{ fontWeight: 600, margin: "10px 0 4px" }}>開発体制の所見</div>
              <ul className="plain small">{insight.health_notes.map((f, i) => <li key={i}>{f}</li>)}</ul>
            </div>
          )}

          <div className="card">
            <h2 className="section">アクティビティ</h2>
            <ul className="timeline">
              {events.slice(0, 15).map((e) => (
                <li key={e.id} className={`k-${e.kind}`}>
                  <div className="when">{fmtDate(e.created_at)}</div>
                  <div className="small">{e.message}</div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
