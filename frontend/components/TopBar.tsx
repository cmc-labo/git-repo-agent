"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, AppConfig } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { findLanguage } from "@/lib/i18n/languages";

export default function TopBar() {
  const { t, lang, openPicker } = useI18n();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg(null));
  }, []);
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">GA</span>
        <span className="brand-text">Git Repository Agent</span>
      </Link>
      <span className="spacer" />
      {cfg && (
        cfg.demo_mode ? (
          <span className="pill warn" title={t("top.demoTooltip")}>{t("top.demo")}</span>
        ) : (
          <span className="pill hide-sm">{cfg.backend}</span>
        )
      )}
      <button className="lang-btn" onClick={openPicker} title={t("top.language")}>
        🌐 {findLanguage(lang)?.native ?? "Language"}
      </button>
    </header>
  );
}
