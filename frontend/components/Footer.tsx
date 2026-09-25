"use client";

import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <span>© {new Date().getFullYear()} Git Repository Agent</span>
      <span className="sep">·</span>
      <span>{t("footer.developer")}: hpscript</span>
    </footer>
  );
}
