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

  const [view, setView] = useState<"statement" | "budget">("statement");
  const disp = (cat: PnlCat, label: string) => { const o = ov[lineKey(cat, label)]; return { label: o?.label || label, hidden: !!o?.hidden, cut: !!o?.cut, oneTime: !!o?.oneTime }; };
  function setOverride(cat: PnlCat, label: string, patch: { label?: string; cut?: boolean; oneTime?: boolean; hidden?: boolean }) {
    const k = lineKey(cat, label);
    setOv((prev) => {
      const cur = { ...(prev[k] || {}) };
      if (patch.label !== undefined) { if (patch.label.trim() && patch.label.trim() !== label) cur.label = patch.label.trim(); else delete cur.label; }
      if (patch.cut !== undefined) { if (patch.cut) cur.cut = true; else delete cur.cut; }
      if (patch.oneTime !== undefined) { if (patch.oneTime) cur.oneTime = true; else delete cur.oneTime; }
      if (patch.hidden !== undefined) { if (patch.hidden) cur.hidden = true; else delete cur.hidden; }
      const next = { ...prev }; if (cur.label || cur.cut || cur.oneTime || cur.hidden) next[k] = cur; else delete next[k];
      return next;
    });
  }
  // Count of lines marked cut (for the header chip).
  const cutCount = Object.values(ov).filter((o) => o?.cut).length;

  // Go-forward run-rate: the latest closed month's expenses minus anything marked ✂️ cut or 1× one-time
  // — i.e. what it actually costs to keep running now, vs the trailing-3-mo burn (which lags the cuts).
  const runRate = useMemo(() => {
    const latest = closed[closed.length - 1];
    if (!latest) return null;
    let cut = 0, one = 0;
    for (const l of latest.lines || []) { const o = ov[lineKey(l.cat, l.label)]; if (o?.cut) cut += l.actual; else if (o?.oneTime) one += l.actual; }
    const closed3 = closed.slice(-3);
    const burn = closed3.length ? closed3.reduce((s, x) => s + x.expenses, 0) / closed3.length : latest.expenses;
    return { month: latest.month, base: latest.expenses, cut, one, go: Math.max(0, latest.expenses - cut - one), burn };
  }, [closed, ov]);

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
      {/* Go-forward run-rate */}
      {runRate && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-2xl bg-gradient-to-r from-emerald-50 to-sky-50 p-4 ring-1 ring-emerald-100">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">🏃 Go-forward run-rate</div>
            <div className="text-2xl font-extrabold tabular-nums text-emerald-700">{usd(runRate.go)}<span className="text-sm font-semibold text-emerald-400">/mo</span></div>
            <div className="text-[11px] text-slate-500">{MONTHS3[Number(runRate.month.slice(5))]} actual {usd(runRate.base)}{runRate.cut > 0 ? ` − ${usd(runRate.cut)} cut` : ""}{runRate.one > 0 ? ` − ${usd(runRate.one)} one-time` : ""}</div>
          </div>
          <div className="text-sm text-slate-600">
            <div>vs trailing-3-mo burn <b className="tabular-nums text-rose-600">{usd(runRate.burn)}</b>/mo</div>
            {runRate.go < runRate.burn && <div className="font-semibold text-emerald-600">↓ {usd(runRate.burn - runRate.go)}/mo lighter — ~{usd((runRate.burn - runRate.go) * 12)}/yr</div>}
          </div>
          <span className="ml-auto max-w-xs text-[11px] text-slate-400">Burn is a 3-month average, so it lags your cuts. Mark ✂️ cut / 1× one-time in <b>Edit labels</b> and this updates.</span>
        </div>
      )}

      {/* View toggle + edit controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-bold">
          {([["statement", "📋 Statement"], ["budget", "🎯 Budget vs Actual"]] as const).map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 ${view === v ? "bg-white text-brand-navy shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>{lbl}</button>
          ))}
        </div>
        {canEdit && (
          <div className="ml-auto flex items-center gap-2">
            {savedMsg && <span className={`text-xs font-semibold ${savedMsg.startsWith("✓") ? "text-emerald-600" : "text-red-600"}`}>{savedMsg}</span>}
            {editing ? (
              <>
                <button onClick={save} disabled={saving} className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700 disabled:opacity-50">{saving ? "Saving…" : "💾 Save"}</button>
                <button onClick={() => { setOv(initialOverrides || {}); setEditing(false); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>
              </>
            ) : (
              <>
                {cutCount > 0 && <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600 ring-1 ring-rose-200">✂️ {cutCount} cut</span>}
                <button onClick={() => setEditing(true)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">✏️ Edit labels</button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Month switcher (statement + budget views) */}
      {(
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
        </div>
      )}
      {editing && <div className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">Rename a line, mark it <b>✂️ cut</b> (struck-through, tracks what you dropped), <b>1× one-time</b> (non-recurring, e.g. the Prague rent), or <b>hide</b> it. Only changes how it reads — every dollar stays exactly as your P&amp;L sheet has it.</div>}

      {/* ═══ BUDGET VS ACTUAL ═══ */}
      {view === "budget" && (() => {
        const rows = PNL_CATS.map((c) => { const a = catTotal(m, c.key); const b = (m.budget?.[c.key] ?? 0); return { c, a, b, d: a - b }; });
        const budTot = rows.reduce((s, r) => s + r.b, 0);
        const maxv = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
        return (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-800">{MONTHSF[Number(m.month.slice(5))]} — budget vs actual</div>
              <div className="text-xs text-slate-500">Budget <b className="tabular-nums text-slate-600">{usd(budTot)}</b> · Actual <b className="tabular-nums text-rose-600">{usd(m.expenses)}</b> · <b className={`tabular-nums ${m.expenses <= budTot ? "text-emerald-600" : "text-red-600"}`}>{m.expenses <= budTot ? "under" : "over"} {usd(Math.abs(m.expenses - budTot))}</b></div>
            </div>
            <div className="space-y-2.5">
              {rows.map(({ c, a, b, d }) => (
                <div key={c.key}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-700"><span className={`h-2 w-2 rounded-full ${c.dot}`} />{c.emoji} {c.label}</span>
                    <span className="tabular-nums text-slate-500">budget {usd(b)} · actual <b className="text-slate-800">{usd(a)}</b> · <span className={d <= 0 ? "font-bold text-emerald-600" : "font-bold text-red-600"}>{d <= 0 ? "−" : "+"}{usd(Math.abs(d))}</span></span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${(b / maxv) * 100}%` }} title={`budget ${usd(b)}`} />
                      <div className={`absolute inset-y-0 left-0 rounded-full ${c.bar} opacity-80`} style={{ width: `${(a / maxv) * 100}%`, height: 6, top: 2 }} title={`actual ${usd(a)}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><span className="h-2 w-4 rounded-full bg-slate-300" /> budget (your sheet)</span>
              <span className="flex items-center gap-1"><span className="h-1.5 w-4 rounded-full bg-indigo-500" /> actual</span>
              <span className="ml-auto">Budget = the “Projected” column in your P&amp;L (prior-month run-rate).</span>
            </div>
          </div>
        );
      })()}

      {/* ═══ STATEMENT (default) ═══ */}
      {view === "statement" && (<>
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
                        <label className={`flex items-center gap-1 text-[11px] ${d.cut ? "font-bold text-rose-600" : "text-slate-400"}`}><input type="checkbox" checked={d.cut} onChange={(e) => setOverride(c.key, l.label, { cut: e.target.checked })} /> ✂️ cut</label>
                        <label className={`flex items-center gap-1 text-[11px] ${d.oneTime ? "font-bold text-amber-600" : "text-slate-400"}`}><input type="checkbox" checked={d.oneTime} onChange={(e) => setOverride(c.key, l.label, { oneTime: e.target.checked })} /> 1×</label>
                        <label className="flex items-center gap-1 text-[11px] text-slate-400"><input type="checkbox" checked={d.hidden} onChange={(e) => setOverride(c.key, l.label, { hidden: e.target.checked })} /> hide</label>
                        <span className="w-20 text-right text-[13px] tabular-nums text-slate-400">{usd2(l.actual)}</span>
                      </>
                    ) : (
                      <>
                        <span className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] ${d.cut ? "text-slate-400 line-through" : "text-slate-600"}`}>{d.label}{d.cut && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-600 no-underline">✂️ CUT</span>}{d.oneTime && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600 no-underline">1× ONE-TIME</span>}</span>
                        <span className={`w-24 text-right text-[13px] tabular-nums ${d.cut ? "text-slate-400 line-through" : "text-slate-500"}`}>{usd2(l.actual)}</span>
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
      </>)}
    </div>
  );
}
