import type { NextConfig } from "next";

// ブラウザからは同一オリジンの /api/* を叩き、Next.js が Cloud Run の FastAPI に中継する
const backend = process.env.BACKEND_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
