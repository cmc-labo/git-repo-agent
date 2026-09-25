"use client";

import { CompetitorAnalysis } from "@/lib/api";
import { MessageKey, useI18n } from "@/lib/i18n";

function Threat({ level }: { level: number }) {
  const { t } = useI18n();
  return (
    <span className="threat" title={t("comp.threat", { n: level })}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= level ? "" : "off"}>●</span>)}
    </span>
  );
}

export default function Competitors({
  data, updatedAt, busy, onRefresh,
}: {
  data: CompetitorAnalysis | null;
  updatedAt: string | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  const { t, fmtDate } = useI18n();
  const head = (
    <div className="page-head">
      <span className="muted small">{t("comp.meta", { date: fmtDate(updatedAt) })}</span>
      <span className="spacer" />
      <button className="btn" onClick={onRefresh} disabled={busy}>
        {busy ? <span className="spinner" /> : "🔍"} {t("comp.refresh")}
      </button>
    </div>
  );
  if (!data) return <>{head}<div className="card muted">{t("comp.none")}</div></>;

  const comps = [...data.competitors].sort((a, b) => b.threat_level - a.threat_level);
  return (
    <>
      {head}
      <div className="card">
        <h2 className="section">{t("comp.market")}</h2>
        <p style={{ margin: 0 }}>{data.market_overview}</p>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        {comps.map((c, i) => (
          <div className="card" key={i} style={{ marginTop: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <span className="tag green">{t(`kind.${c.kind}` as MessageKey)}</span>
                <b>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</b>
              </div>
              <Threat level={c.threat_level} />
            </div>
            <p className="small muted" style={{ margin: "8px 0" }}>{c.description}</p>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div>
                <div className="small" style={{ fontWeight: 600 }}>{t("comp.strengths")}</div>
                <ul className="plain small">{c.strengths.map((s, j) => <li key={j}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="small" style={{ fontWeight: 600 }}>{t("comp.weaknesses")}</div>
                <ul className="plain small">{c.weaknesses.map((s, j) => <li key={j}>{s}</li>)}</ul>
              </div>
            </div>
            {!!c.feature_gap.length && (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ fontWeight: 600, color: "var(--red)" }}>{t("comp.gap")}</div>
                <div className="row" style={{ marginTop: 4 }}>
                  {c.feature_gap.map((g, j) => <span key={j} className="tag">{g}</span>)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">{t("comp.differentiation")}</h2>
          <ul className="plain">{data.differentiation.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">{t("comp.trends")}</h2>
          <ul className="plain">{data.tech_trends.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      </div>

      {!!data.github_similar?.length && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section">{t("comp.similar")}</h2>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>{t("comp.colRepo")}</th><th>{t("comp.colDescription")}</th><th>{t("comp.colLanguage")}</th><th style={{ textAlign: "end" }}>★</th></tr></thead>
              <tbody>
                {data.github_similar.map((r) => (
                  <tr key={r.full_name}>
                    <td><a href={r.html_url} target="_blank" rel="noreferrer">{r.full_name}</a></td>
                    <td className="small muted">{r.description}</td>
                    <td className="small">{r.language}</td>
                    <td style={{ textAlign: "end" }}>{r.stars.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!data.sources?.length && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section">{t("comp.sources")}</h2>
          <ul className="plain small">
            {data.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          </ul>
        </div>
      )}
    </>
  );
}
