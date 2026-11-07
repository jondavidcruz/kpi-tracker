"use client";
import { useState } from "react";

// 📥 Owner-only P&L loader. The real figures can't live in the public repo, so this pastes the parsed
// month JSON straight into the private DB (POST /api/admin/pnl, owner session). Used for the first load
// and any month the monthly sync hands back. Collapsed by default so it doesn't clutter the page.
export default function PnlLoader() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setMsg("");
    let body: unknown;
    try { body = JSON.parse(text); } catch { setMsg("⚠️ That isn't valid JSON — paste the block exactly as given."); setBusy(false); return; }
    try {
      const r = await fetch("/api/admin/pnl", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (j.ok) { setMsg(`✓ Loaded ${j.saved} months for ${j.year}. Refresh to see the numbers.`); setText(""); }
      else setMsg(`⚠️ ${j.error || "failed"}`);
    } catch { setMsg("⚠️ Network error."); }
    setBusy(false);
  }

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm">
      <button onClick={() => setOpen((o) => !o)} className="font-semibold text-slate-600 hover:text-slate-800">{open ? "▾" : "▸"} 📥 Load / update P&amp;L data (owner)</button>
      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-slate-500">Paste the month JSON (from the P&amp;L sheet sync). It saves to the private database — the real numbers never touch the public code.</p>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder='{"year":2026,"asOf":"2026-11-07","months":[{"month":"2026-01","revenue":0,"expenses":0,"payroll":0,...}]}' className="w-full rounded-lg border border-slate-300 p-2 font-mono text-[11px] focus:border-brand-navy focus:outline-none" />
          <div className="flex items-center gap-3">
            <button onClick={load} disabled={busy || !text.trim()} className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-semibold text-white hover:bg-brand-navy-700 disabled:opacity-50">{busy ? "Loading…" : "Load into War Room"}</button>
            {msg && <span className={`text-xs font-semibold ${msg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
