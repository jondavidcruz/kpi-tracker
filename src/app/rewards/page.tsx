import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps } from "@/lib/data";
import { db } from "@/lib/db";
import { saveReward, toggleRewardAchieved, deleteReward } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function RewardsPage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const manager = isManager(me);
  const [rewards, reps] = await Promise.all([
    db.reward.findMany({ orderBy: [{ achieved: "asc" }, { createdAt: "asc" }] }),
    getActiveReps(),
  ]);
  const nameById = new Map(reps.map((r) => [r.id, r.name]));
  const teamRewards = rewards.filter((r) => r.scope === "team");
  const myRewards = rewards.filter((r) => r.scope === "individual" && r.userId === me.id);
  const indByUser = new Map<string, typeof rewards>();
  for (const r of rewards.filter((r) => r.scope === "individual")) { const a = indByUser.get(r.userId) ?? []; a.push(r); indByUser.set(r.userId, a); }

  const RewardCard = ({ r }: { r: (typeof rewards)[number] }) => (
    <div className={`rounded-xl p-3 ring-1 ${r.achieved ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-2xl">{r.icon}</span>
        <div className="min-w-0 flex-1">
          {r.goal && <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hit: {r.goal}</div>}
          <div className="font-bold text-slate-800">{r.reward}</div>
        </div>
        {r.achieved && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ earned</span>}
      </div>
      {manager && (
        <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
          <form action={toggleRewardAchieved}><input type="hidden" name="id" value={r.id} /><button className="text-[11px] font-semibold text-emerald-600 hover:underline">{r.achieved ? "mark not earned" : "mark earned"}</button></form>
          <form action={deleteReward} className="ml-auto"><input type="hidden" name="id" value={r.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <SectionTitle title="🎁 Rewards" subtitle="What the team earns when goals are hit — plus each person's own benefits." accent="bg-brand-gold" />

      {/* Team rewards — everyone sees */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">🏆 Team rewards — hit the goal, earn the reward</h2>
        {teamRewards.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No team rewards set yet.{manager ? " Add one below." : ""}</Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{teamRewards.map((r) => <RewardCard key={r.id} r={r} />)}</div>
        )}
      </section>

      {/* My benefits — the logged-in person's individual rewards */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">⭐ Your benefits — {me.name.split(" ")[0]}</h2>
        {myRewards.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No personal benefits set yet.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{myRewards.map((r) => <RewardCard key={r.id} r={r} />)}</div>
        )}
      </section>

      {/* Manager: set rewards + see everyone's individual benefits */}
      {manager && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-700">➕ Add a reward (managers)</h2>
            <Card className="p-4">
              <form action={saveReward} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <input name="icon" defaultValue="🎁" className={`${inputCls} text-center sm:col-span-1`} title="emoji" />
                <select name="scope" defaultValue="team" className={`${inputCls} sm:col-span-2`}><option value="team">Whole team</option><option value="individual">One person</option></select>
                <select name="userId" defaultValue="" className={`${inputCls} sm:col-span-2`}><option value="">— person (if individual) —</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
                <input name="goal" placeholder="Goal to hit (optional)" className={`${inputCls} sm:col-span-3`} />
                <input name="reward" placeholder="Reward / benefit" required className={`${inputCls} sm:col-span-3`} />
                <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 sm:col-span-1">Add</button>
              </form>
              <p className="mt-2 text-[11px] text-slate-400">Team reward example: goal “Close 6 deals this month” → reward “Team dinner”. Individual benefit example: person “Sharyn” → “$100 per developer deal closed”.</p>
            </Card>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-bold text-slate-700">👤 Everyone&apos;s benefits</h2>
            <div className="space-y-3">
              {reps.filter((rep) => (indByUser.get(rep.id) ?? []).length > 0).map((rep) => (
                <Card key={rep.id} className="p-4">
                  <div className="mb-2 font-bold text-slate-800">{rep.name}</div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{(indByUser.get(rep.id) ?? []).map((r) => <RewardCard key={r.id} r={r} />)}</div>
                </Card>
              ))}
              {reps.every((rep) => (indByUser.get(rep.id) ?? []).length === 0) && <Card className="p-4 text-sm text-slate-400">No individual benefits assigned yet.</Card>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
