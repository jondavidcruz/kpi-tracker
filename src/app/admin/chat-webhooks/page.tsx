// 💬 Owner-only: wire each Google Chat room's incoming webhook from inside the app
// (Jon 2026-10-27). Saves a DB override that postToSpace prefers over the env var —
// so adding/replacing a room's webhook needs no env change or redeploy.
import { getCurrentUser, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveChatWebhooksAction, testChatWebhookAction } from "@/app/actions";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

const ROOMS: { key: string; label: string; job: string }[] = [
  { key: "team", label: "Freedom Offers Team", job: "Wins + signed/closed deals — the whole company" },
  { key: "contracts", label: "Contracts Sign Chat", job: "A deal gets signed — the bell rings here" },
  { key: "acquisitions", label: "Acquisitions", job: "Offers in motion (made / captured / negotiating)" },
  { key: "dispositions", label: "Dispositions", job: "Buyer/developer sourcing + 'to research' lists for the dispo team" },
  { key: "kpi", label: "KPI", job: "One compact end-of-day KPI snapshot" },
  { key: "leadership", label: "Leadership", job: "Friday leadership-call notes (C-suite + Marie)" },
  { key: "phonehealth", label: "Phone Health", job: "Number rotation + text deliverability" },
  { key: "receipts", label: "Receipts", job: "PDF receipts from subscriptions" },
  { key: "directrei", label: "Direct REI", job: "Direct REI AI updates + qualified-lead reporting" },
];

function mask(url: string): string {
  const m = url.match(/\/spaces\/([^/]+)\//);
  return m ? `✅ set · space ${m[1]}` : "✅ set";
}

export default async function ChatWebhooksPage({ searchParams }: { searchParams: Promise<{ saved?: string; tested?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
        <p className="mt-2 text-sm text-slate-500">Chat webhook settings are limited to the owner.</p>
      </div>
    );
  }
  const row = await db.resource.findFirst({ where: { category: "__chat_webhooks__" } });
  let cur: Record<string, string> = {};
  try { cur = row?.description ? JSON.parse(row.description) : {}; } catch { cur = {}; }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold text-slate-800">💬 Chat room webhooks</h1>
        <p className="mt-1 text-sm text-slate-500">Paste a room&apos;s Google Chat <b>incoming webhook URL</b> to wire it. Saved to the app (no redeploy). Leave a field blank to keep what&apos;s there; type <code>__clear__</code> to remove one.</p>
      </div>
      {sp.saved && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">✓ Saved.</div>}
      {sp.tested && <div className={`rounded-lg px-3 py-2 text-sm font-semibold ring-1 ${sp.ok === "1" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>{sp.ok === "1" ? `✓ Test ping sent to “${sp.tested}”. Check the chat.` : `⚠️ Couldn't send to “${sp.tested}” — no webhook set for it yet.`}</div>}

      <form action={saveChatWebhooksAction}>
        <div className="space-y-2.5">
          {ROOMS.map((r) => (
            <Card key={r.key} className="p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-slate-800">{r.label} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{r.key}</span></div>
                  <div className="text-[11px] text-slate-400">{r.job}</div>
                </div>
                <div className="text-[11px] font-semibold text-slate-400">{cur[r.key] ? mask(cur[r.key]) : "— not set (uses env default if any)"}</div>
              </div>
              <input name={`wh_${r.key}`} placeholder="https://chat.googleapis.com/v1/spaces/…/messages?key=…&token=…" className="mt-2 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] text-slate-700 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200" />
            </Card>
          ))}
        </div>
        <button className="mt-3 rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:opacity-90">Save webhooks</button>
      </form>

      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Send a test ping</div>
        <div className="flex flex-wrap gap-1.5">
          {ROOMS.map((r) => (
            <form key={r.key} action={testChatWebhookAction}>
              <input type="hidden" name="space" value={r.key} />
              <button className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">📨 {r.label}</button>
            </form>
          ))}
        </div>
      </div>
    </div>
  );
}
