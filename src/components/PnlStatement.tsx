"use client";
// 📊 The visual, Excel-synced, editable P&L statement (Jon 2026-11-07: "the whole P&L in sync with the
// Excel, more visual and easier to review, and let me rename/hide softwares we no longer use but keep
// the numbers the same"). Renders every month from the synced sheet data (__pnl_data__), with a donut +
// cross-month stacked bars, and an owner "edit labels" mode that renames/hides line items (display only
// — category totals always come from the sheet, so numbers never change).
import { useMemo, useState } from "react";
import { PNL_CATS, lineKey, type PnlMonth, type PnlOverrides, type PnlCat } from "@/lib/pnl-sheet";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const MONTHS3 = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHSF = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const catTotal = (m: PnlMonth, c: PnlCat) => (m[c] as number) || 0;
// hex for the donut (matches the Tailwind bar classes in PNL_CATS)
const CAT_HEX: Record<PnlCat, string> = { payroll: "#6366f1", software: "#0ea5e9", dues: "#f59e0b", realEstate: "#10b981", controllable: "#f43f5e" };

export default function PnlStatement({ months, overrides: initialOverrides, canEdit, year }: {
  months: PnlMonth[]; overrides: PnlOverrides; canEdit: boolean; year: number;
}) {
  const closed = months.filter((m) => m.expenses > 0);
  const [sel, setSel] = useState(() => (closed.length ? months.indexOf(closed[closed.length - 1]) : 0));
  const [editing, setEditing] = useState(false);
  const [ov, setOv] = useState<PnlOverrides>(initialOverrides || {});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const m = months[sel] || months[0];
  const maxMonthExp = Math.max(1, ...months.map((x) => x.expenses));

  const disp = (cat: PnlCat, label: string) => { const o = ov[lineKey(cat, label)]; return { label: o?.label || label, hidden: !!o?.hidden }; };
  function setOverride(cat: PnlCat, label: string, patch: { label?: string; hidden?: boolean }) {
    const k = lineKey(cat, label);
    setOv((prev) => {
      const cur = { ...(prev[k] || {}) };
      if (patch.label !== undefined) { if (patch.label.trim() && patch.label.trim() !== label) cur.label = patch.label.trim(); else delete cur.label; }
      if (patch.hidden !== undefined) { if (patch.hidden) cur.hidden = true; else delete cur.hidden; }
      const next = { ...prev }; if (cur.label || cur.hidden) next[k] = cur; else delete next[k];
      return next;
    });
  }
  async function save() {
    setSaving(true); setSavedMsg("");
    try {
      const r = await fetch("/api/admin/pnl-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ overrides: ov }) });
      const j = await r.json();
      setSavedMsg(j.ok ? "✓ Saved" : `⚠️ ${j.error || "failed"}`);
      if (j.ok) setEditing(false);
    } catch { setSavedMsg("⚠️ Network error"); }
    setSaving(false);
  }

  // Donut arcs for the selected month's expense composition.
  const donut = useMemo(() => {
    const total = m.expenses || 1; const R = 42, C = 2 * Math.PI * R; let off = 0;
    return PNL_CATS.map((c) => { const v = catTotal(m, c.key); const len = (v / total) * C; const seg = { key: c.key, hex: CAT_HEX[c.key], dash: len, off, v }; off += len; return seg; }).filter((s) => s.v > 0);
  }, [m]);

  return (
    <div className="space-y-4">
      {/* Month switcher */}
      <div className="flex flex-wrap items-center gap-1.5">
        {months.map((x, i) => {
          const has = x.expenses > 0 || x.revenue > 0;
          return (
            <button key={x.month} onClick={() => setSel(i)} disabled={!has}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${i === sel ? "bg-brand-navy text-white" : has ? "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50" : "cursor-not-allowed bg-slate-50 text-slate-300"}`}>
              {MONTHS3[Number(x.month.slice(5))]}{!has ? " ·" : ""}
            </button>
          );
        })}
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            {savedMsg && <span className={`text-xs font-semibold ${savedMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{savedMsg}</span>}
            {editing ? (
              <>
                <button onClick={save} disabled={saving} className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700 disabled:opacity-50">{saving ? "Saving…" : "💾 Save labels"}</button>
                <button onClick={() => { setOv(initialOverrides || {}); setEditing(false); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>
              </>
            ) : (
              <button onClick={() => setEditing(true)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">✏️ Edit labels</button>
            )}
          </div>
        )}
      </div>
      {editing && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">Rename a line or hide one you no longer use. This only changes how it reads here — every dollar amount stays exactly as your P&amp;L sheet has it.</div>}

      {/* Headline for the selected month */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-100">
          <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">💵 Income</div>
          <div className="mt-0.5 text-xl font-extrabold tabular-nums text-emerald-700">{usd(m.revenue)}</div>
        </div>
        <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-100">
          <div className="text-[10px] font-bold uppercase tracking-wide text-rose-700">🔻 Expenses</div>
          <div className="mt-0.5 text-xl font-extrabold tabular-nums text-rose-700">{usd(m.expenses)}</div>
        </div>
        <div className={`rounded-xl p-3 ring-1 ${m.netProfit >= 0 ? "bg-brand-navy text-white ring-brand-navy" : "bg-red-600 text-white ring-red-600"}`}>
          <div className="text-[10px] font-bold uppercase tracking-wide opacity-80">{m.netProfit >= 0 ? "✅ Profit" : "⚠️ Loss"}</div>
          <div className="mt-0.5 text-xl font-extrabold tabular-nums">{usd(m.netProfit)}</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Donut — expense composition for the month */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:col-span-2">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Where {MONTHSF[Number(m.month.slice(5))]}&apos;s money went</div>
          {m.expenses > 0 ? (
            <div className="flex items-center gap-4">
              <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0 -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                {donut.map((s) => (
                  <circle key={s.key} cx="50" cy="50" r="42" fill="none" stroke={s.hex} strokeWidth="14"
                    strokeDasharray={`${s.dash} ${2 * Math.PI * 42 - s.dash}`} strokeDashoffset={-s.off} />
                ))}
              </svg>
              <div className="min-w-0 flex-1 space-y-1">
                {PNL_CATS.map((c) => { const v = catTotal(m, c.key); if (!v) return null; return (
                  <div key={c.key} className="flex items-center gap-2 text-[12px]">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
                    <span className="min-w-0 flex-1 truncate text-slate-600">{c.emoji} {c.label}</span>
                    <span className="font-bold tabular-nums text-slate-700">{usd(v)}</span>
                    <span className="w-9 text-right text-[10px] tabular-nums text-slate-400">{Math.round((v / m.expenses) * 100)}%</span>
                  </div>
                ); })}
              </div>
            </div>
          ) : <div className="py-8 text-center text-sm text-slate-400">No expenses recorded for this month.</div>}
        </div>

        {/* Cross-month stacked bars */}
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 lg:col-span-3">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Expenses by month ({year})</div>
          <div className="flex items-end gap-1.5" style={{ height: 150 }}>
            {months.map((x, i) => {
              const h = (x.expenses / maxMonthExp) * 130;
              return (
                <button key={x.month} onClick={() => x.expenses > 0 && setSel(i)} className="flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}
                  title={x.expenses > 0 ? `${MONTHS3[Number(x.month.slice(5))]}: ${usd(x.expenses)}` : ""}>
                  <div className={`flex w-full max-w-7 flex-col-reverse overflow-hidden rounded ${i === sel ? "ring-2 ring-brand-navy ring-offset-1" : ""}`} style={{ height: Math.max(2, h) }}>
                    {PNL_CATS.map((c) => { const v = catTotal(x, c.key); if (!v || !x.expenses) return null; return <div key={c.key} className={c.bar} style={{ height: `${(v / x.expenses) * 100}%` }} />; })}
                  </div>
                  <div className={`mt-1 text-[9px] font-semibold ${i === sel ? "text-brand-navy" : "text-slate-400"}`}>{MONTHS3[Number(x.month.slice(5))]}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {PNL_CATS.map((c) => <span key={c.key} className="flex items-center gap-1 text-[10px] text-slate-500"><span className={`h-2 w-2 rounded-full ${c.dot}`} />{c.label}</span>)}
          </div>
        </div>
      </div>

      {/* Detailed statement for the selected month */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
          <div>
            <div className="text-base font-bold text-slate-800">Profit &amp; Loss</div>
            <div className="text-[11px] text-slate-400">{MONTHSF[Number(m.month.slice(5))]} {year} · from your P&amp;L sheet</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Net</div>
            <div className={`text-lg font-extrabold tabular-nums ${m.netProfit >= 0 ? "text-emerald-700" : "text-red-600"}`}>{usd(m.netProfit)}</div>
          </div>
        </div>

        {/* Income */}
        <div className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Income</div>
        <div className="flex items-center justify-between px-5 py-1.5">
          <span className="text-sm text-slate-700">Net sales</span>
          <span className="text-sm font-bold tabular-nums text-emerald-700">{usd2(m.revenue)}</span>
        </div>

        {/* Expenses by category */}
        <div className="px-5 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">Expenses</div>
        {PNL_CATS.map((c) => {
          const total = catTotal(m, c.key); if (!total) return null;
          const lines = (m.lines || []).filter((l) => l.cat === c.key);
          const pct = m.expenses > 0 ? Math.round((total / m.expenses) * 100) : 0;
          return (
            <div key={c.key}>
              <div className="flex items-center justify-between px-5 py-1.5">
                <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><span className={`h-2 w-2 rounded-full ${c.dot}`} />{c.emoji} {c.label}</span>
                <span className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{pct}%</span><span className="text-sm font-bold tabular-nums text-slate-800">{usd2(total)}</span></span>
              </div>
              {lines.map((l, idx) => {
                const d = disp(c.key, l.label);
                if (!editing && d.hidden) return null;
                return (
                  <div key={idx} className={`flex items-center gap-3 px-5 py-1 pl-9 ${d.hidden ? "opacity-40" : ""}`}>
                    {editing ? (
                      <>
                        <input defaultValue={d.label} onChange={(e) => setOverride(c.key, l.label, { label: e.target.value })} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[13px] text-slate-600" />
                        <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={d.hidden} onChange={(e) => setOverride(c.key, l.label, { hidden: e.target.checked })} /> hide</label>
                        <span className="w-20 text-right text-[13px] tabular-nums text-slate-400">{usd2(l.actual)}</span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-slate-600">{d.label}</span>
                        <span className="w-24 text-right text-[13px] tabular-nums text-slate-500">{usd2(l.actual)}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Totals */}
        <div className="flex items-center justify-between border-y border-slate-100 bg-slate-50/60 px-5 py-2">
          <span className="text-sm font-bold text-slate-700">Total expenses</span>
          <span className="text-sm font-extrabold tabular-nums text-rose-700">{usd2(m.expenses)}</span>
        </div>
        <div className={`flex items-center justify-between px-5 py-3 ${m.netProfit >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
          <span className="text-base font-extrabold text-slate-800">Net income</span>
          <span className={`text-lg font-extrabold tabular-nums ${m.netProfit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{usd2(m.netProfit)}</span>
        </div>
      </div>
    </div>
  );
}
