"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, AppConfig } from "@/lib/api";

export default function TopBar() {
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  useEffect(() => {
    api.config().then(setCfg).catch(() => setCfg(null));
  }, []);
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="brand-mark">GA</span>
        Git Repository Agent
      </Link>
      <span className="spacer" />
      {cfg && (
        cfg.demo_mode ? (
          <span className="pill warn" title="Gemini の認証情報が未設定のため、サンプル出力で動作しています">DEMO MODE</span>
        ) : (
          <span className="pill">{cfg.model} · {cfg.backend}</span>
        )
      )}
    </header>
  );
}
