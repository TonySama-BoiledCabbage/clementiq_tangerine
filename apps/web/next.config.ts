import type { NextConfig } from "next";
import path from "node:path";

const API_TARGET = process.env.API_PROXY_TARGET || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  turbopack: { root: path.join(__dirname, "../..") },
  transpilePackages: ["@clementiq/shared-types"],
  poweredByHeader: false,
  // The dev-mode "N" badge sits bottom-left and would cover the phone tab bar during a live demo.
  devIndicators: false,
  // Same-origin API: the browser calls /api/*, Next proxies to FastAPI (no CORS, no exposed backend URL).
  async rewrites() {
    // Vercel Services routes /api directly to FastAPI; localhost is development-only.
    if (process.env.VERCEL && !process.env.API_PROXY_TARGET) return [];
    return [{ source: "/api/:path*", destination: `${API_TARGET}/api/:path*` }];
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    }];
  },
};

export default nextConfig;
