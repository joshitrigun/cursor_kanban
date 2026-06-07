import type { NextConfig } from "next";

// NEXT_PUBLIC_API_URL is set when deploying to Vercel (pointing at Railway).
// When not set, the app is built as a static export served directly by FastAPI (local Docker).
const isVercel = Boolean(process.env.NEXT_PUBLIC_API_URL);

const nextConfig: NextConfig = isVercel ? {} : { output: "export" };

export default nextConfig;
