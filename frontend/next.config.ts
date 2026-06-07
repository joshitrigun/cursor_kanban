import type { NextConfig } from "next";

// NEXT_PUBLIC_API_URL is set on Vercel so the app knows it's deployed.
// Locally, FastAPI serves both the static export and the API on the same port.
const isVercel = Boolean(process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { output: "export" }),
  async rewrites() {
    if (!isVercel) return [];
    // Next.js server-side rewrites need a full absolute URL to reach /_/backend.
    const base = `https://${process.env.VERCEL_URL}`;
    return [
      {
        source: "/api/:path*",
        destination: `${base}/_/backend/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
