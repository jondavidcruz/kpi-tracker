import { getCurrentUser, canAccessPayroll } from "@/lib/auth";
import { getActiveReps } from "@/lib/data";
import { db } from "@/lib/db";
import { saveReward, toggleRewardAchieved, deleteReward, submitRewardWish, deleteRewardWish } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function RewardsPage() {
  const me = await getCurrentUser();
  if (!me) return <Card className="mx-auto max-w-md p-8 text-center">Please sign in.</Card>;
  const cSuite = canAccessPayroll(me); // Jon / Viktoriia / Enrico

  // ── Team view (everyone else): wishlist only — no reward data shown ──────────
  if (!cSuite) {
    const myWishes = await db.rewardWish.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" } });
    return (
      <div className="space-y-5">
        <SectionTitle title="🎁 Reward wishlist" subtitle="What reward or perk would motivate you? Send it to leadership." accent="bg-brand-gold" />
        <Card className="p-5">
          <form action={submitRewardWish} className="flex flex-wrap items-end gap-2">
            <input name="text" placeholder="e.g. Half-day Friday after a big close, a gift card, a team lunch…" className={`${inputCls} min-w-64 flex-1`} required />
            <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Send wish</button>
          </form>
          <p className="mt-2 text-[11px] text-slate-400">Leadership reviews these and sets up rewards. You&apos;ll see them when they&apos;re live.</p>
        </Card>
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">Your wishes</h2>
          {myWishes.length === 0 ? (
            <Card className="p-4 text-sm text-slate-400">No wishes sent yet — add one above.</Card>
          ) : (
            <ul className="space-y-1">
              {myWishes.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="text-amber-500">💭</span><span className="flex-1 text-slate-700">{w.text}</span>
                  <span className="text-[10px] text-slate-300">{new Date(w.createdAt).toLocaleDateString()}</span>
                  <form action={deleteRewardWish}><input type="hidden" name="id" value={w.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  // ── C-suite view: full rewards management + wishlist inbox ───────────────────
  const [rewards, reps, wishes] = await Promise.all([
    db.reward.findMany({ orderBy: [{ achieved: "asc" }, { createdAt: "asc" }] }),
    getActiveReps(),
    db.rewardWish.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  const teamRewards = rewards.filter((r) => r.scope === "team");
  const indByUser = new Map<string, typeof rewards>();
  for (const r of rewards.filter((r) => r.scope === "individual")) { const a = indByUser.get(r.userId) ?? []; a.push(r); indByUser.set(r.userId, a); }

  const RewardCard = ({ r }: { r: (typeof rewards)[number] }) => {
    // Paste a store link into the reward text and it becomes a clickable "Order" button.
    const url = r.reward.match(/https?:\/\/[^\s]+/)?.[0];
    const label = url ? r.reward.replace(url, "").replace(/[—\-·|:]\s*$/, "").trim() || "Reward" : r.reward;
    return (
    <div className={`rounded-xl p-3 ring-1 ${r.achieved ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
      <div className="flex items-start gap-2.5">
        <span className="text-2xl">{r.icon}</span>
        <div className="min-w-0 flex-1">
          {r.goal && <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hit: {r.goal}</div>}
          <div className="font-bold text-slate-800">{label}</div>
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100">🔗 Order this →</a>}
        </div>
        {r.achieved && <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">✓ earned</span>}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-slate-100 pt-2">
        <form action={toggleRewardAchieved}><input type="hidden" name="id" value={r.id} /><button className="text-[11px] font-semibold text-emerald-600 hover:underline">{r.achieved ? "mark not earned" : "mark earned"}</button></form>
        <form action={deleteReward} className="ml-auto"><input type="hidden" name="id" value={r.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">remove</button></form>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6">
      <SectionTitle title="🎁 Rewards" subtitle="C-suite only — set what the team earns, and review their wishlist." accent="bg-brand-gold" right={<span className="text-xs text-slate-400">Visible to Jon, Viktoriia, Enrico</span>} />

      {/* Team reward wishlist inbox */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">💭 Team wishlist — what they asked for</h2>
        {wishes.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No wishes yet.</Card>
        ) : (
          <Card className="divide-y divide-slate-100 p-0">
            {wishes.map((w) => (
              <div key={w.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className="text-amber-500">💭</span>
                <span className="font-semibold text-slate-700">{w.name.split(" ")[0]}</span>
                <span className="flex-1 text-slate-600">{w.text}</span>
                <span className="text-[10px] text-slate-300">{new Date(w.createdAt).toLocaleDateString()}</span>
                <form action={deleteRewardWish}><input type="hidden" name="id" value={w.id} /><button className="text-[11px] text-slate-300 hover:text-red-600">×</button></form>
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Add a reward */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">➕ Add a reward</h2>
        <Card className="p-4">
          <form action={saveReward} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
            <input name="icon" defaultValue="🎁" className={`${inputCls} text-center sm:col-span-1`} title="emoji" />
            <select name="scope" defaultValue="team" className={`${inputCls} sm:col-span-2`}><option value="team">Whole team</option><option value="individual">One person</option></select>
            <select name="userId" defaultValue="" className={`${inputCls} sm:col-span-3`}><option value="">— person (if individual) —</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <input name="goal" placeholder="Goal to hit (optional)" className={`${inputCls} sm:col-span-3`} />
            <input name="reward" placeholder="Reward / gift name" required className={`${inputCls} sm:col-span-3`} />
            <input name="link" placeholder="🔗 Gift link — where to order it (paste the store URL)" className={`${inputCls} sm:col-span-11`} />
            <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 sm:col-span-1">Add</button>
          </form>
          <p className="mt-1.5 text-[11px] text-slate-400">The 🔗 gift link becomes a clickable <b>Order this</b> button on the reward card, so you can go straight to the store when someone earns it.</p>
        </Card>
      </section>

      {/* Team rewards */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">🏆 Team rewards</h2>
        {teamRewards.length === 0 ? (
          <Card className="p-4 text-sm text-slate-400">No team rewards yet.</Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{teamRewards.map((r) => <RewardCard key={r.id} r={r} />)}</div>
        )}
      </section>

      {/* Individual benefits */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">👤 Individual benefits</h2>
        <div className="space-y-3">
          {reps.filter((rep) => (indByUser.get(rep.id) ?? []).length > 0).map((rep) => (
            <Card key={rep.id} className="p-4">
              <div className="mb-2 font-bold text-slate-800">{rep.name}</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{(indByUser.get(rep.id) ?? []).map((r) => <RewardCard key={r.id} r={r} />)}</div>
            </Card>
          ))}
          {reps.every((rep) => (indByUser.get(rep.id) ?? []).length === 0) && <Card className="p-4 text-sm text-slate-400">No individual benefits assigned yet.</Card>}
        </div>
      </section>
    </div>
  );
}
