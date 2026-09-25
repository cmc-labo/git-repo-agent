import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import LanguagePicker from "@/components/LanguagePicker";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Git Repository Agent",
  description: "An agent that watches your GitHub repository, analyzes competitors and keeps telling you what to do next.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <TopBar />
          <div className="page">{children}</div>
          <Footer />
          <LanguagePicker />
        </I18nProvider>
      </body>
    </html>
  );
}
