"use client";
// 🔗 Attach a Buyer-Network lead (developer / buyer agent) to THIS deal (Jon
// 2026-10-20). Searches the Dispo CRM network and attaches the pick to the deal's
// follow-up tracker — the integration that ties the two together.
import { useState, useEffect, useRef } from "react";
import { attachNetworkBuyerToDeal } from "@/app/crm/actions";

type Hit = { id: string; name: string; phone: string; area: string; buyBox: string; kind: string };

export default function AttachBuyerPanel({ oppId, defaultQuery = "", attachedIds = [] }: { oppId: string; defaultQuery?: string; attachedIds?: string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(defaultQuery);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set(attachedIds));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = async (query: string) => {
    setLoading(true);
    try { const r = await fetch(`/api/dispo/network?q=${encodeURIComponent(query)}`); if (r.ok) setHits((await r.json()).results ?? []); } catch { /* ignore */ }
    setLoading(false);
  };
  useEffect(() => { if (!open) return; if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => search(q), 300); return () => { if (timer.current) clearTimeout(timer.current); }; }, [q, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const attach = async (id: string) => {
    setDone((s) => new Set(s).add(id));
    const fd = new FormData(); fd.set("oppId", oppId); fd.set("networkOppId", id);
    await attachNetworkBuyerToDeal(fd);
  };

  if (!open) {
    return <button onClick={() => setOpen(true)} className="mt-1.5 w-full rounded-lg bg-brand-navy px-2 py-1.5 text-[11px] font-bold text-white hover:bg-brand-navy-700">🔗 Attach from buyer network</button>;
  }
  return (
    <div className="mt-1.5 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="mb-1 flex items-center gap-1">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 search developers + agents by area, name…" className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-[11px]" />
        <button onClick={() => setOpen(false)} className="rounded bg-slate-200 px-1.5 py-1 text-[11px] font-bold text-slate-600">Done</button>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {loading && <div className="py-2 text-center text-[11px] text-slate-400">searching…</div>}
        {!loading && hits.length === 0 && <div className="py-2 text-center text-[11px] text-slate-400">No matches. Type an area or name.</div>}
        {hits.map((h) => (
          <div key={h.id} className="flex items-center gap-2 rounded bg-white px-2 py-1 ring-1 ring-slate-100">
            <span className="text-[11px]" title={h.kind === "buyer_agent" ? "Buyer agent" : "Developer"}>{h.kind === "buyer_agent" ? "🧑‍💼" : "🏗"}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-bold text-slate-800">{h.name}</div>
              <div className="truncate text-[9px] text-slate-500">{[h.area, h.phone].filter(Boolean).join(" · ")}</div>
            </div>
            {done.has(h.id)
              ? <span className="text-[10px] font-bold text-emerald-600">✓ attached</span>
              : <button onClick={() => attach(h.id)} className="shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-emerald-700">+ Attach</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
