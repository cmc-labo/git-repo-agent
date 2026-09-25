import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata: Metadata = {
  title: "Git Repository Agent",
  description: "リポジトリを継続的に観測し、競合を分析し、次にやるべきことを更新し続ける開発支援エージェント",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
