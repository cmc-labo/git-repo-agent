"use client";

import { MessageKey, useI18n } from "@/lib/i18n";

export function TaskStatus({ status }: { status: string }) {
  const { t } = useI18n();
  return <span className={`status ${status}`}>{t(`status.${status}` as MessageKey)}</span>;
}

export function RepoStatus({ status }: { status: string }) {
  const { t } = useI18n();
  const busy = status === "queued" || status === "analyzing";
  return (
    <span className={`status ${status}`}>
      {busy && "⟳ "}
      {t(`repoStatus.${status}` as MessageKey)}
    </span>
  );
}

export function Score({ value }: { value: number }) {
  const { t } = useI18n();
  const cls = value >= 75 ? "s-high" : value >= 55 ? "s-mid" : "s-low";
  return <span className={`score ${cls}`} title={t("score.tooltip")}>{value}</span>;
}
