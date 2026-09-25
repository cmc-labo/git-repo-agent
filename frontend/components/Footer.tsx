"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <span>© {new Date().getFullYear()} Git Repository Agent</span>
      <span className="sep">·</span>
      <Link href="/terms">{t("footer.terms")}</Link>
      <span className="sep">·</span>
      <span>
        {t("footer.developer")}:{" "}
        <a href="https://github.com/cmc-labo" target="_blank" rel="noopener noreferrer">hpscript</a>
      </span>
    </footer>
  );
}
