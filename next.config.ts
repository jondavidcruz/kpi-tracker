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
    // Lead/roster/HUD document uploads — phone photos & scanned PDFs routinely
    // exceed 4mb and were REJECTED by Next before the action ran ("uploads don't
    // work", Jon 2026-10-15). Raised to 16mb to match the 15MB in-action guard.
    serverActions: { bodySizeLimit: "16mb" },
  },
  // Security headers (Jon 2026-10-07 "protect our data"): no embedding in
  // other sites (clickjacking), no MIME sniffing, no referrer leakage, and
  // browsers are told not to cache gated pages on shared machines.
  async headers() {
    return [
      {
        // Everything EXCEPT the owner-only Member Preview (?viewas) stays frame-DENY.
        source: "/(.*)",
        missing: [{ type: "query", key: "viewas" }],
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
        ],
      },
      {
        // Member Preview: owner embeds a teammate's real screen in the preview pane.
        // Allow SAME-ORIGIN framing for ?viewas requests only (CSP frame-ancestors
        // 'self' takes precedence over X-Frame-Options in modern browsers).
        source: "/(.*)",
        has: [{ type: "query", key: "viewas" }],
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
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
          { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://freedom-offers.com https://www.freedom-offers.com https://uland.postking.app" },
        ],
      },
    ];
  },
};

export default nextConfig;
