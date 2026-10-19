"use client";

import { useEffect, useState } from "react";

// 🔄 "A new version is available — click to refresh." (Jon 2026-10-19: reps get
// stuck on a stale cached bundle — e.g. Nicholas saw the old "Seller CRM" label
// and missed access grants until a hard refresh.) This polls /api/version and, when
// the deployed git SHA no longer matches the build that rendered this page, shows a
// one-click refresh banner so nobody has to be told to hard-reload.
export default function UpdateBanner({ currentSha }: { currentSha: string }) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // On local/dev there's no real SHA to compare against — don't nag.
    if (!currentSha || currentSha === "local") return;
    let alive = true;

    async function check() {
      try {
        const r = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { sha?: string };
        if (alive && j.sha && j.sha !== "local" && j.sha !== currentSha) setStale(true);
      } catch { /* offline / transient — try again next tick */ }
    }

    const id = setInterval(check, 3 * 60 * 1000); // every 3 min
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    check(); // first check shortly after load
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [currentSha]);

  if (!stale) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[10000] flex justify-center px-3 pb-3">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl ring-1 ring-white/10">
        <span className="text-xl">🔄</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">A new version of the War Room is ready</div>
          <div className="text-xs text-slate-300">Refresh to get the latest pages, access changes, and fixes.</div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 transition hover:bg-amber-400"
        >
          Refresh now
        </button>
      </div>
    </div>
  );
}
