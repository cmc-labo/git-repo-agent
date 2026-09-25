# Git Repository Agent

**An AI agent that continuously watches a GitHub repository, understands where development stands, analyzes competing services, and keeps updating what the team should do next.**

Register a GitHub repository and Gemini reads its code, README, commits, and issues. It researches competitors with Google Search and produces tasks scored by **urgency × importance**, plus a WBS-style roadmap.
After that, every GitHub update (push / merged PR / issue / release) triggers an **automatic diff-based re-analysis**. The agent detects completed tasks, re-prioritizes, and adds new tasks.

Built for the [Google Cloud Japan AI Hackathon vol.5](https://zenn.dev/hackathons/google-cloud-japan-ai-hackathon-vol5).

## Features (MVP)

| Feature | Description |
|---|---|
| Repository understanding | Infers the product summary, tech stack, implemented features, and development phase from the README, file tree, key manifests, commits, and issues |
| Competitor analysis | **Gemini + Google Search Grounding** researches web services, apps, and OSS, and GitHub search adds similar repositories. The output lists strengths, weaknesses, missing features, threat level, differentiation, and tech trends, with source URLs |
| Task prioritization | Eisenhower matrix (urgency × importance) and a 0-100 score, with the agent's rationale for every task |
| Roadmap | WBS and Gantt chart grouped by milestone. Scheduling is automatic and accounts for dependencies, score, team size, and weekends |
| Progress tracking | Kanban (drag & drop), burn-up chart, progress by category, and analysis history |
| Automatic re-analysis | GitHub webhook (HMAC-verified) plus a Cloud Scheduler HEAD check. The agent reads the diff since the last analysis and marks tasks done, started, or dropped, and re-scores them |
| Private repositories | Fine-grained PAT, encrypted at rest |
| Multilingual | 130+ UI languages. Users pick a language on the first visit, and the agent writes its analysis in that language (see below) |

Agent rules:
- A status changed by a human is never overridden by the agent.
- Updates that arrive during an analysis are coalesced into one follow-up run (debounce).
- Competitor research is expensive, so it re-runs only on registration, after 7 days, or on demand.

### Internationalization

- English and Japanese UI dictionaries are bundled. For any other language, Gemini translates the English dictionary into that language the first time someone selects it.
  - The translation is cached in Turso and in the browser, so it is generated only once per language.
  - A missing string, or one with broken `{placeholders}`, falls back to English.
- Each repository has an *analysis output language*: the language Gemini writes summaries, tasks, and competitor analysis in. It defaults to the UI language at registration and can be changed in Settings.
- RTL scripts (Arabic, Hebrew, Persian, Urdu, ...) are laid out right-to-left. Charts keep their left-to-right time and axis orientation.
- `?lang=<code>` in the URL selects a language directly (for example `?lang=fr`).

## Architecture

```
 GitHub ──(webhook: push/PR/issues)──┐
                                     ▼
 Cloud Scheduler ──(every 15 min)──▶ Cloud Run: FastAPI ──▶ Turso (libSQL)
                                     │
                                     ├─ ① Repository understanding   Gemini (Vertex AI), structured output
                                     ├─ ② Competitor analysis         Gemini + Google Search Grounding / GitHub Search
                                     ├─ ③ Planning (initial / diff)   Gemini, structured output → tasks & milestones
                                     └─ UI translation                Gemini, cached per language
                                     ▲
 Browser ── Next.js (Vercel) ──/api/* rewrite──┘
```

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 / React 19 (App Router), Vercel |
| API / Agent | FastAPI (Python), **Cloud Run** |
| AI | **Gemini 2.5 Flash via Vertex AI** (google-genai SDK), Google Search Grounding |
| Database | Turso over its HTTP API (falls back to local SQLite) |

### Hackathon requirements
- Requirement 1 (runtime): the backend and agent run on **Cloud Run**.
- Requirement 2 (Google Cloud AI): **Gemini API via Vertex AI**, plus Google Search Grounding.

## Repository layout

```
backend/
  app/main.py              API routes, webhook, cron, UI translation endpoint
  app/agent/pipeline.py    Agent orchestration (collect → understand → competitors → plan → apply)
  app/agent/prompts.py     Prompts
  app/agent/schemas.py     Schemas for Gemini structured output
  app/agent/llm.py         Gemini client (Vertex AI or API key, Search Grounding)
  app/agent/demo.py        Sample output for running without credentials
  app/github_client.py     Context collection from the GitHub REST API (including diffs)
  app/roadmap.py           WBS / Gantt scheduling
  app/db.py                Turso HTTP / SQLite
  tests/
frontend/
  app/page.tsx             Repository list and registration
  app/repos/[id]/page.tsx  Dashboard (tabs: dashboard / competitors / priorities / roadmap / progress / settings)
  components/
  lib/i18n/                Dictionaries (en, ja), language list, provider
deploy/deploy_backend.sh   Cloud Run + Cloud Scheduler deployment
```

## Running locally

```bash
# backend
cd backend
pip install -r requirements.txt
cp .env.example .env   # edit values; without Gemini credentials set DEMO_MODE=true for sample output
set -a; source .env; set +a
uvicorn app.main:app --reload --port 8000

# frontend (another terminal)
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev   # http://localhost:3000
```

To use Vertex AI locally, run `gcloud auth application-default login` and set `GOOGLE_GENAI_USE_VERTEXAI=true` and `GOOGLE_CLOUD_PROJECT=<project>`.
To receive webhooks locally, expose port 8000 with a tunnel such as `ngrok http 8000`, then set `PUBLIC_BASE_URL` to the tunnel URL.

Tests: `cd backend && python -m pytest -q`

## Deployment

### 1. Turso
```bash
turso db create git-repo-agent
turso db show git-repo-agent --url        # TURSO_DATABASE_URL
turso db tokens create git-repo-agent     # TURSO_AUTH_TOKEN
```
Tables are created, and migrated, automatically on startup.

### 2. Backend (Cloud Run)
```bash
PROJECT_ID=<gcp-project> TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
  ./deploy/deploy_backend.sh
```
The script creates:
- the Cloud Run service
- a service account for Vertex AI
- a Cloud Scheduler job that runs every 15 minutes

Save the printed `APP_SECRET` and `CRON_TOKEN`, and pass the same values on every redeploy. Changing `APP_SECRET` makes stored tokens undecryptable.

### 3. Frontend (Vercel)
1. Import the repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Set the environment variable `BACKEND_URL=<Cloud Run URL>`, with no trailing slash, before the first deploy. The rewrite to the backend is fixed at build time.

### 4. Webhook
Register the Payload URL and Secret shown on the dashboard's **Settings** tab in the GitHub repository under Settings → Webhooks:
- Content type: `application/json`
- Events: Pushes, Pull requests, Issues, Releases

## Known limitations / Phase 2

- There is no authentication; this build is meant for demos. For public operation, separate users (for example with GitHub OAuth) and restrict who can see webhook secrets.
- Analyses run in Cloud Run background tasks, which requires `--no-cpu-throttling`. At larger scale, move them to Cloud Tasks.
- Phase 2: source-code analysis (diff-based, with AST and static analysis), security risk analysis, and packaging as a GitHub App.

## Developer

hpscript
