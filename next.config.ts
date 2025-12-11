import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Matikan ESLint selama proses build (Vercel)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
