import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve storage images through Vercel's image optimizer: Supabase egress for
  // a 2MB area-map PNG drops to one fetch per size instead of every page view
  // (2026-10-03 Supabase fair-use email — cached egress was the overage).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "maps.googleapis.com" },
    ],
  },
  experimental: {
    // HUD statement uploads (PDF/image) on the deal-close flow.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
