// 🔥 Direct REI → War Room auto hot-leads (Jon 2026-11-05: "use the webhook to pull replies
// INSTANTLY so Michelle doesn't manually create the lead"). Owner page to turn it on, copy the
// exact webhook URL + key into Direct REI, and watch deliveries land in real time.
import crypto from "crypto";
import { getCurrentUser, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { dreiLeadsOn } from "@/lib/directrei-leads";
import { Card, SectionTitle } from "@/components/ui";
import { toggleDreiLeadsAction, pullDreiNowAction, diagnoseDreiAction } from "./actions";

export const dynamic = "force-dynamic";

const BASE = "https://kpi-tracker-lovat.vercel.app";

export default async function DirectReiLeadsPage({ searchParams }: { searchParams: Promise<{ pull?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mb-2 text-3xl">🔒</div><h1 className="text-xl font-bold">Owner only</h1></div>;
  }
  const on = await dreiLeadsOn();
  const sharedKey = crypto.createHash("sha256").update(`${process.env.CRON_SECRET ?? ""}drei-webhook`).digest("hex").slice(0, 24);
  const webhookUrl = `${BASE}/api/directrei/webhook?k=${sharedKey}`;
  const keySet = !!process.env.DIRECTREI_API_KEY;

  const logRow = await db.resource.findFirst({ where: { category: "__drei_webhook_log__" } }).catch(() => null);
  let log: Array<{ at?: string; event?: string; status?: string; name?: string; phone?: string }> = [];
  try { log = logRow?.description ? JSON.parse(logRow.description) : []; } catch { log = []; }

  const probeRow = await db.resource.findFirst({ where: { category: "__drei_probe__" } }).catch(() => null);
  let probe: { at?: string; probe?: Array<{ endpoint: string; ok: boolean; status: number; keys: string; count: number | null; snippet: string }> } = {};
  try { probe = probeRow?.description ? JSON.parse(probeRow.description) : {}; } catch { probe = {}; }

  return (
    <div className="space-y-6">
      <SectionTitle title="🔥 Direct REI → auto hot-leads" subtitle="When a seller replies / qualifies on Direct REI, instantly create them as a 🔥 hot lead for Michelle — no manual move." accent="bg-brand-gold" />

      {/* Toggle */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-extrabold text-slate-800">Auto hot-leads are {on ? <span className="text-emerald-600">ON</span> : <span className="text-slate-400">OFF</span>}</div>
            <div className="mt-0.5 text-xs text-slate-500">{on ? "Qualified/replied sellers from Direct REI are routed to Michelle automatically." : "Turn this on and point Direct REI's webhook below at the War Room."}</div>
          </div>
          <form action={toggleDreiLeadsAction}>
            <input type="hidden" name="on" value={on ? "0" : "1"} />
            <button className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${on ? "bg-slate-400 hover:bg-slate-500" : "bg-emerald-600 hover:bg-emerald-700"}`}>{on ? "Turn OFF" : "Turn ON"}</button>
          </form>
        </div>
        {!keySet && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-semibold text-amber-700 ring-1 ring-amber-200">⚠️ DIRECTREI_API_KEY isn&apos;t set — the &quot;Pull existing&quot; button + daily poll won&apos;t work, but the real-time webhook below still will.</p>}
      </Card>

      {/* Backfill existing qualified leads (the webhook only catches NEW qualifications) */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-slate-800">Pull in sellers who are ALREADY qualified</div>
            <div className="mt-0.5 text-xs text-slate-500">The webhook only fires on a <b>new</b> qualification. Click this to sweep every currently-qualified Direct REI seller into Michelle&apos;s New stage right now.</div>
          </div>
          <form action={pullDreiNowAction}>
            <button disabled={!keySet || !on} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:bg-brand-navy-700 disabled:opacity-40" title={!on ? "Turn auto-leads ON first" : !keySet ? "Needs DIRECTREI_API_KEY" : "Pull now"}>🔥 Pull existing qualified now</button>
          </form>
        </div>
        {sp.pull && (
          <p className={`mt-3 rounded-lg px-3 py-2 text-[12px] font-semibold ring-1 ${sp.pull.startsWith("err:") ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
            {sp.pull.startsWith("err:") ? `⚠️ ${sp.pull.slice(4)}` : `✅ ${sp.pull}`}
          </p>
        )}
      </Card>

      {/* Webhook setup */}
      <Card className="p-5">
        <div className="text-sm font-extrabold text-slate-800">Point Direct REI at the War Room (real-time)</div>
        <p className="mt-1 text-[13px] text-slate-500">In Direct REI → <b>Settings → API &amp; Zapier → Webhooks → Add</b>, paste this URL. It fires the instant a seller qualifies/replies.</p>
        <div className="mt-2 flex items-center gap-2 overflow-x-auto rounded-lg bg-slate-900 px-3 py-2">
          <code className="whitespace-nowrap text-[12px] text-emerald-300">{webhookUrl}</code>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">The <code className="rounded bg-slate-100 px-1">?k=</code> value is your private key — don&apos;t share the URL publicly. Keys are never shown to non-owners.</p>
      </Card>

      {/* 🔬 API diagnostic — find which endpoint holds the sellers + its shape */}
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-extrabold text-slate-800">🔬 Diagnose the Direct REI API</div>
            <div className="mt-0.5 text-xs text-slate-500">The pull found 0 sellers — click to probe Direct REI&apos;s endpoints and show exactly which one returns the list and how it&apos;s shaped.</div>
          </div>
          <form action={diagnoseDreiAction}>
            <button disabled={!keySet} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-40">🔬 Test API now</button>
          </form>
        </div>
        {probe.probe && probe.probe.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <div className="mb-1 text-[11px] text-slate-400">Last probe {probe.at ? new Date(probe.at).toLocaleString() : ""} — screenshot this and send it to me if the pull still finds nothing.</div>
            <table className="w-full text-[12px]">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>
                <th className="px-2 py-1 text-left font-bold">Endpoint</th><th className="px-2 py-1 text-left font-bold">HTTP</th><th className="px-2 py-1 text-left font-bold">Rows</th><th className="px-2 py-1 text-left font-bold">Top keys</th><th className="px-2 py-1 text-left font-bold">Raw (first 300)</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {probe.probe.map((p, i) => (
                  <tr key={i} className={p.count && p.count > 0 ? "bg-emerald-50" : ""}>
                    <td className="whitespace-nowrap px-2 py-1 font-mono font-bold text-slate-700">{p.endpoint}</td>
                    <td className={`px-2 py-1 font-bold ${p.ok ? "text-emerald-600" : "text-red-600"}`}>{p.status}</td>
                    <td className="px-2 py-1 font-bold text-slate-700">{p.count ?? "—"}</td>
                    <td className="px-2 py-1 font-mono text-slate-500">{p.keys}</td>
                    <td className="px-2 py-1 font-mono text-[10px] text-slate-400"><span className="line-clamp-2 break-all">{p.snippet}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Live delivery log */}
      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Recent webhook deliveries ({log.length})</h2>
        <Card className="overflow-hidden p-0">
          {log.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No deliveries yet. Once Direct REI is pointed at the URL above, events show here within seconds — then you&apos;ll see the exact event names it sends.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400"><tr>
                <th className="px-4 py-2 text-left font-bold">When</th><th className="px-3 py-2 text-left font-bold">Event</th><th className="px-3 py-2 text-left font-bold">Status</th><th className="px-3 py-2 text-left font-bold">Seller</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {log.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">{e.at ? new Date(e.at).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2 font-mono text-[12px] font-bold text-slate-700">{e.event || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{e.status || "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{e.name || e.phone || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <p className="mt-2 text-[11px] text-slate-400">If deliveries appear here but no lead is created, the event name/status didn&apos;t match — tell me what you see and I&apos;ll widen the match.</p>
      </div>
    </div>
  );
}
