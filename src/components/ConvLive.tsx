"use client";
// 🔄 Live Conversations (crm-enhancer 2026-10-20): the team inbox is a server
// page, so a seller's reply only showed up after a manual reload. This polls
// the open thread every 8s (and the inbox badge every 20s) while the tab is
// visible and calls router.refresh() when something new landed — the server
// re-renders, the composer's draft (client state) survives.
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function ConvLive({ cid, lastAt }: { cid: string; lastAt: string }) {
  const router = useRouter();
  const busy = useRef(false);
  // inbox baseline = the first count we fetch; a change (new unread or someone
  // cleared one) re-renders the list. Own baseline, not the server's number —
  // the API scopes slightly differently and would otherwise never agree.
  const base = useRef<number | null>(null);
  useEffect(() => {
    let stop = false;
    const refresh = () => { if (!busy.current) { busy.current = true; router.refresh(); setTimeout(() => { busy.current = false; }, 4000); } };
    const thread = async () => {
      if (stop || !cid || document.visibilityState === "hidden") return;
      try {
        const r = await fetch(`/api/crm/unread?thread=${encodeURIComponent(cid)}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { history?: { at: string }[] };
        const newest = j.history?.length ? j.history[j.history.length - 1].at : "";
        if (newest && newest > lastAt) refresh();
      } catch { /* next tick */ }
    };
    const inbox = async () => {
      if (stop || document.visibilityState === "hidden") return;
      try {
        const r = await fetch("/api/crm/unread", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { count?: number };
        if (typeof j.count !== "number") return;
        if (base.current === null) { base.current = j.count; return; }
        if (j.count !== base.current) { base.current = j.count; refresh(); }
      } catch { /* next tick */ }
    };
    const t1 = setInterval(thread, 8_000);
    const t2 = setInterval(inbox, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") { thread(); inbox(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(t1); clearInterval(t2); document.removeEventListener("visibilitychange", onVis); };
  }, [cid, lastAt, router]);
  return null;
}
