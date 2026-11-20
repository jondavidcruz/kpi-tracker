import Link from "next/link";
import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { Card, SectionTitle } from "@/components/ui";
import { kpiProofsFor, type KpiProof } from "@/lib/kpi-receipts";
import { secondaryPositionOf } from "@/lib/roles";
import { teamTelnyxReconciliation, type KpiReconciliation } from "@/lib/telnyx-billing";

export const dynamic = "force-dynamic";

const hms = (secs: number) => { const m = Math.round(secs / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

const PT_TODAY = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
const shiftDay = (ymd: string, days: number) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const startOfWeek = (ymd: string) => { const d = new Date(ymd + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); }; // Monday
const startOfMonth = (ymd: string) => ymd.slice(0, 8) + "01";
const endOfMonth = (ymd: string) => { const d = new Date(ymd.slice(0, 8) + "01T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };

const RANGES = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "lastweek", label: "Last week" },
  { key: "month", label: "This month" },
  { key: "lastmonth", label: "Last month" },
  { key: "custom", label: "Custom" },
] as const;

/** Resolve a range preset (or custom from/to) → inclusive [from,to] in PT. */
function resolveRange(range: string, from?: string, to?: string): { from: string; to: string; label: string } {
  const today = PT_TODAY();
  switch (range) {
    case "week": return { from: startOfWeek(today), to: today, label: "This week" };
    case "lastweek": { const lw = shiftDay(startOfWeek(today), -7); return { from: lw, to: shiftDay(lw, 6), label: "Last week" }; }
    case "month": return { from: startOfMonth(today), to: today, label: "This month" };
    case "lastmonth": { const lm = shiftDay(startOfMonth(today), -1); return { from: startOfMonth(lm), to: endOfMonth(lm), label: "Last month" }; }
    case "custom": { const f = from || today, t = to || today; return f <= t ? { from: f, to: t, label: "Custom" } : { from: t, to: f, label: "Custom" }; }
    default: return { from: today, to: today, label: "Today" };
  }
}

function statusChip(p: KpiProof) {
  switch (p.status) {
    case "over_reported": return <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">🔴 reported {p.recorded}, records show {p.systemCount}</span>;
    case "under_credited": return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">🟡 records show {p.systemCount}, scorecard has {p.recorded}</span>;
    case "records_only": return <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">ℹ️ {p.systemCount} in records (not on scorecard yet)</span>;
    case "auto": return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 auto-tracked — matches records</span>;
    case "manual": return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">✍️ manual — self-reported{p.recorded != null ? ` (${p.recorded})` : ""}</span>;
    default: return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 matches records</span>;
  }
}

function reconMeta(r: KpiReconciliation) {
  const pct = r.talkRatio != null ? Math.round(r.talkRatio * 100) : null;
  switch (r.status) {
    case "over": return { dot: "🔴", ring: "ring-2 ring-red-200", head: "text-red-700", label: `Over-reported — ${pct}% of carrier talk`, blurb: `The team's logged talk time is HIGHER than Telnyx actually billed. You can't log more talk than the carrier recorded — this gap means padded numbers. Open each rep's audit below to find the source.` };
    case "under": return { dot: "🟡", ring: "ring-2 ring-amber-200", head: "text-amber-700", label: `Under-logged — only ${pct}% of carrier talk`, blurb: `Telnyx billed far more talk than the scorecards captured. Usually means real dialing happening off the scorecard (Direct REI calls not logged) — coverage gap, not dishonesty, but worth closing so the KPIs reflect reality.` };
    case "consistent": return { dot: "🟢", ring: "ring-2 ring-emerald-200", head: "text-emerald-700", label: `Consistent — ${pct}% of carrier talk logged`, blurb: `Logged talk time lines up with what Telnyx actually billed across Direct REI + War Room. The team's call numbers hold up against the carrier truth.` };
    default: return { dot: "⚪", ring: "", head: "text-slate-600", label: "No carrier data for this range", blurb: r.available ? "Telnyx shows no billed calls in this window." : "Telnyx isn't reachable (no API key set) — can't cross-check against the carrier right now." };
  }
}

export default async function KpiAuditPage({ searchParams }: { searchParams: Promise<{ rep?: string; date?: string; range?: string; from?: string; to?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!canAccessCSuite(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">C-suite only</h1>
        <p className="mt-1 text-sm text-slate-500">KPI verification is limited to C-suite members.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const MONEY_ROLES = new Set(["dispositions", "acquisitions", "cc_lm"]);
  const hasMoneyRole = (u: Parameters<typeof secondaryPositionOf>[0] & { position?: string }) =>
    MONEY_ROLES.has(u?.position ?? "") || MONEY_ROLES.has(secondaryPositionOf(u) ?? "");
  // Reps worth auditing: anyone with a money-KPI role (dispo / acquisitions / cc_lm), excluding
  // C-suite/owner (Jon, Viktoriia, Enrico) — they aren't audited here.
  const users = (await getAllUsers()).filter((u) => u.active && hasMoneyRole(u) && !canAccessCSuite(u));
  // Dispo first (their KPIs are the furthest along), then the rest.
  const dispo = users.filter((u) => u.position === "dispositions" || secondaryPositionOf(u) === "dispositions");
  const rep = sp.rep || dispo[0]?.id || users[0]?.id || "";
  const repUser = users.find((u) => u.id === rep) ?? null;
  // Range: a preset (today/week/lastweek/month/lastmonth) or custom from/to. A legacy ?date= still works.
  const rangeKey = sp.range || (sp.date ? "custom" : "today");
  const range = resolveRange(rangeKey, sp.from ?? sp.date, sp.to ?? sp.date);
  const proofs = rep ? await kpiProofsFor(rep, range.from, range.to) : [];
  const flagged = proofs.filter((p) => p.status === "over_reported").length;
  // 🧮 Team-level carrier reconciliation (Telnyx sees BOTH Direct REI + War Room; the per-rep
  // audit below only sees War Room CRM). Talk time is the honesty anchor.
  const recon = await teamTelnyxReconciliation(range.from, range.to, users.map((u) => ({ id: u.id, name: u.name }))).catch(() => null);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <SectionTitle title="🧾 KPI Verification — trust but verify" subtitle="The 💰 Money Movers from each person's scorecard, recomputed straight from the records behind them. Pick a day, week, or month and open any KPI to see the receipts — which cards, which buyers, who, and when. C-suite only." accent={flagged ? "bg-red-500" : "bg-emerald-500"} />

      {/* 🧮 Team carrier reconciliation — Telnyx truth vs what the team reported (talk-time anchor) */}
      {recon && (() => {
        const m = reconMeta(recon);
        const solo = recon.workersLogged.length === 1 ? recon.workersLogged[0] : null;
        return (
          <Card className={`p-4 ${m.ring}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">{m.dot}</span>
              <span className="text-sm font-extrabold text-slate-800">Carrier reconciliation — the whole team vs Telnyx</span>
              <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold ${m.head} bg-slate-50 ring-1 ring-slate-100`}>{m.label}</span>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">Telnyx bills <b>every</b> call on <b>Direct REI + the War Room</b> — the per-rep audit below only sees War Room. <b>Talk time</b> is the anchor: nobody can log more talk than the carrier actually billed. Range: {range.from === range.to ? range.from : `${range.from} → ${range.to}`} (PT).</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Talk · reported</div>
                <div className="mt-0.5 text-lg font-black text-slate-800">{hms(recon.reportedTalkSec)}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Talk · Telnyx</div>
                <div className="mt-0.5 text-lg font-black text-slate-800">{recon.available ? hms(recon.carrierTalkSec) : "—"}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Carrier calls</div>
                <div className="mt-0.5 text-lg font-black text-slate-800">{recon.available ? recon.carrierOutbound.toLocaleString() : "—"}</div>
                <div className="text-[10px] text-slate-400">{recon.carrierConnected} connected</div>
              </div>
            </div>
            <p className={`mt-2 text-[12px] ${m.head}`}>{m.blurb}</p>
            {recon.available && recon.byConnection.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {recon.byConnection.map((ch) => (
                  <span key={ch.name} className="rounded-lg bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 ring-1 ring-slate-100">
                    <b className="text-slate-700">{ch.name}</b> · {ch.outbound} out · {ch.connected} conn · {hms(ch.talkSec)} talk
                  </span>
                ))}
              </div>
            )}
            {solo ? (
              <p className="mt-2.5 rounded-lg bg-indigo-50 px-3 py-1.5 text-[12px] text-indigo-700 ring-1 ring-indigo-100">
                🎯 Only <b>{solo.name}</b> logged activity this range — so <b>all</b> Telnyx usage attributes to them. They reported <b>{hms(solo.talkSec)}</b> talk vs the carrier&apos;s <b>{hms(recon.carrierTalkSec)}</b>.
              </p>
            ) : recon.workersLogged.length > 1 ? (
              <p className="mt-2.5 text-[11px] text-slate-400">{recon.workersLogged.length} people logged activity ({recon.workersLogged.map((w) => `${w.name} ${hms(w.talkSec)}`).join(" · ")}). Telnyx can&apos;t split Direct REI per person (shared login), so this is a team total — on a single-worker day it becomes an exact per-person check.</p>
            ) : null}
          </Card>
        );
      })()}

      {/* Controls */}
      <Card className="p-4 space-y-3">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">Team member</span>
            <select name="rep" defaultValue={rep} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {dispo.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              {/* also allow auditing anyone else */}
              {users.filter((u) => !dispo.some((d) => d.id === u.id)).map((u) => <option key={u.id} value={u.id}>{u.name} ({u.position})</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">Range</span>
            <select name="range" defaultValue={rangeKey} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm">
              {RANGES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">From (custom)</span>
            <input type="date" name="from" defaultValue={range.from} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col text-xs"><span className="mb-0.5 font-semibold text-slate-500">To (custom)</span>
            <input type="date" name="to" defaultValue={range.to} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
          </label>
          <button className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">Check</button>
        </form>
        <div className="flex flex-wrap items-center gap-1 text-[11px]">
          <span className="mr-1 font-semibold text-slate-400">Quick:</span>
          {RANGES.filter((r) => r.key !== "custom").map((r) => (
            <Link key={r.key} href={`/kpi-audit?rep=${rep}&range=${r.key}`} className={`rounded-lg px-2 py-1 font-bold ${rangeKey === r.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{r.label}</Link>
          ))}
        </div>
      </Card>

      {repUser && (
        <div className="text-sm font-semibold text-slate-600">{repUser.name} · <span className="text-slate-400">{range.label}{range.from === range.to ? ` · ${range.from}` : ` · ${range.from} → ${range.to}`} (PT)</span>{flagged > 0 && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{flagged} over-reported</span>}</div>
      )}

      {/* KPI proofs */}
      <div className="space-y-3">
        {proofs.map((p) => (
          <Card key={p.key} className={`p-4 ${p.status === "over_reported" ? "ring-2 ring-red-200" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg">{p.emoji}</span>
              <span className="text-sm font-extrabold text-slate-800">{p.name}</span>
              {p.derivable && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[12px] font-bold text-slate-700">records: {p.systemCount}</span>}
              {p.recorded != null && <span className="text-[11px] text-slate-400">scorecard: {p.recorded}{p.enteredBy ? ` · by ${p.enteredBy}` : ""}</span>}
              <span className="ml-auto">{statusChip(p)}</span>
            </div>
            {p.receipts.length > 0 ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-[12px] font-bold text-indigo-600">🧾 See the {p.receipts.length} receipt{p.receipts.length === 1 ? "" : "s"}</summary>
                <ul className="mt-1.5 space-y-1">
                  {p.receipts.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-x-2 rounded-lg bg-slate-50 px-3 py-1.5 text-[12px]">
                      <span className="font-semibold text-slate-800">{r.label}</span>
                      {r.detail && <span className="text-slate-400">· {r.detail}</span>}
                      <span className="ml-auto text-[11px] text-slate-500">{r.at}</span>
                      {r.oppId && <Link href={`/crm/${r.oppId}`} className="text-[11px] font-semibold text-indigo-600 hover:underline">open →</Link>}
                    </li>
                  ))}
                </ul>
              </details>
            ) : p.derivable ? (
              <p className="mt-1 text-[12px] text-slate-400">No records found for this period{p.recorded ? ` — but ${p.recorded} is on the scorecard. Where did it come from?` : "."}</p>
            ) : (
              <p className="mt-1 text-[12px] text-slate-400">✍️ Self-reported KPI — no system trail to verify against yet{p.recorded ? `. Scorecard shows ${p.recorded}.` : "."}</p>
            )}
          </Card>
        ))}
        {proofs.length === 0 && <Card className="p-6 text-center text-sm text-slate-400">Pick a team member and range to verify their numbers against the records.</Card>}
      </div>

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-600">
        <b className="text-slate-800">How to read this:</b> these are the <b>💰 Money Movers</b> from this person&apos;s scorecard. The <b>records</b> number is recomputed live from what actually happened in the War Room — real <b>conversations</b> (connected calls, not dial attempts), kanban stage-moves to “Vetted,” new cards created, buy-boxes captured, deals sent (DealSend), and offers logged. <b>🟢 auto-tracked</b> means the scorecard pulls that number straight from the records — nobody types it. <b>🔴 over-reported</b> means a manually-entered number is higher than the records support — open the receipts and see what&apos;s really there. <b>✍️ manual</b> KPIs (e.g. Contracts Assigned) have no system trail yet, so their self-reported number is shown but not flagged.
      </Card>
    </div>
  );
}
