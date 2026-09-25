"use client";

import { MessageKey, useI18n } from "@/lib/i18n";

const FEATURES = [
  { ico: "🔎", n: 1 },
  { ico: "🏁", n: 2 },
  { ico: "🎯", n: 3 },
  { ico: "🗺️", n: 4 },
  { ico: "📊", n: 5 },
  { ico: "🔄", n: 6 },
] as const;

export default function Hero() {
  const { t } = useI18n();
  return (
    <section className="hero">
      <span className="hero-badge">{t("hero.badge")}</span>
      <h1 className="hero-title">{t("hero.title")}</h1>
      <p className="hero-lead">{t("hero.lead")}</p>

      <div className="hero-features">
        {FEATURES.map((f) => (
          <div key={f.n} className="hero-feature">
            <div className="hero-ico" aria-hidden>{f.ico}</div>
            <div>
              <div className="hero-ft">{t(`hero.f${f.n}t` as MessageKey)}</div>
              <div className="hero-fd">{t(`hero.f${f.n}d` as MessageKey)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="hero-steps">
        <span className="hero-steps-title">{t("hero.stepsTitle")}</span>
        {([1, 2, 3] as const).map((n) => (
          <span key={n} className="hero-step">
            <span className="hero-step-n">{n}</span>
            {t(`hero.step${n}` as MessageKey)}
          </span>
        ))}
      </div>
    </section>
  );
}
