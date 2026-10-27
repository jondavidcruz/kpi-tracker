// ♻️ Direct REI List Tracker (Jon 2026-10-26: "track + recycle the lists in Direct REI"). Pulls
// the Direct REI campaigns (= lists), shows each list's AGE + response/opt-out counts, and flags
// which are due to recycle per the List Recycle SOP. Direct REI has no dial/call-log API (call
// analytics are a CSV export), so the recycle flag uses what IS available: list age + how much
// of it has been dispositioned. Self-diagnosing: if the API key isn't set or the response shape
// differs, it says so + shows the raw payload so we can wire it exactly.
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, isManager, canAccessMarketing } from "@/lib/auth";
import { directReiConfigured, directReiCampaigns } from "@/lib/directrei";
import { Card } from "@/components/ui";

export const dynamic = "force-dynamic";

// pull an array of campaigns out of whatever shape the API returns
function asArray(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    for (const k of ["campaigns", "data", "results", "items"]) {
      const v = (body as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}
const pick = (o: Record<string, unknown>, keys: string[]): unknown => { for (const k of keys) if (o[k] != null && o[k] !== "") return o[k]; return undefined; };
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const daysSince = (v: unknown): number | null => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : null; };

export default async function ListTrackerPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (!isManager(me) && !canAccessMarketing(me)) redirect("/");

  const configured = directReiConfigured();
  const res = configured ? await directReiCampaigns() : null;
  const campaigns = res?.ok ? asArray(res.body) : [];

  const rows = campaigns.map((c) => {
    const name = String(pick(c, ["name", "title", "campaign_name"]) ?? "(unnamed)");
    const age = daysSince(pick(c, ["created_at", "createdAt", "created", "start_date", "date"]));
    const total = num(pick(c, ["contacts_count", "contact_count", "total_contacts", "leads_count", "total", "size"]));
    const responded = num(pick(c, ["qualified_count", "responded", "replies", "interested_count"]));
    const optedOut = num(pick(c, ["opted_out_count", "opt_out_count", "dnc_count"]));
    const dispositioned = (responded ?? 0) + (optedOut ?? 0);
    const pctWorked = total && total > 0 ? Math.round((dispositioned / total) * 100) : null;
    // recycle rule (what the API supports): age ≥ 21d OR ≥ 80% dispositioned → recycle
    const recycle = (age != null && age >= 21) || (pctWorked != null && pctWorked >= 80);
    const aging = !recycle && age != null && age >= 14;
    return { name, age, total, responded, optedOut, pctWorked, recycle, aging };
  }).sort((a, b) => (b.age ?? -1) - (a.age ?? -1));

  const dueCount = rows.filter((r) => r.recycle).length;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-extrabold text-slate-800">♻️ List Tracker — Direct REI</h1>
        {dueCount > 0 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">{dueCount} due to recycle</span>}
        <Link href="/sop/list-recycle" className="ml-auto text-xs font-bold text-sky-600 hover:underline">📜 List Recycle SOP</Link>
      </div>

      {!configured ? (
        <Card className="p-6">
          <div className="text-base font-bold text-slate-800">Connect Direct REI first</div>
          <p className="mt-1 text-sm text-slate-500">Set <code className="rounded bg-slate-100 px-1.5 py-0.5">DIRECTREI_API_KEY</code> in Vercel (Direct REI → Settings → API &amp; Zapier → Create API key). Then this page will list every campaign with its age + recycle status.</p>
        </Card>
      ) : !res?.ok ? (
        <Card className="p-6">
          <div className="text-base font-bold text-red-700">Couldn&apos;t read Direct REI campaigns (status {res?.status})</div>
          <p className="mt-1 text-sm text-slate-500">{res?.status === 401 ? "The API key was rejected — re-create it in Direct REI and update DIRECTREI_API_KEY." : "The /campaigns call failed. Raw response below."}</p>
          <pre className="mt-3 max-h-60 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 ring-1 ring-slate-100">{JSON.stringify(res?.body, null, 2).slice(0, 2000)}</pre>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <div className="text-base font-bold text-slate-800">Connected ✓ — but no campaigns came back in a shape I recognize.</div>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s the raw response so we can map the exact fields (names/counts/dates) and finish the tracker:</p>
          <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 ring-1 ring-slate-100">{JSON.stringify(res.body, null, 2).slice(0, 3000)}</pre>
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 pr-3">List (campaign)</th><th className="px-2">Age</th><th className="px-2">Size</th><th className="px-2">Responded</th><th className="px-2">Opted out</th><th className="px-2">% worked</th><th className="px-2">Status</th>
                </tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-2 pr-3 font-bold text-slate-800">{r.name}</td>
                      <td className="px-2 text-slate-600">{r.age != null ? `${r.age}d` : "—"}</td>
                      <td className="px-2 text-slate-600">{r.total ?? "—"}</td>
                      <td className="px-2 text-emerald-700">{r.responded ?? "—"}</td>
                      <td className="px-2 text-slate-500">{r.optedOut ?? "—"}</td>
                      <td className="px-2 text-slate-600">{r.pctWorked != null ? `${r.pctWorked}%` : "—"}</td>
                      <td className="px-2">{r.recycle
                        ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">♻️ recycle</span>
                        : r.aging ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">🟡 aging</span>
                        : <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">🟢 fresh</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="p-4 text-xs text-slate-500">
            <b className="text-slate-700">Recycle rule:</b> a list flags <b>♻️ recycle</b> when it&apos;s <b>≥ 21 days old</b> or <b>≥ 80% dispositioned</b> (responded + opted out). Direct REI doesn&apos;t expose dial/voicemail counts to the API, so the live &ldquo;connect rate collapsed&rdquo; signal is still watched by the team in Direct REI — see the <Link href="/sop/list-recycle" className="font-bold text-sky-600 hover:underline">SOP</Link>. When a list flags, archive it in Direct REI and pull the next DealMachine batch.
          </Card>
        </>
      )}
    </div>
  );
}
