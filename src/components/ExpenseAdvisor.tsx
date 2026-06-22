"use client";

import { useState } from "react";

/** "Cut the fat" — sends the live P&L to an AI CFO and returns ranked cost-cuts. */
export default function ExpenseAdvisor({ data }: { data: string }) {
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");

  async function run() {
    setLoading(true);
    setReply("");
    try {
      const res = await fetch("/api/expense-advisor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data }) });
      const j = await res.json();
      setReply(j.reply ?? j.error ?? "No response.");
    } catch {
      setReply("Couldn't reach the advisor — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl bg-brand-navy p-4 text-white ring-1 ring-brand-navy">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-base font-bold">💡 Cut the fat</div>
          <div className="text-xs text-white/60">AI CFO reviews your live P&amp;L and ranks exactly what to cut, downgrade, or consolidate.</div>
        </div>
        <button onClick={run} disabled={loading} className="rounded-lg bg-brand-gold px-4 py-2 text-sm font-bold text-brand-navy hover:opacity-90 disabled:opacity-50">{loading ? "Analyzing…" : "Get cut-the-fat ideas →"}</button>
      </div>
      {(loading || reply) && (
        <div className="mt-3 rounded-xl bg-white p-4 text-sm text-slate-700">
          {loading ? <span className="text-slate-400">Reviewing your numbers…</span> : <div className="whitespace-pre-wrap leading-relaxed">{reply}</div>}
        </div>
      )}
    </div>
  );
}
