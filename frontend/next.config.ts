import type { NextConfig } from "next";

// NEXT_PUBLIC_API_URL is set to the production domain on Vercel so the build
// knows it's deployed and where to proxy API calls.
// Locally, FastAPI serves both the static export and the API on the same port.
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
const forceStaticExport = process.env.PM_FORCE_STATIC_EXPORT === "1";
const isVercel = !forceStaticExport && Boolean(apiUrl);
const rewriteConfig = isVercel
  ? {
      async rewrites() {
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
    }
  : {};

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  ...(isVercel ? {} : { output: "export" }),
  ...rewriteConfig,
};

export default nextConfig;
