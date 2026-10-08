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
  // Security headers (Jon 2026-10-07 "protect our data"): no embedding in
  // other sites (clickjacking), no MIME sniffing, no referrer leakage, and
  // browsers are told not to cache gated pages on shared machines.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Lets the public /offer form be embedded on freedom-offers.com. CSP frame-ancestors
        // overrides the global X-Frame-Options DENY for this page only.
        source: "/offer",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://freedom-offers.com https://www.freedom-offers.com" },
        ],
      },
    ];
  },
};

export default nextConfig;
