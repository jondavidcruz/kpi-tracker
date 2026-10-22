"use client";
// 🔽 Dispo deal-pipeline picker as a DROPDOWN (Jon 2026-10-24: "make it like
// acquisitions — a dropdown you click, not three pills side by side"). Navigates to
// the chosen deal pipeline on the Dispo board.
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Pipe = { name: string; emoji: string; label: string; count: number };

export default function DispoPipeSelect({ pipes, current, q }: { pipes: Pipe[]; current: string; q?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const cur = pipes.find((p) => p.name === current) ?? pipes[0];
  const go = (name: string) => { setOpen(false); const qs = q ? `&q=${encodeURIComponent(q)}` : ""; router.push(`/dispo?tab=deals&dealpl=${encodeURIComponent(name)}${qs}`); };
  if (!cur) return null;
  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-700">
        <span>{cur.emoji}</span>
        <span>{cur.name}</span>
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px] font-bold">{cur.count}</span>
        <span className={`text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-72 overflow-hidden rounded-xl bg-white py-1 shadow-xl ring-1 ring-slate-200">
          {pipes.map((p) => (
            <button key={p.name} type="button" onClick={() => go(p.name)} className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${p.name === cur.name ? "bg-emerald-50 font-bold text-emerald-800" : "text-slate-700"}`}>
              <span>{p.emoji}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{p.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
