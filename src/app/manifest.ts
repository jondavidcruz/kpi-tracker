import type { MetadataRoute } from "next";

// 📱 The installable War Room (iPhone home-screen app). display: standalone
// gives the full-screen app feel; NO offline caching exists anywhere (the
// service worker is push-only) so installed apps always load fresh builds.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Freedom Offers War Room",
    short_name: "War Room",
    description: "KPIs, seller CRM, calls and texts — the team's second brain.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b1f3a",
    theme_color: "#0b1f3a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
