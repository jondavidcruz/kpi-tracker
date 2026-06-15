import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // HUD statement uploads (PDF/image) on the deal-close flow.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
