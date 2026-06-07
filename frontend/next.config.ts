import type { NextConfig } from "next";

// When deployed on Vercel, NEXT_PUBLIC_API_URL is set and the backend
// runs as a separate service at /_/backend. In that case we use SSR mode
// (no static export) and rewrite /api/* to /_/backend/api/*.
// Locally the FastAPI server serves both the static export and the API.
const isVercel = Boolean(process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "export" }),
  async rewrites() {
    if (!isVercel) return [];
    return [
      {
        source: "/api/:path*",
        destination: "/_/backend/api/:path*",
      },
    ];
  },
};

export default nextConfig;
