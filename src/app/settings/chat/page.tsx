import { getCurrentUser, canAccessCSuite } from "@/lib/auth";
import { savePhoneAlertConfig, testPhoneAlert, getPhoneAlertWebhook } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// 🔔 ONE home for everything Google-Chat (Jon 2026-10-09: "move it all to
// settings, not scattered under different sections").
const ROOMS: Array<{ key: string; name: string; job: string; auto: string }> = [
  { key: "contracts", name: "Contracts Signed", job: "the bell rings when a deal signs or closes", auto: "stage moves + PandaDoc signatures, instant" },
  { key: "kpi", name: "DATA: KPIs", job: "one picture scoreboard per day — everyone's KPIs, misses in red with reasons", auto: "daily 6pm PT" },
  { key: "phonehealth", name: "Phone / CRM Health", job: "number rotation + deliverability only", auto: "weekly Mon + whenever a line issue CHANGES" },
  { key: "receipts", name: "Receipts", job: "subscription PDF receipts", auto: "scanner in the overnight build queue" },
  { key: "leadership", name: "Leadership", job: "Friday call notes (C-suite + Marie)", auto: "planned" },
  { key: "team", name: "Freedom Offers Team", job: "wins + closed-deal celebrations", auto: "DEAL WON posts, instant" },
  { key: "acquisitions", name: "Acquisitions", job: "offers in motion + buyer offers captured from email", auto: "stage moves + daily offer scan" },
  { key: "directrei", name: "Direct REI", job: "AI campaign recap + their qualified-lead pings", auto: "daily ~6:30pm PT" },
  { key: "updates", name: "War Room Updates", job: "what shipped today, team-facing", auto: "daily 8pm PT" },
];

export default async function ChatSettingsPage() {
  const me = await getCurrentUser();
  if (!canAccessCSuite(me)) return <Card className="p-10 text-center text-slate-400">🔒 C-suite only.</Card>;
  let connected: Record<string, boolean> = {};
  try {
    const map = JSON.parse(process.env.CHAT_WEBHOOKS_JSON || "{}") as Record<string, string>;
    connected = Object.fromEntries(Object.keys(map).map((k) => [k, true]));
  } catch { /* none */ }
  connected.updates = !!process.env.WARROOM_CHAT_WEBHOOK;
  const phoneAlertWebhook = await getPhoneAlertWebhook().catch(() => "");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <SectionTitle title="🔔 Chat & Notifications" subtitle="Every Google Chat room the War Room posts to, what it's for, and when it fires — all in one place." accent="bg-brand-gold" />

      <Card className="p-4">
        <div className="mb-2 text-sm font-extrabold text-slate-800">💬 The rooms</div>
        <div className="space-y-1.5">
          {ROOMS.map((r) => (
            <div key={r.key} className="flex flex-wrap items-baseline gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
              <span className="text-sm font-bold text-slate-800">{r.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${connected[r.key] ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{connected[r.key] ? "✓ connected" : "not set"}</span>
              <span className="w-full text-[11px] text-slate-500">{r.job} · <b>fires:</b> {r.auto}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">Room webhooks live in the CHAT_WEBHOOKS_JSON setting — to add or swap one, paste the new webhook to Claude. Auto add/remove of team members runs through the Chat app (off-boarding removes people from every room automatically).</p>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-800">📞 Phone-health alert webhook</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${phoneAlertWebhook ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{phoneAlertWebhook ? "✓ Connected" : "Not set up"}</span>
        </div>
        <p className="mt-1 text-[12px] text-slate-600">Where line-health alarms + the weekly rotation digest post (moved here from Phone Health).</p>
        <form action={savePhoneAlertConfig} className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[260px] flex-1"><span className="mb-0.5 block text-[11px] font-bold text-slate-500">Google Chat webhook URL</span>
            <input name="webhook" type="url" defaultValue={phoneAlertWebhook} placeholder="https://chat.googleapis.com/v1/spaces/…" className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" />
          </label>
          <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save</button>
        </form>
        {phoneAlertWebhook && (
          <form action={testPhoneAlert} className="mt-2">
            <button className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-300">Send test message</button>
          </form>
        )}
      </Card>
    </div>
  );
}
