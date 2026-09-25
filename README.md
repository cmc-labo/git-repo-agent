# Git Repository Agent

**リポジトリを継続的に観測し、開発状況を理解し、競合サービスを分析した上で、次に何をすべきかを更新し続ける** 開発支援エージェント。

GitHub リポジトリを登録すると、Gemini がコード・README・コミット・Issue を読み込み、Google 検索で競合サービスを調査し、
「緊急度 × 重要度」でスコアリングしたタスクと WBS 形式のロードマップを作成します。
以降は GitHub の更新 (push / PR マージ / Issue / リリース) のたびに **差分を読んで自動で再分析** し、
完了したタスクの検知・優先度の見直し・新しいタスクの追加を行います。

## 機能 (MVP)

| 機能 | 内容 |
|---|---|
| リポジトリ理解 | README / ファイル構成 / 主要設定ファイル / コミット / Issue からプロダクト概要・技術スタック・実装済み機能・開発フェーズを把握 |
| 競合分析 | **Gemini + Google Search Grounding** で Web サービス・アプリ・OSS を調査し、GitHub 検索で類似リポジトリも取得。強み/弱み/自分に足りない機能/脅威度/差別化ポイント/技術トレンドを出力 (参照元 URL 付き) |
| タスク提案と優先順位 | 緊急度 × 重要度 のマトリクス (アイゼンハワー) と 0-100 のスコアで表示。判断根拠つき |
| ロードマップ | マイルストーン → タスクの WBS とガントチャート。依存関係・スコア順・並列人数・土日を考慮して自動スケジューリング |
| 進捗管理 | カンバン (ドラッグで変更)、バーンアップ、カテゴリ別進捗、分析履歴 |
| 自動再分析 | GitHub Webhook (HMAC 署名検証) + Cloud Scheduler による定期 HEAD チェック。前回分析からの diff を読んでタスクを完了/着手/取り下げ/再スコア |
| private リポジトリ | Fine-grained PAT を登録 (サーバー側で暗号化保存) |

エージェントの判断ルール:
- 手動でステータスを変更したタスクは、エージェントが上書きしない (人の判断を優先)
- 分析中に届いた更新は捨てずに 1 回にまとめて再実行 (デバウンス)
- 競合分析は重いため、初回・7日経過・手動指定時のみ再調査

## アーキテクチャ

```
 GitHub ──(Webhook: push/PR/issues)──┐
                                      ▼
 Cloud Scheduler ──(15分毎 poll)──▶ Cloud Run: FastAPI ──▶ Turso (libSQL)
                                      │
                                      ├─ ① リポジトリ理解      Gemini (Vertex AI) 構造化出力
                                      ├─ ② 競合分析            Gemini + Google Search Grounding / GitHub Search
                                      └─ ③ 計画 (初回/差分)     Gemini 構造化出力 → タスク・マイルストーン更新
                                      ▲
 ブラウザ ── Next.js (Vercel) ──/api/* rewrite──┘
```

| レイヤ | 技術 |
|---|---|
| フロントエンド | Next.js 16 / React 19 (App Router), Vercel |
| API / Agent | FastAPI (Python), **Cloud Run** |
| AI | **Gemini 2.5 Flash via Vertex AI** (google-genai SDK), Google Search Grounding |
| DB | Turso (HTTP API 経由。未設定時はローカル SQLite) |

### ハッカソン要件との対応
- 要件1 (実行基盤): **Cloud Run** でバックエンド/エージェントを実行
- 要件2 (Google Cloud AI): **Gemini API (Vertex AI 経由)** + Google Search Grounding

## ディレクトリ

```
backend/
  app/main.py              API ルーティング / Webhook / cron
  app/agent/pipeline.py    エージェントのオーケストレーション (収集→理解→競合→計画→反映)
  app/agent/prompts.py     プロンプト
  app/agent/schemas.py     Gemini 構造化出力のスキーマ
  app/agent/llm.py         Gemini 呼び出し (Vertex AI / API キー両対応, Search Grounding)
  app/agent/demo.py        認証なしで動かすためのサンプル出力
  app/github_client.py     GitHub REST からのコンテキスト収集 (diff 含む)
  app/roadmap.py           WBS / ガントのスケジューリング
  app/db.py                Turso HTTP / SQLite
  tests/
frontend/
  app/page.tsx             リポジトリ一覧・登録
  app/repos/[id]/page.tsx  ダッシュボード (タブ: ダッシュボード/競合/優先度/ロードマップ/進捗/設定)
  components/
deploy/deploy_backend.sh   Cloud Run + Cloud Scheduler デプロイ
```

## ローカル実行

```bash
# backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # 値を編集 (Gemini 未設定なら DEMO_MODE=true でサンプル出力)
set -a; source .env; set +a
uvicorn app.main:app --reload --port 8000

# frontend (別ターミナル)
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

Vertex AI をローカルで使う場合は `gcloud auth application-default login` を実行し、
`GOOGLE_GENAI_USE_VERTEXAI=true` `GOOGLE_CLOUD_PROJECT=<project>` を設定します。
ローカルでの Webhook 確認は `ngrok http 8000` などで公開 URL を作り、`PUBLIC_BASE_URL` に設定してください。

テスト: `cd backend && python -m pytest -q`

## デプロイ

### 1. Turso
```bash
turso db create git-repo-agent
turso db show git-repo-agent --url        # TURSO_DATABASE_URL
turso db tokens create git-repo-agent     # TURSO_AUTH_TOKEN
```
テーブルは起動時に自動作成されます。

### 2. バックエンド (Cloud Run)
```bash
PROJECT_ID=<gcp-project> TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
  ./deploy/deploy_backend.sh
```
Cloud Run のサービス作成、Vertex AI 用サービスアカウント、15 分毎の Cloud Scheduler ジョブまで作成します。
出力される `APP_SECRET` / `CRON_TOKEN` は控えておき、再デプロイ時にも同じ値を渡してください。

### 3. フロントエンド (Vercel)
`frontend` をルートディレクトリとして Vercel にインポートし、環境変数 `BACKEND_URL=<Cloud Run の URL>` を設定。

### 4. Webhook
ダッシュボードの「設定」タブに表示される Payload URL / Secret を GitHub リポジトリの Settings → Webhooks に登録
(Content type: `application/json`, イベント: Pushes / Pull requests / Issues / Releases)。

## 既知の制約 / Phase 2

- 認証なし (デモ用)。公開運用する場合は GitHub OAuth などでユーザーを分離し、Webhook secret の表示を制限すること
- 分析は Cloud Run の BackgroundTasks で実行 (`--no-cpu-throttling` 前提)。規模が大きくなれば Cloud Tasks に移行
- Phase 2: ソースコード分析 (Diff ベース + AST / 静的解析)、セキュリティリスク分析、GitHub App 化
