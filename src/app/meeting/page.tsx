import Link from "next/link";
import { saveMeetingSettings, saveTrainingTip, deleteTrainingTip } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings, getKpis } from "@/lib/data";
import { db } from "@/lib/db";
import { getMeetingDeck } from "@/lib/meeting";
import { todayStr } from "@/lib/date";
import { Card, SectionTitle } from "@/components/ui";
import MeetingDeckView from "@/components/MeetingDeck";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

export default async function MeetingPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const [settings, kpis, tips] = await Promise.all([
    getSettings(),
    getKpis(),
    db.trainingTip.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const greenKpis = kpis.filter((k) => k.scope === "per_rep" && k.category === "green");
  const deck = await getMeetingDeck(todayStr(settings.orgTimezone));

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🗓 Monday Meeting"
        subtitle="One-click all-call deck — live from your KPIs. Hit Present for full screen; edit the content below."
        accent="bg-brand-gold"
        right={<a href="#edit" className="text-sm font-semibold text-brand-navy hover:underline">Edit content ↓</a>}
      />

      <MeetingDeckView deck={deck} />

      {/* Edit content — lives on the same page; the team only sees the fullscreen Present view. */}
      <div id="edit" className="scroll-mt-4 border-t border-slate-200 pt-6">
        <SectionTitle title="✏️ Edit deck content" subtitle="Annual goal, editorial slides, and the training-tip backlog" accent="bg-slate-300" />

        {sp.saved && (
          <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
            ✓ Saved “{sp.saved}”.
          </div>
        )}

        <Card className="p-6">
          <form action={saveMeetingSettings} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label>
              <span className={labelCls}>Annual revenue goal ($)</span>
              <input name="annualRevenueGoal" defaultValue={settings.annualRevenueGoal || ""} placeholder="500000" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Homeowners to help (mission)</span>
              <input name="homeownersGoal" defaultValue={settings.homeownersGoal || ""} placeholder="24" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Goal reward / incentive</span>
              <input name="goalReward" defaultValue={settings.goalReward} placeholder="Boracay / Cebu trip + $250 VA bonus" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Stretch revenue goal ($)</span>
              <input name="revenueStretchGoal" defaultValue={settings.revenueStretchGoal || ""} placeholder="600000" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Stretch reward / incentive</span>
              <input name="stretchReward" defaultValue={settings.stretchReward} placeholder="+$250 additional VA bonus" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Team Announcements (one per line)</span>
              <textarea name="mtgAnnouncements" defaultValue={settings.mtgAnnouncements} rows={4} placeholder={"New script live\nUpdated underwriting process\n…"} className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Change / Coming Soon (one per line)</span>
              <textarea name="mtgComingSoon" defaultValue={settings.mtgComingSoon} rows={4} className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Leadership Talking Points (one per line)</span>
              <textarea name="mtgTalkingPoints" defaultValue={settings.mtgTalkingPoints} rows={3} className={inputCls} />
            </label>
            <div className="sm:col-span-2">
              <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Save deck content</button>
            </div>
          </form>
        </Card>

        <Card className="mt-4 p-6">
          <h3 className="mb-1 text-sm font-bold text-slate-700">Training-tip backlog</h3>
          <p className="mb-3 text-xs text-slate-500">Each Monday the deck shows the tip matching the team&apos;s weakest KPI; untagged tips rotate as the general fallback.</p>
          <div className="mb-4 space-y-2">
            {tips.length === 0 && <p className="text-sm text-slate-400">No tips yet — add your first below.</p>}
            {tips.map((t) => (
              <div key={t.id} className="flex items-start gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                <span className="mt-0.5 shrink-0 rounded-md bg-brand-navy px-1.5 py-0.5 text-[10px] font-semibold text-white">{t.kpiKey || "general"}</span>
                <span className="flex-1 text-sm text-slate-700">{t.text}</span>
                <form action={deleteTrainingTip}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                </form>
              </div>
            ))}
          </div>
          <form action={saveTrainingTip} className="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <input name="text" placeholder="New training tip…" className={`${inputCls} sm:col-span-4`} required />
            <select name="kpiKey" defaultValue="" className={`${inputCls} sm:col-span-1`}>
              <option value="">general</option>
              {greenKpis.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
            </select>
            <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 sm:col-span-1">+ Add tip</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
