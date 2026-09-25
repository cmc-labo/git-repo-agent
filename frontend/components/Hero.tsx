"use client";

import { MessageKey, useI18n } from "@/lib/i18n";

const FEATURES = ["🔎", "🏁", "🎯", "🗺️", "📊", "🔄"];

export default function Hero() {
  const { t } = useI18n();
  return (
    <section className="hero">
      <h1 className="hero-title">{t("hero.title")}</h1>
      <p className="hero-lead">{t("hero.lead")}</p>
      <ul className="hero-features">
        {FEATURES.map((ico, i) => (
          <li key={i}>
            <span aria-hidden>{ico}</span>
            {t(`hero.f${i + 1}t` as MessageKey)}
          </li>
        ))}
      </ul>
    </section>
  );
}
