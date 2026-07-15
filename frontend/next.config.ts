import type { NextConfig } from "next";

// FastAPI serves the statically exported Next.js build from frontend/out/.
// Always use static export; API calls go to the same origin (no proxy needed).
const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  output: "export",
};

export default nextConfig;
