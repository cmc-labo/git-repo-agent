"use client";

import { Roadmap as RoadmapT, STATUS_LABEL } from "@/lib/api";
import { TaskStatus } from "./StatusBadge";

const DAY = 26; // px / 日

function parse(d: string) {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, m - 1, dd);
}
function diffDays(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default function Roadmap({ data, onOpenTask }: { data: RoadmapT | null; onOpenTask: (id: string) => void }) {
  if (!data || !data.milestones.length) return <div className="card muted">ロードマップはまだありません。</div>;

  const start = parse(data.start);
  start.setDate(start.getDate() - 2);
  const end = parse(data.end);
  end.setDate(end.getDate() + 5);
  const nDays = diffDays(start, end) + 1;
  const width = nDays * DAY;
  const days = Array.from({ length: nDays }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
  const x = (s: string) => diffDays(start, parse(s)) * DAY;
  const w = (s: string, e: string) => (diffDays(parse(s), parse(e)) + 1) * DAY;
  const today = x(data.today);

  const grid = (
    <>
      {days.map((d, i) => (
        <div key={i} className={`g-grid ${d.getDay() % 6 === 0 ? "weekend" : ""}`} style={{ left: i * DAY, width: DAY }} />
      ))}
      {today >= 0 && today <= width && <div className="g-today" style={{ left: today + DAY / 2 }} />}
    </>
  );

  return (
    <>
      <div className="page-head">
        <span className="muted small">
          {data.start} 〜 {data.end} · 並列 {data.lanes} 名想定 · 土日除く · 依存関係とスコア順に自動スケジューリング
        </span>
        <span className="spacer" />
        <span className="row small muted">
          <span className="g-legend" style={{ display: "inline-block", width: 14, height: 10, background: "var(--green)" }} /> 完了
          <span style={{ display: "inline-block", width: 14, height: 10, background: "#9fd6bd" }} /> 処理中
          <span style={{ display: "inline-block", width: 14, height: 10, background: "#e4e7ea", border: "1px solid #cfd4da" }} /> 未対応
          <span style={{ display: "inline-block", width: 2, height: 12, background: "var(--red)" }} /> 今日
        </span>
      </div>

      <div className="gantt">
        <div style={{ minWidth: 300 + width }}>
          <div className="g-head">
            <div className="g-label muted small">WBS / タスク</div>
            <div className="g-days" style={{ width }}>
              {days.map((d, i) => (
                <div key={i} className={`g-day ${d.getDay() % 6 === 0 ? "weekend" : ""}`} style={{ left: i * DAY, width: DAY }}>
                  {(i === 0 || d.getDate() === 1) && <div style={{ fontWeight: 700 }}>{d.getMonth() + 1}月</div>}
                  {(i !== 0 && d.getDate() !== 1) && <div>&nbsp;</div>}
                  <div>{d.getDate()}</div>
                </div>
              ))}
            </div>
          </div>

          {data.milestones.map((m, mi) => (
            <div key={m.id}>
              <div className="g-row ms">
                <div className="g-label" title={m.goal ?? ""}>
                  <span className="wbs">{mi + 1}</span>
                  <span className="txt">{m.title}</span>
                  <span className="faint small" style={{ marginLeft: "auto" }}>{m.progress}%</span>
                </div>
                <div className="g-track" style={{ width }}>
                  {grid}
                  <div className="g-bar ms-bar" style={{ left: x(m.start), width: w(m.start, m.end) }}>
                    <span style={{ width: `${m.progress}%` }} />
                  </div>
                </div>
              </div>
              {m.tasks.map((t, ti) => (
                <div key={t.id} className="g-row">
                  <div className="g-label" style={{ cursor: "pointer" }} onClick={() => onOpenTask(t.id)}>
                    <span className="wbs">{mi + 1}.{ti + 1}</span>
                    <span className="txt" style={{ fontWeight: 400 }}>{t.title}</span>
                    <span style={{ marginLeft: "auto" }}><TaskStatus status={t.status} /></span>
                  </div>
                  <div className="g-track" style={{ width }}>
                    {grid}
                    <div
                      className={`g-bar ${t.status}`}
                      style={{ left: x(t.start), width: w(t.start, t.end) - 2 }}
                      title={`${t.title}\n${t.start} 〜 ${t.end} (${t.effort_days}人日) ${STATUS_LABEL[t.status]}`}
                      onClick={() => onOpenTask(t.id)}
                    />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
