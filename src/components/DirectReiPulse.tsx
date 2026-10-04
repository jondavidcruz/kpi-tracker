// 📨 Direct REI outreach pulse — the live feed Jon asked to see (2026-10-04).
// Server component: renders the cached feed (refreshed 5×/day with the CRM
// sync, or on demand). SELLER side = Michelle's acquisitions campaigns;
// BUYER side = Marie + Sharyn's dispo campaigns. Replies exclude opt-outs.
import { readDreiFeed, type DreiSide } from "@/lib/directrei-sync";
import { refreshDreiFeedAction } from "@/app/actions";
import { Card } from "@/components/ui";

function SideCol({ title, who, tone, s }: { title: string; who: string; tone: "sky" | "violet"; s: DreiSide }) {
  const ring = tone === "sky" ? "ring-sky-200 bg-sky-50/60" : "ring-violet-200 bg-violet-50/60";
  const big = tone === "sky" ? "text-sky-700" : "text-violet-700";
  return (
    <div className={`rounded-xl p-3 ring-1 ${ring}`}>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{title} <span className="font-normal normal-case">· {who}</span></div>
      <div className="mt-1 flex items-end gap-4">
        <div><div className={`text-2xl font-extrabold tabular-nums ${big}`}>{s.repliesToday}</div><div className="text-[10px] font-semibold text-slate-400">replies today</div></div>
        <div><div className="text-lg font-bold tabular-nums text-slate-700">{s.replies7d}</div><div className="text-[10px] font-semibold text-slate-400">7 days</div></div>
        <div><div className="text-lg font-bold tabular-nums text-slate-700">{s.newToday}<span className="text-xs text-slate-400">/{s.new7d}</span></div><div className="text-[10px] font-semibold text-slate-400">new today/7d</div></div>
      </div>
      <div className="mt-1 text-[10px] text-slate-500">7d replies: 💬 {s.smsReplies7d} sms/call · ✉️ {s.emailReplies7d} email</div>
    </div>
  );
}

export default async function DirectReiPulse() {
  const feed = await readDreiFeed();
  if (!feed) return null; // not configured or never refreshed — invisible until it has something
  const ago = Math.round((Date.now() - Date.parse(feed.at)) / 60000);
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-700">📨 Direct REI — outreach pulse</span>
        <span className="text-[11px] text-slate-400">{feed.totalContacts.toLocaleString()} contacts · updated {ago < 90 ? `${ago}m` : `${Math.round(ago / 60)}h`} ago</span>
        <form action={refreshDreiFeedAction} className="ml-auto"><button className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">↻ Refresh</button></form>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SideCol title="🏠 Seller campaigns" who="Acquisitions (Michelle)" tone="sky" s={feed.seller} />
        <SideCol title="🏗 Buyer campaigns" who="Dispo (Marie · Sharyn)" tone="violet" s={feed.buyer} />
      </div>
      {feed.recentReplies.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">💬 Replies this week — answer these</div>
          <div className="space-y-1">
            {feed.recentReplies.map((r, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs ring-1 ring-slate-200">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${r.side === "seller" ? "bg-sky-100 text-sky-700" : r.side === "buyer" ? "bg-violet-100 text-violet-700" : "bg-slate-200 text-slate-600"}`}>{r.side}</span>
                <span className="font-semibold text-slate-800">{r.name}</span>
                <span className="text-slate-400">{r.campaign} · {/email/i.test(r.channel) ? "✉️" : "💬"}</span>
                {r.needsAttention && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">⚡ needs reply</span>}
                <span className="ml-auto text-[10px] text-slate-400">{new Date(r.at).toLocaleDateString()} {new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                {(r.phone || r.email) && <span className="text-[10px] text-brand-navy">{[r.phone, r.email].filter(Boolean).join(" · ")}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">Replies exclude opt-outs. Campaigns named &ldquo;seller/buyer&rdquo; follow the name; the rest classify by each contact&apos;s role. KPI auto-entry is OFF until Jon confirms which KPIs these feed.</p>
    </Card>
  );
}
