"use client";
// Zero-click filtering (Jon 2026-10-07): typing searches after a beat,
// dropdown/checkbox changes apply instantly — no Filter button to forget.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Props = {
  base: Record<string, string>; // view, pl, who…
  q: string; stage: string; tag: string; due: boolean;
  stages: Array<{ key: string; label: string }>;
};

export default function CrmFilterBar({ base, q: q0, stage: s0, tag: t0, due: d0, stages }: Props) {
  const router = useRouter();
  const [q, setQ] = useState(q0);
  const [tag, setTag] = useState(t0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const go = (over: Record<string, string>) => {
    const p = new URLSearchParams({ ...base, q, stage: s0, tag, ...(d0 ? { due: "1" } : {}), ...over });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    router.push(`/crm?${p.toString()}`);
  };
  // debounce typing → auto-search
  useEffect(() => {
    if (q === q0 && tag === t0) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({}), 500);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q, tag]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔎 Search name, phone, email, property, tag — filters as you type"
        className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
      />
      <select value={s0} onChange={(e) => go({ stage: e.target.value })} className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
        <option value="">All stages</option>
        {stages.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
      </select>
      <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="tag…" className="w-24 rounded-xl border border-slate-200 px-2 py-2 text-xs" />
      <label className="flex items-center gap-1 text-xs font-semibold text-slate-600">
        <input type="checkbox" checked={d0} onChange={(e) => go({ due: e.target.checked ? "1" : "" })} /> 📞 follow-up due
      </label>
      {(q0 || s0 || t0 || d0) && <button onClick={() => { setQ(""); setTag(""); go({ q: "", stage: "", tag: "", due: "" }); }} className="text-xs font-bold text-slate-400 hover:text-slate-600">✕ clear</button>}
    </div>
  );
}
