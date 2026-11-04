"use client";
// 📊 Fires one tiny page-view beacon per route — but only ONCE per path per day per user
// (localStorage-deduped), to keep Supabase egress negligible (Jon 2026-11-04). Feeds the
// owner-only usage report at /admin/usage so "what's unused" is data, not a guess.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function UsageBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    try {
      const day = new Date().toISOString().slice(0, 10);
      const key = `fo_uv_${day}`;
      let seen: string[] = [];
      try { seen = JSON.parse(localStorage.getItem(key) || "[]"); } catch { seen = []; }
      if (seen.includes(pathname)) return;               // already counted today
      seen.push(pathname);
      try { localStorage.setItem(key, JSON.stringify(seen.slice(-300))); } catch { /* quota */ }
      // drop stale day-keys so localStorage doesn't grow
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith("fo_uv_") && k !== key) localStorage.removeItem(k);
        }
      } catch { /* ignore */ }
      const sent = typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function"
        ? navigator.sendBeacon("/api/usage/track", new Blob([pathname], { type: "text/plain" }))
        : false;
      if (!sent) fetch("/api/usage/track", { method: "POST", body: pathname, keepalive: true }).catch(() => {});
    } catch { /* analytics must never break navigation */ }
  }, [pathname]);
  return null;
}
