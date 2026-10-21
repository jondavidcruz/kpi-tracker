import Link from "next/link";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { checkAndRecordComms } from "@/lib/comms-health";

export const dynamic = "force-dynamic";

// 🛡️ Comms Guardian board — one screen that proves calling, texting, and email are
// all working, inbound and outbound. Runs the live battery on load (throttled to once
// a minute), the same one the /api/comms-health endpoint + scheduled guardian use.
export default async function CommsHealthPage() {
  const me = await getCurrentUser();
  if (!me) return null;
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-1 text-sm text-slate-500">The Comms Guardian board is for leadership.</p>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const snap = await checkAndRecordComms();
  const channels: { channel: "voice" | "sms" | "email"; title: string; emoji: string }[] = [
    { channel: "voice", title: "Calling", emoji: "📞" },
    { channel: "sms", title: "Texting", emoji: "💬" },
    { channel: "email", title: "Email", emoji: "✉️" },
  ];
  const downCount = snap.lanes.filter((l) => !l.ok).length;
  const recent = (snap.history ?? []).slice(0, 24);

  return (
    <div className="space-y-5">
      <SectionTitle title="🛡️ Comms Guardian" subtitle="Calling, texting, and email — inbound and outbound — tested live and kept working 24/7. Managers get an email the moment any line goes down." accent={downCount ? "bg-red-500" : "bg-emerald-500"} />

      <Card className={`flex flex-wrap items-center gap-4 p-5 ${downCount ? "ring-2 ring-red-200" : "ring-1 ring-emerald-100"}`}>
        <div className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-3xl ${downCount ? "bg-red-50" : "bg-emerald-50"}`}>{downCount ? "🔴" : "🟢"}</div>
        <div className="min-w-[220px] flex-1">
          <div className="text-lg font-extrabold text-slate-900">{downCount ? `${downCount} line${downCount === 1 ? "" : "s"} down` : "All systems go"}</div>
          <div className="text-xs text-slate-500">Last checked {new Date(snap.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · re-runs live on load (max once/min)</div>
        </div>
        <div className="text-right text-[11px] text-slate-400">
          <div>Uptime monitor: point it at</div>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">/api/comms-health</code>
          <div className="mt-0.5">200 = healthy · 503 = down</div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {channels.map((c) => {
          const lanes = snap.lanes.filter((l) => l.channel === c.channel);
          const chDown = lanes.some((l) => !l.ok);
          return (
            <Card key={c.channel} className={`p-4 ${chDown ? "ring-1 ring-red-200" : ""}`}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-xl">{c.emoji}</span>
                <span className="text-sm font-extrabold text-slate-800">{c.title}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${chDown ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{chDown ? "needs attention" : "healthy"}</span>
              </div>
              <div className="space-y-2">
                {lanes.map((l) => (
                  <div key={l.key} className={`rounded-lg p-2.5 ring-1 ${l.ok ? "bg-emerald-50/50 ring-emerald-100" : "bg-red-50 ring-red-200"}`}>
                    <div className="flex items-center gap-2">
                      <span>{l.ok ? "🟢" : "🔴"}</span>
                      <span className="text-[12px] font-bold text-slate-800">{l.direction === "outbound" ? "➡️ Outbound" : "⬅️ Inbound"}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">{l.detail}</div>
                    {!l.ok && l.fix && <div className="mt-1 rounded bg-white px-2 py-1 text-[11px] font-semibold text-red-700 ring-1 ring-red-100">🔧 {l.fix}</div>}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Recent checks</div>
        <div className="flex flex-wrap gap-1">
          {recent.length === 0 ? <span className="text-[12px] text-slate-400">No history yet — checks accumulate as the guardian runs.</span> : recent.map((h, i) => (
            <span key={i} title={`${new Date(h.at).toLocaleString()}${h.down.length ? ` — down: ${h.down.join(", ")}` : " — all healthy"}`}
              className={`h-4 w-4 rounded-sm ${h.ok ? "bg-emerald-400" : "bg-red-400"}`} />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Each square is one check (newest first). Green = everything up, red = a line was down. Hover for details.</p>
      </Card>

      <Card className="border-l-4 border-slate-300 p-4 text-[12px] text-slate-600">
        <b className="text-slate-800">How this stays on 24/7:</b> the board self-tests whenever anyone opens their phone or this page, a nightly job runs the full battery, and a scheduled Comms Guardian checks it around the clock and emails Jon on any outage. For minute-by-minute coverage even when nobody&apos;s logged in, point a free uptime monitor (UptimeRobot) at <code className="rounded bg-slate-100 px-1 py-0.5">/api/comms-health</code> — it returns 503 the instant a line drops.
      </Card>
    </div>
  );
}
