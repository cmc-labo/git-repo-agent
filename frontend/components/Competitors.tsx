"use client";

import { CompetitorAnalysis, fmtDate } from "@/lib/api";

const KIND: Record<string, string> = {
  oss_repository: "OSS", web_service: "Webサービス", mobile_app: "アプリ", library: "ライブラリ", other: "その他",
};

function Threat({ level }: { level: number }) {
  return (
    <span className="threat" title={`脅威度 ${level}/5`}>
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
  const head = (
    <div className="page-head">
      <span className="muted small">最終調査 {fmtDate(updatedAt)} · Gemini + Google Search Grounding / GitHub 検索</span>
      <span className="spacer" />
      <button className="btn" onClick={onRefresh} disabled={busy}>
        {busy ? <span className="spinner" /> : "🔍"} 競合を再調査
      </button>
    </div>
  );
  if (!data) return <>{head}<div className="card muted">競合分析はまだありません。</div></>;

  const comps = [...data.competitors].sort((a, b) => b.threat_level - a.threat_level);
  return (
    <>
      {head}
      <div className="card">
        <h2 className="section">市場概況</h2>
        <p style={{ margin: 0 }}>{data.market_overview}</p>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        {comps.map((c, i) => (
          <div className="card" key={i} style={{ marginTop: 0 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row">
                <span className="tag green">{KIND[c.kind] ?? c.kind}</span>
                <b>{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</b>
              </div>
              <Threat level={c.threat_level} />
            </div>
            <p className="small muted" style={{ margin: "8px 0" }}>{c.description}</p>
            <div className="grid cols-2" style={{ gap: 10 }}>
              <div>
                <div className="small" style={{ fontWeight: 600 }}>強み</div>
                <ul className="plain small">{c.strengths.map((s, j) => <li key={j}>{s}</li>)}</ul>
              </div>
              <div>
                <div className="small" style={{ fontWeight: 600 }}>弱み</div>
                <ul className="plain small">{c.weaknesses.map((s, j) => <li key={j}>{s}</li>)}</ul>
              </div>
            </div>
            {!!c.feature_gap.length && (
              <div style={{ marginTop: 10 }}>
                <div className="small" style={{ fontWeight: 600, color: "var(--red)" }}>自プロダクトに足りない機能</div>
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
          <h2 className="section">取るべき差別化ポイント</h2>
          <ul className="plain">{data.differentiation.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
        <div className="card" style={{ marginTop: 0 }}>
          <h2 className="section">技術トレンド</h2>
          <ul className="plain">{data.tech_trends.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      </div>

      {!!data.github_similar?.length && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section">GitHub 上の類似リポジトリ</h2>
          <div className="table-wrap">
            <table className="list">
              <thead><tr><th>リポジトリ</th><th>説明</th><th>言語</th><th style={{ textAlign: "right" }}>★</th></tr></thead>
              <tbody>
                {data.github_similar.map((r) => (
                  <tr key={r.full_name}>
                    <td><a href={r.html_url} target="_blank" rel="noreferrer">{r.full_name}</a></td>
                    <td className="small muted">{r.description}</td>
                    <td className="small">{r.language}</td>
                    <td style={{ textAlign: "right" }}>{r.stars.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!!data.sources?.length && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 className="section">調査ソース (Google Search)</h2>
          <ul className="plain small">
            {data.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          </ul>
        </div>
      )}
    </>
  );
}
