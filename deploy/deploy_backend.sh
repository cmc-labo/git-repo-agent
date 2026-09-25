#!/usr/bin/env bash
# FastAPI バックエンドを Cloud Run にデプロイし、定期チェック用の Cloud Scheduler を作成する.
# 使い方: PROJECT_ID=xxx TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... ./deploy/deploy_backend.sh
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID を指定してください}"
: "${TURSO_DATABASE_URL:?TURSO_DATABASE_URL を指定してください (Cloud Run のローカルディスクは揮発するため)}"
: "${TURSO_AUTH_TOKEN:?TURSO_AUTH_TOKEN を指定してください}"
REGION="${REGION:-asia-northeast1}"
SERVICE="${SERVICE:-git-repo-agent-api}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"
APP_SECRET="${APP_SECRET:-$(openssl rand -hex 24)}"
CRON_TOKEN="${CRON_TOKEN:-$(openssl rand -hex 24)}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
TURNSTILE_SECRET_KEY="${TURNSTILE_SECRET_KEY:-}"
if [ -z "$TURNSTILE_SECRET_KEY" ]; then echo "WARNING: TURNSTILE_SECRET_KEY 未設定のため、リポジトリ登録のボット判定が無効になります" >&2; fi
SA_NAME="git-repo-agent"
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
cd "$(dirname "$0")/.."

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  aiplatform.googleapis.com cloudscheduler.googleapis.com

# Vertex AI (Gemini) を呼ぶためのサービスアカウント
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$SA_NAME" --display-name "Git Repository Agent"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$SA" \
  --role roles/aiplatform.user --condition=None >/dev/null

# 既存サービスなら URL は変わらないので、最初のデプロイに PUBLIC_BASE_URL を含める
# (デプロイ後に env を更新するとリビジョンがもう 1 つ作られ、起動直後の分析が中断されるため)
EXISTING_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)' 2>/dev/null || true)"

ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
cat > "$ENV_FILE" <<YAML
GOOGLE_GENAI_USE_VERTEXAI: "true"
GOOGLE_CLOUD_PROJECT: "${PROJECT_ID}"
GOOGLE_CLOUD_LOCATION: "global"
GEMINI_MODEL: "${GEMINI_MODEL}"
TURSO_DATABASE_URL: "${TURSO_DATABASE_URL}"
TURSO_AUTH_TOKEN: "${TURSO_AUTH_TOKEN}"
APP_SECRET: "${APP_SECRET}"
CRON_TOKEN: "${CRON_TOKEN}"
GITHUB_TOKEN: "${GITHUB_TOKEN}"
TURNSTILE_SECRET_KEY: "${TURNSTILE_SECRET_KEY}"
YAML
if [ -n "$EXISTING_URL" ]; then echo "PUBLIC_BASE_URL: \"${EXISTING_URL}\"" >> "$ENV_FILE"; fi

# --no-cpu-throttling: レスポンス返却後のバックグラウンド分析 (BackgroundTasks) にも CPU を割り当てる
gcloud run deploy "$SERVICE" --source backend --region "$REGION" \
  --service-account "$SA" --allow-unauthenticated \
  --no-cpu-throttling --memory 1Gi --timeout 900 --max-instances 3 \
  --env-vars-file "$ENV_FILE"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
if [ -z "$EXISTING_URL" ]; then
  # 初回デプロイのみ: URL が確定してから設定する (中断された分析は起動時の復旧処理で再実行される)
  echo "PUBLIC_BASE_URL: \"${URL}\"" >> "$ENV_FILE"
  gcloud run services update "$SERVICE" --region "$REGION" --env-vars-file "$ENV_FILE" >/dev/null
fi

# Webhook を設定していないリポジトリも 15 分ごとに HEAD を確認して再分析
JOB="${SERVICE}-poll"
SCHED_ARGS=(--location "$REGION" --schedule "*/15 * * * *" --uri "${URL}/api/cron/poll" --http-method POST)
if gcloud scheduler jobs describe "$JOB" --location "$REGION" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$JOB" "${SCHED_ARGS[@]}" --update-headers "X-Cron-Token=${CRON_TOKEN}"
else
  gcloud scheduler jobs create http "$JOB" "${SCHED_ARGS[@]}" --headers "X-Cron-Token=${CRON_TOKEN}"
fi

echo
echo "Backend URL : ${URL}"
echo "Vercel の環境変数 BACKEND_URL=${URL} を設定してフロントエンドをデプロイしてください"
echo "APP_SECRET / CRON_TOKEN は再デプロイ時も同じ値を渡してください (APP_SECRET を変えると保存済みトークンが復号できません)"
echo "APP_SECRET=${APP_SECRET}"
echo "CRON_TOKEN=${CRON_TOKEN}"
