"use client";

import { useState } from "react";
import { Repo } from "@/lib/api";

export default function Settings({
  repo, onSaveToken, onDelete,
}: {
  repo: Repo;
  onSaveToken: (token: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const settingsUrl = repo.html_url ? `${repo.html_url}/settings/hooks/new` : null;

  return (
    <>
      <div className="card">
        <h2 className="section">自動再分析の設定 (GitHub Webhook)</h2>
        <p className="small muted" style={{ marginTop: -4 }}>
          Webhook を設定すると push (デフォルトブランチ) / PR マージ / Issue の作成・クローズ / リリース のたびに
          エージェントが差分を取り込んで再分析し、タスクとロードマップを更新します。
          Webhook を設定しない場合も、定期チェック (Cloud Scheduler) で新しいコミットを検知します。
        </p>
        <div className="kv">
          <div>Payload URL</div>
          <div className="mono">{repo.webhook_url}</div>
          <div>Content type</div>
          <div className="mono">application/json</div>
          <div>Secret</div>
          <div className="row">
            <span className="mono">{showSecret ? repo.webhook_secret : "••••••••••••••••"}</span>
            <button className="btn sm" onClick={() => setShowSecret((v) => !v)}>{showSecret ? "隠す" : "表示"}</button>
          </div>
          <div>イベント</div>
          <div className="small">Pushes, Pull requests, Issues, Releases</div>
        </div>
        {settingsUrl && (
          <p style={{ marginBottom: 0 }}>
            <a className="btn sm" href={settingsUrl} target="_blank" rel="noreferrer">GitHub の Webhook 設定を開く ↗</a>
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="section">アクセストークン (private リポジトリ)</h2>
        <p className="small muted" style={{ marginTop: -4 }}>
          現在: {repo.has_token ? "登録済み (暗号化保存)" : "未登録"}。Fine-grained PAT に Contents / Issues / Pull requests / Metadata の Read 権限を付与してください。
        </p>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="password" placeholder="github_pat_... (空で保存すると削除)" value={token} onChange={(e) => setToken(e.target.value)} />
          <button
            className="btn"
            onClick={async () => {
              await onSaveToken(token);
              setToken("");
              setMsg("保存しました");
            }}
          >
            保存
          </button>
        </div>
        {msg && <div className="small" style={{ color: "var(--green-dark)", marginTop: 6 }}>{msg}</div>}
      </div>

      <div className="card">
        <h2 className="section">リポジトリの登録解除</h2>
        <p className="small muted" style={{ marginTop: -4 }}>分析結果・タスク・履歴をすべて削除します。</p>
        {confirmDel ? (
          <div className="row">
            <span className="small">本当に削除しますか？</span>
            <button className="btn danger" onClick={onDelete}>削除する</button>
            <button className="btn" onClick={() => setConfirmDel(false)}>キャンセル</button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setConfirmDel(true)}>登録解除</button>
        )}
      </div>
    </>
  );
}
