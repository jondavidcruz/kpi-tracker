// 💸 Owner-only Telnyx spend tracker (Jon 2026-11-02). Reads the burn rate off the sampled
// balance curve: how often the $100 auto-recharge fires = our real spend. Samples land
// automatically off the dialer heartbeat (~every 18 min during calls) + a daily cron baseline.
import { getCurrentUser, isOwner } from "@/lib/auth";
import { Card } from "@/components/ui";
import { db } from "@/lib/db";
import { snapshotTelnyxBalance, readSnaps, analyzeTelnyxSpend, getTelnyxBalance, telnyxCommsBreakdown } from "@/lib/telnyx-billing";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

async function refreshTelnyxAction() {
  "use server";
  const me = await getCurrentUser();
  if (!isOwner(me)) return;
  await snapshotTelnyxBalance(true).catch(() => {});
  revalidatePath("/admin/telnyx");
}

function money(n: number | null | undefined, currency = "USD") {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
}
function when(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function hm(secs: number) {
  const m = Math.round(secs / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export default async function TelnyxSpendPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">Telnyx spend is limited to the owner.</p>
      </div>
    );
  }

  // Always take a fresh live point on load, then analyze the full curve.
  const live = await snapshotTelnyxBalance(true).catch(() => null) ?? await getTelnyxBalance().catch(() => null);
  const snaps = await readSnaps();
  const r = analyzeTelnyxSpend(snaps);
  const cur = live?.currency ?? "USD";
  const recentRecharges = [...r.recharges].reverse().slice(0, 12);
  const noKey = live === null && snaps.length === 0;

  // 📊 Team comms verification (today, Pacific): carrier-truth counts vs our own CRM logs.
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
  const dayStart = new Date(`${ymd}T00:00:00-08:00`); // PST (Nov); a daily eyeball count
  const comms = await telnyxCommsBreakdown(dayStart.toISOString(), new Date().toISOString()).catch(() => null);
  const wrSms = await db.crmEvent.count({ where: { at: { gte: dayStart }, kind: "sms" } }).catch(() => 0);
  const wrCalls = await db.crmEvent.count({ where: { at: { gte: dayStart }, kind: "call" } }).catch(() => 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-800">💸 Telnyx spend</h1>
          <p className="mt-1 text-sm text-slate-500">Auto-recharge refills to ~$100 when the balance runs out. We sample the live balance and read the spend off the curve — so you can see how fast we burn through it.</p>
        </div>
        <form action={refreshTelnyxAction}>
          <button className="shrink-0 rounded-xl bg-brand-navy px-3 py-2 text-sm font-bold text-white hover:opacity-90">↻ Refresh</button>
        </form>
      </div>

      {noKey && (
        <Card className="p-4 text-sm text-amber-800 ring-1 ring-amber-200">
          ⚠️ No Telnyx balance returned. Check that <code>TELNYX_API_KEY</code> is set in Vercel.
        </Card>
      )}

      {/* Headline tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Balance now</div>
          <div className="mt-0.5 text-2xl font-black text-slate-800">{money(live?.balance ?? r.endBal, cur)}</div>
          {live && live.availableCredit !== live.balance && <div className="text-[11px] text-slate-400">{money(live.availableCredit, cur)} w/ credit</div>}
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Spend / day</div>
          <div className="mt-0.5 text-2xl font-black text-emerald-700">{money(r.perDay, cur)}</div>
          <div className="text-[11px] text-slate-400">{money(r.perWeek, cur)}/wk</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Projected / month</div>
          <div className="mt-0.5 text-2xl font-black text-slate-800">{money(r.perMonth, cur)}</div>
          <div className="text-[11px] text-slate-400">at the current rate</div>
        </Card>
        <Card className="p-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Recharge every</div>
          <div className="mt-0.5 text-2xl font-black text-slate-800">{r.cadenceDays != null ? `${r.cadenceDays}d` : "—"}</div>
          <div className="text-[11px] text-slate-400">{r.rechargeCount} recharge{r.rechargeCount === 1 ? "" : "s"} seen</div>
        </Card>
      </div>

      {/* Window context */}
      <Card className="p-4 text-sm text-slate-600">
        {r.samples < 2 ? (
          <p>📡 Tracking just started — only {r.samples} sample{r.samples === 1 ? "" : "s"} so far. The numbers above fill in as the team dials (we sample the balance automatically during calls) and after the nightly check. Check back in a day or two for a real burn rate.</p>
        ) : (
          <p>
            Over the last <b>{r.windowDays} day{r.windowDays === 1 ? "" : "s"}</b> ({r.samples} samples, {when(r.firstAt)} → {when(r.lastAt)}) we spent about <b>{money(r.totalSpend, cur)}</b> total — roughly <b>{money(r.perDay, cur)}/day</b>. Telnyx has auto-recharged <b>{r.rechargeCount}</b> time{r.rechargeCount === 1 ? "" : "s"}{r.cadenceDays != null ? <> (about once every <b>{r.cadenceDays} days</b>)</> : ""}.
          </p>
        )}
      </Card>

      {/* 📊 Team comms verification — Telnyx carrier truth, split by channel (Jon 2026-11-19) */}
      {comms && (
        <Card className="p-4">
          <div className="text-sm font-extrabold text-slate-800">📊 Comms verification — today</div>
          <p className="mt-1 text-xs text-slate-500">Telnyx bills <b>every</b> text &amp; call that went out or came in — across <b>Direct REI</b> and the <b>War Room CRM</b>, per message segment. This is the carrier ground-truth, split by sending channel.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className="p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Texts (all)</div><div className="mt-0.5 text-2xl font-black text-slate-800">{comms.messages.total.toLocaleString()}</div><div className="text-[11px] text-slate-400">{money(comms.messages.cost, cur)} · in+out</div></Card>
            <Card className="p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Calls (out)</div><div className="mt-0.5 text-2xl font-black text-slate-800">{comms.calls.outbound.toLocaleString()}</div><div className="text-[11px] text-slate-400">{comms.calls.connected} conn · {hm(comms.calls.talkSec)} talk · {money(comms.calls.cost, cur)}</div></Card>
            <Card className="col-span-2 p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">War Room CRM logged</div><div className="mt-0.5 text-sm font-bold text-slate-700">{wrSms.toLocaleString()} texts · {wrCalls.toLocaleString()} calls</div><div className="text-[11px] text-slate-400">the CRM only sees War Room calls — Direct REI calls bill via Telnyx but log outside the CRM</div></Card>
          </div>
          {comms.calls.byConnection.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Call usage by channel {comms.calls.partial && <span className="font-semibold text-amber-600">(top {comms.calls.scanned.toLocaleString()} of {comms.calls.total.toLocaleString()})</span>}</div>
              <div className="mt-1.5 space-y-1">
                {comms.calls.byConnection.map((ch) => (
                  <div key={ch.name} className="flex flex-wrap items-center justify-between gap-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-slate-100">
                    <span className="font-bold text-slate-700">{ch.name}</span>
                    <span className="text-slate-500">{ch.outbound.toLocaleString()} out <span className="text-slate-300">·</span> {ch.connected} conn <span className="text-slate-300">·</span> {hm(ch.talkSec)} talk <span className="text-slate-300">·</span> <b className="text-slate-700">{money(ch.cost, cur)}</b></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {comms.messages.byChannel.length > 0 && (
            <div className="mt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Text usage by channel {comms.messages.partial && <span className="font-semibold text-amber-600">(top {comms.messages.scanned.toLocaleString()} of {comms.messages.total.toLocaleString()} — heavy day)</span>}</div>
              <div className="mt-1.5 space-y-1">
                {comms.messages.byChannel.map((ch) => (
                  <div key={ch.name} className="flex flex-wrap items-center justify-between gap-1 rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-slate-100">
                    <span className="font-bold text-slate-700">{ch.name}</span>
                    <span className="text-slate-500">{ch.count.toLocaleString()} msgs <span className="text-slate-300">·</span> {ch.outbound.toLocaleString()} out / {ch.inbound.toLocaleString()} in <span className="text-slate-300">·</span> <b className="text-slate-700">{money(ch.cost, cur)}</b></span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-3 text-[11px] text-slate-400">Telnyx is the full carrier truth for <b>both</b> texts and calls (Direct REI + War Room). The CRM log only captures <b>War Room</b> calls — Direct REI calls bill through Telnyx but happen in Direct REI&apos;s app, so they won&apos;t show in the CRM count. Calls are read from the <code>sip-trunking</code> record (one per billed call), not <code>call-control</code>.</div>
        </Card>
      )}

      {/* Recharge log */}
      {recentRecharges.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Recent auto-recharges</div>
          <ul className="divide-y divide-slate-100">
            {recentRecharges.map((rc, i) => (
              <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-slate-600">{when(rc.at)}</span>
                <span className="font-bold text-emerald-700">+{money(rc.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="px-1 text-[11px] text-slate-400">
        Samples are taken automatically off the dialer (~every 18 min while the team is calling) plus a nightly baseline, so this gets more accurate the more we call. Heavy-spend days with several recharges between samples may slightly under-count — the daily/monthly rate stays close.
      </p>
    </div>
  );
}
