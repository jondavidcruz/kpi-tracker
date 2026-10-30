// 🧹🏗 DirectREI control (Jon 2026-10-29) — owner-only. Run the weekly cleanup + the developer
// push from here, so no CRON_SECRET is ever needed (Vercel hides env values). API-direct, no CSV.
import { getCurrentUser, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { directReiConfigured, directReiBlastConfigured } from "@/lib/directrei";
import { REASON_LABEL, PLAN_CAPS, CONTACT_CAP, type CleanReason } from "@/lib/directrei-cleanup";
import { directReiScanAction, directReiRunCleanupAction, directReiPushDevsAction } from "@/app/actions";
import { Card } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";
const CAP = CONTACT_CAP;

export default async function DirectReiPage({ searchParams }: { searchParams: Promise<{ cleaned?: string; pushed?: string; notarmed?: string; err?: string; atcap?: string; capped?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Owner only</h1></div>;
  }
  const configured = directReiConfigured();
  const armed = directReiBlastConfigured();
  const row = await db.resource.findFirst({ where: { category: "__drei_cleanup_scan__" } }).catch(() => null);
  let scan: { at?: string; count?: number | null; scan?: { scanned: number; toDelete: unknown[]; review: Array<{ name: string; phone: string; email: string; status: string; why: string }>; byReason: Record<CleanReason, number>; statusHistogram: Record<string, number>; sampleKeys?: string[]; sample?: Array<Record<string, unknown>> } } | null = null;
  try { scan = row?.description ? JSON.parse(row.description) : null; } catch { scan = null; }
  const s = scan?.scan;
  const count = scan?.count ?? null;
  const pct = count != null ? Math.min(100, Math.round((count / CAP) * 100)) : null;
  const gaugeColor = pct == null ? "bg-slate-300" : pct >= 95 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <Link href="/admin" className="text-xs font-bold text-slate-400 hover:text-slate-600">← Admin</Link>
        <h1 className="mt-1 text-xl font-bold text-slate-800">📣 DirectREI control</h1>
        <p className="mt-1 text-sm text-slate-500">DirectREI is our mass-marketing tool. Clean out dead leads to stay under the {CAP.toLocaleString()} cap, and push researched developers into the <b>unvetted buyers</b> campaign — all API-direct, no CSV.</p>
      </div>
      {!configured && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">⚠️ DIRECTREI_API_KEY isn&apos;t set — reads/writes are off.</div>}
      {sp.cleaned && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">✓ Removed {sp.cleaned} contacts.{sp.notarmed ? " (Delete is NOT armed — set DIRECTREI_WRITE=1; nothing was deleted.)" : ""}</div>}
      {sp.pushed && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">✓ Pushed {sp.pushed} developers to the unvetted buyers campaign.{sp.notarmed ? " (Writes NOT armed — set DIRECTREI_WRITE=1.)" : ""}{sp.capped ? ` ${sp.capped} held back — at the ${CAP.toLocaleString()} contact cap; run a cleanup to free room.` : ""}</div>}
      {sp.atcap && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-200">⚠️ At the {CAP.toLocaleString()} contact cap — nothing pushed. Run a cleanup first to free room.</div>}
      {sp.err && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">⚠️ {decodeURIComponent(sp.err)}</div>}

      {/* 🛡 Capacity guardrail */}
      <Card className="p-4">
        <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-800">🛡 Account capacity</span>{!armed && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">writes off (DIRECTREI_WRITE=1 to arm)</span>}</div>
        <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${gaugeColor}`} style={{ width: `${pct ?? 0}%` }} /></div>
        <div className="mt-1 text-[12px] text-slate-500">{count != null ? <><b className={pct != null && pct >= 95 ? "text-red-600" : "text-slate-700"}>{count.toLocaleString()}</b> / {CAP.toLocaleString()} contacts{pct != null && pct >= 90 ? " — near the cap, run a cleanup" : ""}</> : "Run a scan to read the count."}</div>
        {/* 📋 Starter-plan caps (reference) — the other limits to respect */}
        <div className="mt-3 border-t border-slate-100 pt-2">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Starter plan — other caps to respect</div>
          <div className="flex flex-wrap gap-1.5">
            {PLAN_CAPS.filter((c) => c.per === "mo").map((c) => <span key={c.label} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{c.label}: {c.cap}/mo</span>)}
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Heads up: AI sequence messages (25/mo) and e-sign (3/mo) are tight — the unvetted-buyers campaign shouldn&apos;t lean on AI sequences. Monthly counters reset the 1st.</p>
        </div>
      </Card>

      {/* 🧹 Cleanup */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold text-slate-800">🧹 Weekly cleanup</div>
        <p className="text-[12px] text-slate-500">Removes <b>opted-out · bad contact info · not interested · email bounced · email-is-a-guess · duplicates (same phone/email)</b>. Anything <b>qualified / interested / replied</b> is never deleted — it&apos;s held for manual review.</p>
        <form action={directReiScanAction} className="mt-2 inline-block"><button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">🔍 Scan now (dry run)</button></form>
        {s && (
          <div className="mt-3 space-y-2">
            <div className="text-[12px] text-slate-500">Scanned <b>{s.scanned.toLocaleString()}</b> · last run {scan?.at ? new Date(scan.at).toLocaleString() : "—"}</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(REASON_LABEL) as CleanReason[]).map((k) => <span key={k} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">{REASON_LABEL[k]}: {s.byReason[k] ?? 0}</span>)}
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">⏸ held for review: {s.review.length}</span>
            </div>
            <div className="rounded-xl bg-rose-50/60 p-2.5 ring-1 ring-rose-100">
              <div className="text-[13px] font-extrabold text-rose-800">{s.toDelete.length.toLocaleString()} to delete</div>
              <form action={directReiRunCleanupAction} className="mt-1.5 flex items-center gap-2">
                <input type="hidden" name="max" value="80" />
                <button disabled={!armed || s.toDelete.length === 0} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">🗑 Delete up to 80 now</button>
                {!armed && <span className="text-[11px] text-slate-400">arm writes first</span>}
              </form>
            </div>
            {/* 🔎 the real status values — so we can confirm the rules match DirectREI's labels */}
            <details className="text-[12px]">
              <summary className="cursor-pointer font-bold text-slate-500">Status values seen ({Object.keys(s.statusHistogram).length})</summary>
              <div className="mt-1 flex flex-wrap gap-1">{Object.entries(s.statusHistogram).sort((a, b) => b[1] - a[1]).map(([st, n]) => <span key={st} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{st}: {n}</span>)}</div>
            </details>
            {/* 🔬 Raw API sample — if the counts look wrong, copy this to Claude to fix the field mapping. */}
            {s.sample && s.sample.length > 0 && (
              <details className="text-[12px]">
                <summary className="cursor-pointer font-bold text-indigo-600">🔬 Raw API sample — copy this to Claude if counts look wrong</summary>
                <div className="mt-1 text-[11px] text-slate-500">Fields the API returns: <span className="font-mono">{(s.sampleKeys ?? []).join(", ")}</span></div>
                <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] leading-relaxed text-slate-100">{JSON.stringify(s.sample, null, 2)}</pre>
              </details>
            )}
            {s.review.length > 0 && (
              <details className="text-[12px]">
                <summary className="cursor-pointer font-bold text-amber-700">⏸ {s.review.length} held for manual review (qualified / interested / replied)</summary>
                <div className="mt-1 space-y-1">{s.review.slice(0, 40).map((r, i) => <div key={i} className="rounded bg-amber-50/60 px-2 py-1 text-[11px]"><b>{r.name}</b> · {r.phone || r.email} · <span className="text-slate-500">{r.status} — matched: {r.why}</span></div>)}</div>
              </details>
            )}
          </div>
        )}
      </Card>

      {/* 🏗 Developer push */}
      <Card className="p-4">
        <div className="mb-1 text-sm font-bold text-slate-800">🏗 Push researched developers → unvetted buyers</div>
        <p className="text-[12px] text-slate-500">Adds the new unvetted developers from the <b>DS: Developers</b> kanban into the DirectREI <b>unvetted buyers</b> campaign (email / call / SMS), formatted to your template, deduped. Owner name + company are scrubbed from any copy.</p>
        <form action={directReiPushDevsAction} className="mt-2 inline-block"><button disabled={!armed} className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">🚀 Push developers now</button></form>
        {!armed && <span className="ml-2 text-[11px] text-slate-400">set DIRECTREI_WRITE=1 to enable</span>}
      </Card>
    </div>
  );
}
