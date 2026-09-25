"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Language, LANGUAGES, suggestLanguages } from "@/lib/i18n/languages";

export default function LanguagePicker() {
  const { lang, setLang, t, pickerOpen, closePicker, translating, translateError } = useI18n();
  const [q, setQ] = useState("");
  const [suggested, setSuggested] = useState<Language[]>([]);

  useEffect(() => {
    setSuggested(suggestLanguages(navigator.languages?.length ? navigator.languages : [navigator.language]));
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return LANGUAGES;
    return LANGUAGES.filter(
      (l) => l.native.toLowerCase().includes(s) || l.english.toLowerCase().includes(s) || l.code.toLowerCase().startsWith(s),
    );
  }, [q]);

  if (translating) {
    return (
      <div className="lp-overlay">
        <div className="lp-toast"><span className="spinner" /> {t("lp.translating")}</div>
      </div>
    );
  }
  if (!pickerOpen) {
    return translateError ? <div className="lp-error">{t("lp.failed")}</div> : null;
  }

  const button = (l: Language) => (
    <button
      key={l.code}
      className={`lp-item ${lang === l.code ? "active" : ""}`}
      onClick={() => setLang(l.code)}
      dir={l.rtl ? "rtl" : "ltr"}
      lang={l.code}
    >
      <span className="lp-native">{l.native}</span>
      <span className="lp-english">{l.english}</span>
    </button>
  );

  return (
    <div className="lp-overlay" onClick={() => lang && closePicker()}>
      <div className="lp-modal" role="dialog" aria-modal="true" aria-labelledby="lp-title" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <h2 id="lp-title" style={{ margin: 0 }}>🌐 {t("lp.title")}</h2>
          {lang && <button className="btn sm" onClick={closePicker} aria-label={t("common.close")}>✕</button>}
        </div>
        <p className="muted small" style={{ margin: "6px 0 14px" }}>{t("lp.subtitle")}</p>
        <input autoFocus placeholder={t("lp.search")} value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="lp-scroll">
          {!q && suggested.length > 0 && (
            <>
              <div className="lp-section">{t("lp.suggested")}</div>
              <div className="lp-grid">{suggested.map(button)}</div>
              <div className="lp-section">{t("lp.all")}</div>
            </>
          )}
          <div className="lp-grid">{filtered.map(button)}</div>
          {filtered.length === 0 && <div className="muted small" style={{ padding: 12 }}>{t("lp.noMatch")}</div>}
        </div>
        <p className="faint small" style={{ margin: "10px 0 0" }}>{t("lp.autoNote")}</p>
      </div>
    </div>
  );
}
