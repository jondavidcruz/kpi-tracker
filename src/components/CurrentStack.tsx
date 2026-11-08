"use client";
// 🧾 Current Stack — the editable, go-forward monthly cost model (Jon 2026-11-07). Edit ANY price,
// rename, delete a cancelled tool, add a new line, split payroll per-person, pause someone (maternity).
// This is the TRUE current cost from November forward — the Excel history below stays untouched. Drives a
// go-forward burn / runway / break-even + a cut simulator ("what if I cut this person / tool?").
import { useMemo, useState } from "react";
import { PNL_CATS, type PnlCat } from "@/lib/pnl-sheet";
import { stackTotal, stackByCat, newId, type StackItem, type StackStore } from "@/lib/pnl-stack";

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Seed = { cat: PnlCat; label: string; amount: number; person?: boolean };

export default function CurrentStack({ initial, peopleSeed, monthSeed, canEdit, trailingBurn, cash, avgFee }: {
  initial: StackStore;
  peopleSeed: Seed[];
  monthSeed: { month: string; items: Seed[] };
  canEdit: boolean;
  trailingBurn: number;
  cash: number;
  avgFee: number;
}) {
  const [items, setItems] = useState<StackItem[]>(initial.items || []);
  const [editing, setEditing] = useState(false);
  const [sim, setSim] = useState(false);
  const [cut, setCut] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [seededFrom, setSeededFrom] = useState(initial.seededFrom);

  const monthName = (() => { const n = Number(monthSeed.month.slice(5)); return ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][n] || monthSeed.month; })();

  // Live totals. Full = everything active; sim excludes checked rows.
  const fullCost = useMemo(() => stackTotal(items), [items]);
  const simCost = useMemo(() => stackTotal(items, { excludeIds: cut }), [items, cut]);
  const shown = sim ? simCost : fullCost;
  const savings = fullCost - simCost;
  const runway = cash > 0 && shown > 0 ? cash / shown : null;
  const dealsBE = avgFee > 0 ? shown / avgFee : 0;
  const pausedCost = useMemo(() => items.filter((i) => i.paused).reduce((s, i) => s + (Number(i.amount) || 0), 0), [items]);

  function patch(id: string, p: Partial<StackItem>) { setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it))); }
  function del(id: string) { setItems((prev) => prev.filter((it) => it.id !== id)); setCut((c) => { const n = new Set(c); n.delete(id); return n; }); }
  function add(cat: PnlCat) { setItems((prev) => [...prev, { id: newId(), cat, label: "", amount: 0 }]); }
  function toggleCut(id: string) { setCut((c) => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  function seed() {
    const next: StackItem[] = [];
    for (const s of peopleSeed) next.push({ id: newId(), cat: s.cat, label: s.label, amount: Math.round(s.amount), person: true });
    for (const s of monthSeed.items) next.push({ id: newId(), cat: s.cat, label: s.label, amount: Math.round(s.amount * 100) / 100 });
    setItems(next);
    setSeededFrom(monthSeed.month);
    setEditing(true);
    setMsg("Seeded from " + monthName + " — now edit prices & delete anything you've cancelled, then Save.");
  }

  async function save() {
    setSaving(true); setMsg("");
    try {
      const r = await fetch("/api/admin/pnl-stack", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items, seededFrom }) });
      const j = await r.json();
      setMsg(j.ok ? "✓ Saved" : `⚠️ ${j.error || "failed"}`);
      if (j.ok) setEditing(false);
    } catch { setMsg("⚠️ Network error"); }
    setSaving(false);
  }

  const byCat = useMemo(() => stackByCat(items), [items]);
  const empty = items.length === 0;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-extrabold text-slate-800">🧾 Current Stack — what you actually pay now</div>
          <div className="text-[11px] text-slate-400">Your true go-forward monthly cost (Nov&nbsp;→). Edit any price, delete what you cancelled, split payroll per person. The Excel history below stays as-is.{seededFrom ? ` · seeded from ${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(seededFrom.slice(5))] || seededFrom}` : ""}</div>
        </div>
        {canEdit && !empty && (
          <div className="flex items-center gap-2">
            {msg && <span className={`text-xs font-semibold ${msg.startsWith("✓") ? "text-emerald-600" : msg.startsWith("⚠️") ? "text-red-600" : "text-slate-500"}`}>{msg}</span>}
            <button onClick={() => { setSim((s) => !s); setCut(new Set()); }} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${sim ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>🧪 {sim ? "Stop simulating" : "Simulate cuts"}</button>
            {editing ? (
              <>
                <button onClick={save} disabled={saving} className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700 disabled:opacity-50">{saving ? "Saving…" : "💾 Save"}</button>
                <button onClick={() => { setItems(initial.items || []); setEditing(false); setMsg(""); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200">Cancel</button>
              </>
            ) : (
              <button onClick={() => { setEditing(true); setSim(false); }} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">✏️ Edit</button>
            )}
          </div>
        )}
      </div>

      {empty ? (
        <div className="rounded-xl bg-slate-50 p-6 text-center ring-1 ring-slate-200">
          <div className="text-sm font-semibold text-slate-600">Build your true current cost in one click.</div>
          <div className="mx-auto mt-1 max-w-md text-[12px] text-slate-400">Starts from {monthName}&apos;s real numbers (payroll split per person), then you edit the prices and delete anything you&apos;ve cancelled — so this reflects what you actually pay now, not the old tools the Excel still lists all year.</div>
          {canEdit ? (
            <button onClick={seed} className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700">📥 Start from {monthName}&apos;s numbers</button>
          ) : <div className="mt-2 text-[12px] text-slate-400">Jon hasn&apos;t set the current stack yet.</div>}
        </div>
      ) : (
        <>
          {/* Go-forward tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl bg-indigo-50 p-4 ring-1 ring-indigo-100">
              <div className="text-[11px] font-bold uppercase tracking-wide text-indigo-700">{sim ? "🧪 Simulated cost" : "🧾 True monthly cost"}</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-indigo-700">{usd(shown)}<span className="text-sm font-semibold text-indigo-300">/mo</span></div>
              <div className="text-[11px] text-slate-400">{trailingBurn > shown ? <span className="font-semibold text-emerald-600">↓ {usd(trailingBurn - shown)}/mo vs Excel burn</span> : `${usd(trailingBurn)}/mo Excel trailing`}</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-600">🏃 Cost to run</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-slate-800">{usd(shown * 12)}<span className="text-sm font-semibold text-slate-400">/yr</span></div>
              <div className="text-[11px] text-slate-400">at this stack</div>
            </div>
            <div className={`rounded-xl p-4 ring-1 ${runway == null ? "bg-slate-50 ring-slate-200" : runway < 3 ? "bg-red-50 ring-red-200" : runway < 6 ? "bg-amber-50 ring-amber-200" : "bg-emerald-50 ring-emerald-200"}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wide ${runway == null ? "text-slate-500" : runway < 3 ? "text-red-700" : runway < 6 ? "text-amber-700" : "text-emerald-700"}`}>🛟 Runway</div>
              <div className={`mt-1 text-2xl font-extrabold tabular-nums ${runway == null ? "text-slate-400" : runway < 3 ? "text-red-700" : runway < 6 ? "text-amber-700" : "text-emerald-700"}`}>{runway == null ? "—" : runway >= 24 ? "24+ mo" : `${runway.toFixed(1)} mo`}</div>
              <div className="text-[11px] text-slate-400">{cash > 0 ? "cash ÷ this stack" : "set cash on hand ↑"}</div>
            </div>
            <div className="rounded-xl bg-brand-navy p-4 text-white ring-1 ring-brand-navy">
              <div className="text-[11px] font-bold uppercase tracking-wide opacity-80">🎯 Break even</div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums">{dealsBE.toFixed(1)}<span className="text-sm font-semibold opacity-70"> deals/mo</span></div>
              <div className="text-[11px] opacity-80">@ {usd(avgFee)}/deal</div>
            </div>
          </div>

          {sim && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-amber-50 px-4 py-2 text-[13px] ring-1 ring-amber-200">
              <span className="font-bold text-amber-700">🧪 Simulator on</span>
              <span className="text-slate-600">Check any person or tool to see the effect. Cutting {cut.size} {cut.size === 1 ? "line" : "lines"} saves <b className="tabular-nums text-emerald-700">{usd(savings)}/mo</b> = <b className="tabular-nums text-emerald-700">{usd(savings * 12)}/yr</b>.</span>
              {runway != null && savings > 0 && <span className="text-slate-600">New runway <b className="tabular-nums">{runway >= 24 ? "24+" : runway.toFixed(1)} mo</b>.</span>}
            </div>
          )}
          {pausedCost > 0 && !sim && (
            <div className="mt-3 rounded-xl bg-sky-50 px-4 py-2 text-[13px] text-sky-800 ring-1 ring-sky-200">🍼 <b>{usd(pausedCost)}/mo paused</b> (e.g. maternity leave) — already excluded from the numbers above. Un-pause in Edit when they return.</div>
          )}
          {editing && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200">Edit any price or name, 🗑 delete what you cancelled, <b>+ Add</b> a new line, mark someone <b>🍼 paused</b> (maternity — excluded until they return). Save when done.</div>}

          {/* Editable list by category */}
          <div className="mt-4 space-y-3">
            {PNL_CATS.map((c) => {
              const rows = byCat[c.key] || [];
              if (!rows.length && !editing) return null;
              const catTot = rows.reduce((s, it) => s + (it.paused ? 0 : (cut.has(it.id) ? 0 : Number(it.amount) || 0)), 0);
              return (
                <div key={c.key} className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
                  <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                    <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700"><span className={`h-2 w-2 rounded-full ${c.dot}`} />{c.emoji} {c.label}{c.key === "payroll" && <span className="ml-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600">per person</span>}</span>
                    <span className="text-[11px] text-slate-400">{rows.filter((r) => !r.paused).length} active · <b className="tabular-nums text-slate-600">{usd(catTot)}</b>/mo</span>
                  </div>
                  {rows.map((it) => {
                    const isCut = cut.has(it.id);
                    return (
                      <div key={it.id} className={`flex items-center gap-2 px-3 py-1.5 ${it.paused ? "bg-sky-50/40" : ""} ${isCut ? "bg-amber-50/50" : ""}`}>
                        {sim && !editing && <input type="checkbox" checked={isCut} onChange={() => toggleCut(it.id)} title="Simulate cutting this" className="accent-amber-500" />}
                        {editing ? (
                          <>
                            <input value={it.label} onChange={(e) => patch(it.id, { label: e.target.value })} placeholder="name…" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-[13px] text-slate-700" />
                            <label className={`flex items-center gap-1 text-[10px] ${it.person ? "font-bold text-indigo-600" : "text-slate-400"}`} title="Is this a team member?"><input type="checkbox" checked={!!it.person} onChange={(e) => patch(it.id, { person: e.target.checked })} />👤</label>
                            <label className={`flex items-center gap-1 text-[10px] ${it.paused ? "font-bold text-sky-600" : "text-slate-400"}`} title="Paused (maternity / leave) — excluded from cost"><input type="checkbox" checked={!!it.paused} onChange={(e) => patch(it.id, { paused: e.target.checked })} />🍼</label>
                            <div className="flex items-center rounded border border-slate-200 bg-white"><span className="pl-1.5 text-[11px] text-slate-400">$</span><input value={it.amount || ""} onChange={(e) => patch(it.id, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} inputMode="decimal" className="w-20 bg-transparent px-1 py-1 text-right text-[13px] font-bold tabular-nums focus:outline-none" /></div>
                            <button onClick={() => del(it.id)} className="rounded px-1.5 py-1 text-[12px] text-slate-300 hover:bg-red-50 hover:text-red-500" title="Delete">🗑</button>
                          </>
                        ) : (
                          <>
                            <span className={`flex min-w-0 flex-1 items-center gap-1.5 text-[13px] ${it.paused || isCut ? "text-slate-400 line-through" : "text-slate-700"}`}>
                              {it.label || <span className="italic text-slate-300">unnamed</span>}
                              {it.person && <span className="rounded bg-indigo-50 px-1 py-0.5 text-[9px] font-bold text-indigo-500 no-underline">👤</span>}
                              {it.paused && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-700 no-underline">🍼 PAUSED</span>}
                              {isCut && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 no-underline">✂️ CUT</span>}
                            </span>
                            <span className={`w-24 text-right text-[13px] font-bold tabular-nums ${it.paused || isCut ? "text-slate-400 line-through" : "text-slate-700"}`}>{usd2(it.amount)}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {editing && <button onClick={() => add(c.key)} className="w-full border-t border-slate-100 bg-slate-50/60 px-4 py-1.5 text-left text-[12px] font-semibold text-slate-500 hover:bg-slate-100">+ Add a {c.label.toLowerCase()} line</button>}
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
            <span className="text-sm font-bold text-slate-700">True monthly run cost</span>
            <span className="text-lg font-extrabold tabular-nums text-indigo-700">{usd2(shown)}<span className="text-xs font-semibold text-slate-400">/mo</span></span>
          </div>
        </>
      )}
    </div>
  );
}
