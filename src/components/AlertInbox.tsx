"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveAlert, setAlertStatus, bulkResolveAlerts } from "@/app/actions";
import { REASON_OPTIONS, reasonLabel } from "@/lib/alert-resolution";

export interface AlertView {
  id: string;
  emoji: string;
  message: string;
  friendlyDate: string;
  who: string;
  severity: string; // hard | soft
  behind: string | null; // formatted gap, or null
  repReason: string | null;
  // resolution (resolved tab)
  resolutionCategory: string | null;
  resolutionNote: string | null;
  correctiveAction: string | null;
  resolvedBy: string | null;
  excused: boolean;
  // context
  coachingPrefill: string;
  monthCount: number; // Nth alert this month for this rep+KPI
  pipEligible: boolean;
}

export default function AlertInbox({ alerts, tab }: { alerts: AlertView[]; tab: string }) {
  const canResolve = tab === "open" || tab === "ack";
  const [sel, setSel] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (alerts.length === 0) {
    return <div className="rounded-2xl bg-white p-12 text-center text-slate-400 ring-1 ring-slate-200">No {tab} alerts. 🎉</div>;
  }

  return (
    <div className="space-y-3">
      {canResolve && sel.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-2.5 text-white shadow-lg">
          <span className="text-sm font-semibold">{sel.size} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSel(new Set())} className="text-xs text-slate-300 hover:text-white">Clear</button>
            <form action={bulkResolveAlerts}>
              <input type="hidden" name="mode" value="ids" />
              <input type="hidden" name="ids" value={[...sel].join(",")} />
              <button className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100">
                ✓ Resolve {sel.size} selected
              </button>
            </form>
          </div>
        </div>
      )}

      {alerts.map((a) => {
        const hard = a.severity === "hard";
        return (
          <div key={a.id} className={`rounded-2xl bg-white ring-1 ring-slate-200 border-l-4 ${hard ? "border-l-red-500" : "border-l-amber-400"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 p-4">
              <div className="flex items-start gap-3">
                {canResolve && (
                  <input
                    type="checkbox"
                    checked={sel.has(a.id)}
                    onChange={() => toggle(a.id)}
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                    aria-label="select alert"
                  />
                )}
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${hard ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {hard ? "MONEY KPI" : "ACTIVITY"}
                    </span>
                    {a.monthCount >= 2 && (
                      <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700" title="Times flagged this month for this person + KPI">
                        {ordinal(a.monthCount)} time this month
                      </span>
                    )}
                    {a.pipEligible && (
                      <Link href="/pip" className="rounded-md bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700" title="Missed enough days in a row to start a Performance Improvement Plan">
                        ⚠ PIP-eligible → open a plan
                      </Link>
                    )}
                  </div>
                  <p className="mt-1 font-semibold text-slate-800">{a.emoji} {a.message}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{a.friendlyDate}</span><span>·</span><span>{a.who}</span>
                    {a.behind && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold tabular-nums text-slate-600">gap {a.behind}</span>}
                  </p>
                  {a.repReason && (
                    <p className="mt-2 rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-sky-800 ring-1 ring-sky-100">
                      <strong>{a.who.split(" ")[0]} says:</strong> {a.repReason}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 gap-2">
                {tab === "open" && <StatusBtn id={a.id} to="ack" label="Acknowledge" />}
                {tab === "resolved" && <StatusBtn id={a.id} to="open" label="Reopen" />}
              </div>
            </div>

            {/* Resolved view: show the documented decision */}
            {tab === "resolved" && (a.resolutionCategory || a.resolutionNote || a.correctiveAction) && (
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${a.excused ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                    {a.excused ? "EXCUSED" : reasonLabel(a.resolutionCategory)}
                  </span>
                  {a.resolvedBy && <span className="text-xs text-slate-400">resolved by {a.resolvedBy}</span>}
                </div>
                {a.resolutionNote && <p className="mt-1.5 text-slate-700"><strong>What happened:</strong> {a.resolutionNote}</p>}
                {a.correctiveAction && <p className="mt-1 whitespace-pre-line text-slate-700"><strong>Fix:</strong> {a.correctiveAction}</p>}
              </div>
            )}

            {/* Justify & Resolve form */}
            {canResolve && (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  ✍️ Justify &amp; resolve
                </summary>
                <form action={resolveAlert} className="space-y-3 px-4 pb-4">
                  <input type="hidden" name="id" value={a.id} />
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Reason it was missed</label>
                    <select name="resolutionCategory" defaultValue="" required className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                      <option value="" disabled>Pick a reason…</option>
                      {REASON_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">What happened</label>
                    <textarea name="resolutionNote" rows={2} placeholder="Short note for the record…" className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-slate-500">Corrective action <span className="font-normal text-slate-400">(pre-filled from coaching — edit freely)</span></label>
                    <textarea name="correctiveAction" rows={4} defaultValue={a.coachingPrefill} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" />
                  </div>
                  <div className="flex justify-end">
                    <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">✓ Resolve with reason</button>
                  </div>
                </form>
              </details>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBtn({ id, to, label }: { id: string; to: string; label: string }) {
  return (
    <form action={setAlertStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100">{label}</button>
    </form>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
