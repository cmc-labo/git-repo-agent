"use client";

import { MessageKey, useI18n } from "@/lib/i18n";

export default function Hero() {
  const { t } = useI18n();
  return (
    <section className="hero">
      <h1 className="hero-title">{t("hero.title")}</h1>
      <p className="hero-lead">{t("hero.lead")}</p>
      <ul className="hero-features">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <li key={n}>{t(`hero.f${n}t` as MessageKey)}</li>
        ))}
      </ul>
    </section>
  );
}
