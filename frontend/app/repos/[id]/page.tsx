"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Analysis, api, CompetitorAnalysis, EventItem, Milestone, Progress, Repo, Roadmap as RoadmapT, Status, Task,
} from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { errorText } from "@/lib/errors";
import { RepoStatus } from "@/components/StatusBadge";
import Overview from "@/components/Overview";
import Competitors from "@/components/Competitors";
import Priority from "@/components/Priority";
import Roadmap from "@/components/Roadmap";
import ProgressView from "@/components/ProgressView";
import Settings from "@/components/Settings";
import TaskDrawer, { TaskDraft } from "@/components/TaskDrawer";

const TABS = [
  { key: "overview", ico: "▦" },
  { key: "competitors", ico: "◎" },
  { key: "priority", ico: "▤" },
  { key: "roadmap", ico: "▬" },
  { key: "progress", ico: "☑" },
  { key: "settings", ico: "⚙" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function RepoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t, fmtDate } = useI18n();
  const [tab, setTab] = useState<TabKey>("overview");
  const [repo, setRepo] = useState<Repo | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [competitors, setCompetitors] = useState<CompetitorAnalysis | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapT | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ task: Task | null } | null>(null);
  const lastSeen = useRef<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [r, t, rm, p, ev, an] = await Promise.all([
        api.repo(id), api.tasks(id), api.roadmap(id), api.progress(id), api.events(id), api.analyses(id),
      ]);
      setRepo(r.repo);
      setAnalysis(r.latest_analysis);
      setCompetitors(r.competitors);
      setTasks(t.tasks);
      setMilestones(t.milestones);
      setRoadmap(rm);
      setProgress(p);
      setEvents(ev);
      setAnalyses(an);
      lastSeen.current = `${r.repo.status}|${r.repo.last_analyzed_at}|${ev[0]?.id ?? ""}`;
      setError(null);
    } catch (e) {
      setError(errorText(e, t));
    }
  }, [id, t]);

  // 軽いポーリング: 状態やイベントが変わったら全体を再取得 (Webhook による自動再分析を画面に反映)
  const poll = useCallback(async () => {
    try {
      const [r, ev] = await Promise.all([api.repo(id), api.events(id)]);
      const sig = `${r.repo.status}|${r.repo.last_analyzed_at}|${ev[0]?.id ?? ""}`;
      setRepo(r.repo);
      setEvents(ev);
      if (sig !== lastSeen.current) await loadAll();
    } catch {}
  }, [id, loadAll]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ?tab=roadmap のようなディープリンクに対応
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && TABS.some((t) => t.key === q)) setTab(q as TabKey);
  }, []);
  function selectTab(k: TabKey) {
    setTab(k);
    window.history.replaceState(null, "", `?tab=${k}`);
  }

  const busy = repo?.status === "queued" || repo?.status === "analyzing";
  useEffect(() => {
    const t = setInterval(poll, busy ? 3000 : 15000);
    return () => clearInterval(t);
  }, [poll, busy]);

  async function reanalyze(withCompetitors = false) {
    await api.analyze(id, withCompetitors);
    await poll();
  }

  async function saveTask(d: TaskDraft) {
    if (drawer?.task) {
      await api.patchTask(drawer.task.id, {
        title: d.title, description: d.description, status: d.status, urgency: d.urgency,
        importance: d.importance, effort_days: d.effort_days, milestone_id: d.milestone_id,
      });
    } else {
      await api.createTask(id, d);
    }
    await loadAll();
  }

  async function moveTask(t: Task, s: Status) {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: s } : x)));
    await api.patchTask(t.id, { status: s });
    await loadAll();
  }

  if (error && !repo) return <div className="container"><div className="err">{error}</div></div>;
  if (!repo) return <div className="container muted"><span className="spinner" /> {t("common.loading")}</div>;

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="proj">
          <div className="name">{repo.full_name}</div>
          <div className="sub">{repo.is_private ? `🔒 ${t("common.private")}` : t("common.public")} · {repo.default_branch}</div>
        </div>
        {TABS.map((x) => (
          <button key={x.key} className={`nav-item ${tab === x.key ? "active" : ""}`} onClick={() => selectTab(x.key)}>
            <span className="ico">{x.ico}</span>
            {t(`tab.${x.key}`)}
          </button>
        ))}
      </nav>

      <main className="main">
        <div className="page-head">
          <h1>{t(`tab.${tab}`)}</h1>
          <RepoStatus status={repo.status} />
          {repo.pending_reanalysis ? <span className="tag">{t("repo.pending")}</span> : null}
          <span className="spacer" />
          <span className="small muted">
            {t("repo.lastAnalysis", { date: fmtDate(repo.last_analyzed_at) })}
            {repo.last_analyzed_sha && <span className="mono"> @{repo.last_analyzed_sha.slice(0, 7)}</span>}
          </span>
          {repo.html_url && <a className="btn sm" href={repo.html_url} target="_blank" rel="noreferrer">{t("common.github")}</a>}
          <button className="btn primary" onClick={() => reanalyze(false)} disabled={busy}>
            {busy ? <span className="spinner" /> : "⟳"} {busy ? t("repo.analyzing") : t("repo.reanalyze")}
          </button>
        </div>
        {repo.status === "error" && repo.error && <div className="err" style={{ marginBottom: 14 }}>{t("repo.lastError", { error: repo.error })}</div>}
        {analysis?.changes?.demo && (
          <div className="notice" style={{ marginBottom: 14 }}>{t("repo.demoNotice")}</div>
        )}

        {tab === "overview" && (
          <Overview repo={repo} analysis={analysis} tasks={tasks} progress={progress} events={events}
            onOpenTask={(t) => setDrawer({ task: t })} />
        )}
        {tab === "competitors" && (
          <Competitors data={competitors} updatedAt={repo.competitors_updated_at} busy={busy} onRefresh={() => reanalyze(true)} />
        )}
        {tab === "priority" && (
          <Priority tasks={tasks} milestones={milestones} onOpenTask={(t) => setDrawer({ task: t })}
            onAddTask={() => setDrawer({ task: null })} />
        )}
        {tab === "roadmap" && (
          <Roadmap data={roadmap} onOpenTask={(tid) => {
            const found = tasks.find((x) => x.id === tid);
            if (found) setDrawer({ task: found });
          }} />
        )}
        {tab === "progress" && (
          <ProgressView tasks={tasks} progress={progress} analyses={analyses}
            onOpenTask={(t) => setDrawer({ task: t })} onMove={moveTask} />
        )}
        {tab === "settings" && (
          <Settings
            repo={repo}
            onSaveToken={async (tok) => { await api.updateRepo(id, { token: tok }); await loadAll(); }}
            onSaveLanguage={async (language) => { await api.updateRepo(id, { language }); await reanalyze(false); await loadAll(); }}
            onDelete={async () => { await api.deleteRepo(id); router.push("/"); }}
          />
        )}
      </main>

      {drawer && (
        <TaskDrawer
          key={drawer.task?.id ?? "new"}
          task={drawer.task}
          milestones={milestones}
          allTasks={tasks}
          onClose={() => setDrawer(null)}
          onSave={saveTask}
        />
      )}
    </div>
  );
}
