"use client";
// 🔄 Near-real-time board sync (Jon 2026-10-24: "when a lead moves it should show
// on everyone's screen without a refresh — Marie had to reload to see a lead that
// moved 30 min ago"). Soft-refreshes the server data on an interval (React keeps
// client state, so it's not a full page reload) and immediately when the tab is
// re-focused. No websockets — low-risk and works on every board.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter();
  const busy = useRef(false);
  useEffect(() => {
    const refresh = () => {
      // don't fight an open menu/drag or a background tab
      if (document.visibilityState !== "visible") return;
      if (busy.current) return;
      busy.current = true;
      router.refresh();
      setTimeout(() => { busy.current = false; }, 2000);
    };
    const id = setInterval(refresh, Math.max(8, seconds) * 1000);
    const onVis = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [router, seconds]);
  return null;
}
