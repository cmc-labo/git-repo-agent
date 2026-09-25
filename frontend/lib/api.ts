export type Status = "todo" | "in_progress" | "done" | "dropped";

export interface Repo {
  id: string;
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string | null;
  is_private: boolean;
  default_branch: string | null;
  last_analyzed_sha: string | null;
  last_analyzed_at: string | null;
  competitors_updated_at: string | null;
  status: "idle" | "queued" | "analyzing" | "error";
  pending_reanalysis: number;
  error: string | null;
  has_token: boolean;
  language: string | null;
  webhook_url?: string;
  webhook_secret?: string;
  tasks_total?: number;
  tasks_done?: number;
  tasks_in_progress?: number;
}

export interface Insight {
  summary: string;
  product_category: string;
  target_users: string;
  tech_stack: string[];
  implemented_features: string[];
  development_phase: string;
  health_notes: string[];
  search_keywords: string[];
}

export interface AppliedChange {
  type: "created" | "status" | "rescored";
  task_id: string;
  title: string;
  from: string | null;
  to: string | null;
  reason: string;
}

export interface Changes {
  summary: string;
  progress_assessment: string;
  next_actions: string[];
  applied: AppliedChange[];
  diff_commits: number;
  demo: boolean;
}

export interface Analysis {
  id: string;
  trigger: string;
  head_sha: string | null;
  base_sha: string | null;
  status: string;
  tasks_total: number;
  tasks_done: number;
  tasks_in_progress: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  insight: Insight | null;
  changes: Changes | null;
}

export interface Competitor {
  name: string;
  kind: string;
  url: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  feature_gap: string[];
  threat_level: number;
}

export interface CompetitorAnalysis {
  market_overview: string;
  competitors: Competitor[];
  differentiation: string[];
  tech_trends: string[];
  sources: { title: string; url: string }[];
  github_similar: { full_name: string; html_url: string; description: string; stars: number; language: string | null }[];
}

export interface Task {
  id: string;
  repo_id: string;
  milestone_id: string | null;
  title: string;
  description: string | null;
  category: string;
  urgency: number;
  importance: number;
  effort_days: number;
  score: number;
  status: Status;
  rationale: string | null;
  evidence: string | null;
  depends_on: string[];
  source: "agent" | "user";
  status_locked: boolean;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  title: string;
  goal: string | null;
  order_index: number;
}

export interface RoadmapTask {
  id: string;
  title: string;
  status: Status;
  category: string;
  score: number;
  effort_days: number;
  start: string;
  end: string;
  lane: number | null;
}

export interface Roadmap {
  start: string;
  end: string;
  today: string;
  lanes: number;
  milestones: { id: string; title: string; goal: string | null; start: string; end: string; progress: number; tasks: RoadmapTask[] }[];
}

export interface Progress {
  by_status: Record<string, number>;
  by_category: Record<string, { total: number; done: number }>;
  effort_total: number;
  effort_done: number;
  percent: number;
  history: { started_at: string; tasks_total: number; tasks_done: number; tasks_in_progress: number; trigger: string; head_sha: string | null }[];
}

export interface EventItem {
  id: number;
  kind: string;
  message: string;
  created_at: string;
}

export interface AppConfig {
  demo_mode: boolean;
  model: string;
  backend: string;
  db: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = await res.json();
      msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail ?? j);
    } catch {}
    throw new Error(msg);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  config: () => req<AppConfig>("/config"),
  repos: () => req<Repo[]>("/repos"),
  createRepo: (repo: string, language: string, token?: string) =>
    req<Repo>("/repos", { method: "POST", body: JSON.stringify({ repo, language, token: token || null }) }),
  repo: (id: string) =>
    req<{ repo: Repo; latest_analysis: Analysis | null; competitors: CompetitorAnalysis | null }>(`/repos/${id}`),
  deleteRepo: (id: string) => req<void>(`/repos/${id}`, { method: "DELETE" }),
  updateRepo: (id: string, body: { token?: string; language?: string }) =>
    req<Repo>(`/repos/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  analyze: (id: string, competitors = false) =>
    req<{ started: boolean; queued: boolean }>(`/repos/${id}/analyze`, {
      method: "POST",
      body: JSON.stringify({ competitors }),
    }),
  analyses: (id: string) => req<Analysis[]>(`/repos/${id}/analyses`),
  events: (id: string) => req<EventItem[]>(`/repos/${id}/events`),
  tasks: (id: string) => req<{ tasks: Task[]; milestones: Milestone[] }>(`/repos/${id}/tasks`),
  createTask: (id: string, body: Partial<Task>) =>
    req<Task>(`/repos/${id}/tasks`, { method: "POST", body: JSON.stringify(body) }),
  patchTask: (taskId: string, body: Partial<Task>) =>
    req<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(body) }),
  roadmap: (id: string) => req<Roadmap>(`/repos/${id}/roadmap`),
  progress: (id: string) => req<Progress>(`/repos/${id}/progress`),
};

export function quadrant(t: { urgency: number; importance: number }): 1 | 2 | 3 | 4 {
  // 1-5 の尺度で 4 以上を「高」とみなす (アイゼンハワーマトリクス)
  const urgent = t.urgency >= 4;
  const important = t.importance >= 4;
  if (urgent && important) return 1;
  if (important) return 2;
  if (urgent) return 3;
  return 4;
}
