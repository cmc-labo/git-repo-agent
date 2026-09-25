"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, fmtDate, Repo } from "@/lib/api";
import { RepoStatus } from "@/components/StatusBadge";

export default function Home() {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.repos().then(setRepos).catch((e) => setError(String(e.message || e)));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!repoInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.createRepo(repoInput.trim(), token.trim() || undefined);
      router.push(`/repos/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="section">リポジトリを登録</h2>
        <p className="muted small" style={{ marginTop: -4 }}>
          登録すると、エージェントがリポジトリを読み込み、競合サービスを調査し、優先度付きのタスクとロードマップを作成します。
          以降は GitHub の更新 (push / PR マージ / Issue) を検知するたびに自動で再分析します。
        </p>
        <form onSubmit={submit} className="stack">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input
              placeholder="owner/repo または https://github.com/owner/repo"
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              disabled={busy}
            />
            <button className="btn primary" disabled={busy || !repoInput.trim()} style={{ whiteSpace: "nowrap" }}>
              {busy ? <span className="spinner" /> : "＋"} 登録して分析
            </button>
          </div>
          <div>
            <button type="button" className="btn sm" onClick={() => setShowToken((v) => !v)}>
              🔒 private リポジトリの場合
            </button>
          </div>
          {showToken && (
            <div>
              <label className="field">GitHub トークン (Fine-grained PAT: Contents / Issues / Pull requests / Metadata の Read 権限)</label>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." />
              <div className="faint small">トークンはサーバー側で暗号化して保存され、画面には再表示されません。</div>
            </div>
          )}
          {error && <div className="err">{error}</div>}
        </form>
      </div>

      <h2 className="section">観測中のリポジトリ</h2>
      {repos === null ? (
        <div className="muted"><span className="spinner" /> 読み込み中...</div>
      ) : repos.length === 0 ? (
        <div className="card muted">まだリポジトリがありません。上のフォームから登録してください。</div>
      ) : (
        <div className="grid cols-3">
          {repos.map((r) => {
            const total = r.tasks_total || 0;
            const pct = total ? Math.round(((r.tasks_done || 0) / total) * 100) : 0;
            return (
              <Link key={r.id} href={`/repos/${r.id}`} className="card repo-card">
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <span className="title">{r.full_name}</span>
                  <RepoStatus status={r.status} />
                </div>
                <div className="muted small" style={{ minHeight: 40, margin: "6px 0 10px" }}>
                  {r.description || "(説明なし)"}
                </div>
                <div className="row small muted" style={{ justifyContent: "space-between" }}>
                  <span>
                    タスク {r.tasks_done}/{total} 完了 · 処理中 {r.tasks_in_progress}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="progress" style={{ margin: "6px 0 10px" }}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="row small faint">
                  {r.is_private && <span className="tag">private</span>}
                  <span>最終分析 {fmtDate(r.last_analyzed_at)}</span>
                  {r.last_analyzed_sha && <span className="mono">@{r.last_analyzed_sha.slice(0, 7)}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
