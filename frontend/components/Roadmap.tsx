"use client";

import { Roadmap as RoadmapT } from "@/lib/api";
import { MessageKey, useI18n } from "@/lib/i18n";
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
  const { t, fmtDate, fmtMonth } = useI18n();
  if (!data || !data.milestones.length) return <div className="card muted">{t("rm.none")}</div>;

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
  const px = (s: string) => diffDays(start, parse(s)) * DAY;
  const w = (s: string, e: string) => (diffDays(parse(s), parse(e)) + 1) * DAY;
  const today = px(data.today);

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
          {t("rm.meta", { start: fmtDate(data.start, false), end: fmtDate(data.end, false), lanes: data.lanes })}
        </span>
        <span className="spacer" />
        <span className="row small muted">
          <span style={{ display: "inline-block", width: 14, height: 10, background: "var(--green)" }} /> {t("status.done")}
          <span style={{ display: "inline-block", width: 14, height: 10, background: "#9fd6bd" }} /> {t("status.in_progress")}
          <span style={{ display: "inline-block", width: 14, height: 10, background: "#e4e7ea", border: "1px solid #cfd4da" }} /> {t("status.todo")}
          <span style={{ display: "inline-block", width: 2, height: 12, background: "var(--red)" }} /> {t("rm.today")}
        </span>
      </div>

      <div className="gantt">
        <div style={{ minWidth: 300 + width }}>
          <div className="g-head">
            <div className="g-label muted small">{t("rm.wbs")}</div>
            <div className="g-days" style={{ width }}>
              {days.map((d, i) => (
                <div key={i} className={`g-day ${d.getDay() % 6 === 0 ? "weekend" : ""}`} style={{ left: i * DAY, width: DAY }}>
                  {(i === 0 || d.getDate() === 1) && <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{fmtMonth(d)}</div>}
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
                  <span className="txt">{m.title || t("rm.uncategorized")}</span>
                  <span className="faint small" style={{ marginInlineStart: "auto" }}>{m.progress}%</span>
                </div>
                <div className="g-track" style={{ width }}>
                  {grid}
                  <div className="g-bar ms-bar" style={{ left: px(m.start), width: w(m.start, m.end) }}>
                    <span style={{ width: `${m.progress}%` }} />
                  </div>
                </div>
              </div>
              {m.tasks.map((x, ti) => (
                <div key={x.id} className="g-row">
                  <div className="g-label" style={{ cursor: "pointer" }} onClick={() => onOpenTask(x.id)}>
                    <span className="wbs">{mi + 1}.{ti + 1}</span>
                    <span className="txt" style={{ fontWeight: 400 }}>{x.title}</span>
                    <span style={{ marginInlineStart: "auto" }}><TaskStatus status={x.status} /></span>
                  </div>
                  <div className="g-track" style={{ width }}>
                    {grid}
                    <div
                      className={`g-bar ${x.status}`}
                      style={{ left: px(x.start), width: w(x.start, x.end) - 2 }}
                      title={`${x.title}\n${fmtDate(x.start, false)} – ${fmtDate(x.end, false)} (${t("common.personDays", { n: x.effort_days })}) ${t(`status.${x.status}` as MessageKey)}`}
                      onClick={() => onOpenTask(x.id)}
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
