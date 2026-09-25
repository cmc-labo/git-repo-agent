"use client";

import { useState } from "react";
import { Repo } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { LANGUAGES } from "@/lib/i18n/languages";

export default function Settings({
  repo, onSaveToken, onSaveLanguage, onDelete,
}: {
  repo: Repo;
  onSaveToken: (token: string) => Promise<void>;
  onSaveLanguage: (language: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [token, setToken] = useState("");
  const [tokenMsg, setTokenMsg] = useState<string | null>(null);
  const [language, setLanguage] = useState(repo.language || "ja");
  const [langMsg, setLangMsg] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const settingsUrl = repo.html_url ? `${repo.html_url}/settings/hooks/new` : null;

  return (
    <>
      <div className="card">
        <h2 className="section">{t("st.webhookTitle")}</h2>
        <p className="small muted" style={{ marginTop: -4 }}>{t("st.webhookDesc")}</p>
        <div className="kv">
          <div>{t("st.payloadUrl")}</div>
          <div className="mono" style={{ wordBreak: "break-all" }}>{repo.webhook_url}</div>
          <div>{t("st.contentType")}</div>
          <div className="mono">application/json</div>
          <div>{t("st.secret")}</div>
          <div className="row">
            <span className="mono">{showSecret ? repo.webhook_secret : "••••••••••••••••"}</span>
            <button className="btn sm" onClick={() => setShowSecret((v) => !v)}>{showSecret ? t("st.hide") : t("st.show")}</button>
          </div>
          <div>{t("st.events")}</div>
          <div className="small">Pushes, Pull requests, Issues, Releases</div>
        </div>
        {settingsUrl && (
          <p style={{ marginBottom: 0 }}>
            <a className="btn sm" href={settingsUrl} target="_blank" rel="noreferrer">{t("st.openGithub")}</a>
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="section">{t("st.langTitle")}</h2>
        <p className="small muted" style={{ marginTop: -4 }}>{t("st.langDesc")}</p>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <select value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.native} — {l.english}</option>
            ))}
          </select>
          <button
            className="btn primary"
            style={{ whiteSpace: "nowrap" }}
            disabled={language === repo.language}
            onClick={async () => {
              await onSaveLanguage(language);
              setLangMsg(t("st.saved"));
            }}
          >
            {t("st.langApply")}
          </button>
        </div>
        {langMsg && <div className="small" style={{ color: "var(--green-dark)", marginTop: 6 }}>{langMsg}</div>}
      </div>

      <div className="card">
        <h2 className="section">{t("st.tokenTitle")}</h2>
        <p className="small muted" style={{ marginTop: -4 }}>
          {t("st.tokenDesc", { state: repo.has_token ? t("st.tokenSet") : t("st.tokenUnset") })}
        </p>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="password" placeholder={t("st.tokenPlaceholder")} value={token} onChange={(e) => setToken(e.target.value)} />
          <button
            className="btn"
            onClick={async () => {
              await onSaveToken(token);
              setToken("");
              setTokenMsg(t("st.saved"));
            }}
          >
            {t("common.save")}
          </button>
        </div>
        {tokenMsg && <div className="small" style={{ color: "var(--green-dark)", marginTop: 6 }}>{tokenMsg}</div>}
      </div>

      {!repo.is_demo && (
      <div className="card">
        <h2 className="section">{t("st.deleteTitle")}</h2>
        <p className="small muted" style={{ marginTop: -4 }}>{t("st.deleteDesc")}</p>
        {confirmDel ? (
          <div className="row">
            <span className="small">{t("st.deleteConfirm")}</span>
            <button className="btn danger" onClick={onDelete}>{t("st.deleteYes")}</button>
            <button className="btn" onClick={() => setConfirmDel(false)}>{t("common.cancel")}</button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setConfirmDel(true)}>{t("st.deleteButton")}</button>
        )}
      </div>
      )}
    </>
  );
}
