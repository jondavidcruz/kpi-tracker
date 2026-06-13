import type { MetadataRoute } from "next";

// Makes the app installable to a phone home screen (Android/Chrome). iOS uses
// the apple-icon + appleWebApp metadata in layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Freedom Offers KPI Tracker",
    short_name: "FO KPIs",
    description: "Daily scorecard with automatic off-target alerts",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b1f3a",
    theme_color: "#0b1f3a",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/icon", sizes: "192x192", type: "image/png" },
    ],
  };
}
