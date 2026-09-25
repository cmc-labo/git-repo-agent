"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, Repo } from "@/lib/api";
import { RepoStatus } from "@/components/StatusBadge";
import Hero from "@/components/Hero";
import GeoBackground from "@/components/GeoBackground";
import Turnstile from "@/components/Turnstile";
import { useI18n } from "@/lib/i18n";
import { findLanguage } from "@/lib/i18n/languages";
import { errorText } from "@/lib/errors";
import { track } from "@/lib/analytics";

export default function Home() {
  const router = useRouter();
  const { t, lang, fmtDate } = useI18n();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ボット対策: Turnstile を通過したトークン (1 回使い切り). 送信後は resetKey で再検証する
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  // 1 ブラウザあたりの登録上限 (デモは含まない). サーバーでも同じ上限を強制している
  const [maxRepos, setMaxRepos] = useState(5);
  useEffect(() => {
    api.config().then((c) => c.max_repos_per_owner && setMaxRepos(c.max_repos_per_owner)).catch(() => {});
  }, []);
  const ownCount = repos?.filter((r) => r.is_owner && !r.is_demo).length ?? 0;

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
    if (!repoInput.trim() || !captcha) return;
    if (ownCount >= maxRepos) {
      setError(t("err.repo_limit_reached", { max: maxRepos }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.createRepo(repoInput.trim(), lang || "en", token.trim() || undefined, captcha);
      track("register_repository", { private: !!token.trim(), language: lang || "en" });
      router.push(`/repos/${r.id}`);
    } catch (err) {
      setError(errorText(err, t, { max: maxRepos }));
      setBusy(false);
      setCaptchaReset((n) => n + 1); // トークンは使用済みなので取り直す
    }
  }

  return (
    <div className="container home">
      <GeoBackground />
      <Hero />
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="section">{t("home.registerTitle")}</h2>
        <p className="muted small" style={{ marginTop: -4 }}>{t("home.registerDesc")}</p>
        <form onSubmit={submit} className="stack">
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input
              placeholder={t("home.placeholder")}
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              disabled={busy}
            />
            <button className="btn primary" disabled={busy || !repoInput.trim() || !captcha} style={{ whiteSpace: "nowrap" }}>
              {busy ? <span className="spinner" /> : "＋"} {t("home.submit")}
            </button>
          </div>
          <div className="row">
            <button type="button" className="btn sm" onClick={() => setShowToken((v) => !v)}>
              {t("home.privateToggle")}
            </button>
            <span className="faint small">{t("home.analysisLanguage", { lang: findLanguage(lang)?.native ?? "English" })}</span>
            {!captcha && <span className="faint small verifying"><span className="spinner" />{t("home.verifying")}</span>}
          </div>
          {showToken && (
            <div>
              <label className="field">{t("home.tokenLabel")}</label>
              <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="github_pat_..." />
              <div className="faint small">{t("home.tokenNote")}</div>
            </div>
          )}
          <Turnstile onToken={setCaptcha} resetKey={captchaReset} />
          <p className="privacy-note">{t("home.privacyNote")}</p>
          {error && <div className="err">{error}</div>}
        </form>
      </div>

      <h2 className="section">
        {t("home.watching")}
        <span className="faint small" style={{ fontWeight: 400 }}>{t("home.repoCount", { n: ownCount, max: maxRepos })}</span>
      </h2>
      {repos?.some((r) => r.is_demo) && <p className="muted small" style={{ marginTop: -6 }}>{t("hero.demoHint")}</p>}
      {repos === null ? (
        <div className="muted"><span className="spinner" /> {t("common.loading")}</div>
      ) : repos.length === 0 ? (
        <div className="card muted">{t("home.empty")}</div>
      ) : (
        <div className="grid cols-3">
          {repos.map((r) => {
            const total = r.tasks_total || 0;
            const pct = total ? Math.round(((r.tasks_done || 0) / total) * 100) : 0;
            return (
              <Link key={r.id} href={`/repos/${r.id}`} className={`card repo-card ${r.is_demo ? "is-demo" : ""}`}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <span className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
                    {r.is_demo && <span className="tag demo">{t("home.demoLabel")}</span>}
                    <span className="title">{r.full_name}</span>
                  </span>
                  <RepoStatus status={r.status} />
                </div>
                <div className="muted small" style={{ minHeight: 40, margin: "6px 0 10px" }}>
                  {r.description || t("home.noDescription")}
                </div>
                <div className="row small muted" style={{ justifyContent: "space-between" }}>
                  <span>{t("home.cardTasks", { done: r.tasks_done, total, ip: r.tasks_in_progress })}</span>
                  <span>{pct}%</span>
                </div>
                <div className="progress" style={{ margin: "6px 0 10px" }}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <div className="row small faint">
                  {r.is_private && <span className="tag">{t("common.private")}</span>}
                  <span>{t("home.cardLastAnalysis", { date: fmtDate(r.last_analyzed_at) })}</span>
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
