import type { NextConfig } from "next";

// NEXT_PUBLIC_API_URL is set to the production domain on Vercel so the build
// knows it's deployed and where to proxy API calls.
// Locally, FastAPI serves both the static export and the API on the same port.
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const isVercel = Boolean(apiUrl);

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  ...(isVercel ? {} : { output: "export" }),
  async rewrites() {
    if (!isVercel) return [];
    // Proxy /api/* to the backend service at /_/backend on the production domain.
    // Must use an absolute URL — Next.js server-side rewrites to a relative
    // /_/backend path don't traverse Vercel's edge routing.
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/_/backend/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
