import Link from "next/link";
import { saveDay, addRepReason, setDayFocus, refreshCrmToday, importTeamLeads } from "@/app/actions";
import { getCurrentUser, isManager, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import EntryForm, { type EntryGroup } from "@/components/EntryForm";
import SpeedTestCard from "@/components/SpeedTestCard";
import { Card } from "@/components/ui";
import {
  getActiveReps,
  getAllTargets,
  getDailyValues,
  getKpis,
  getSettings,
  resolveGoalWith,
} from "@/lib/data";
import { statusVsGoal, isKpiHiddenForRep } from "@/lib/kpi";
import { todayStr, friendlyDate, monthOf } from "@/lib/date";
import { toInputNumber, type Unit } from "@/lib/format";
import { positionLabel, secondaryPositionOf } from "@/lib/roles";

// Developer/luxury outreach KPIs (shown only on a developer-focus day).
const DEV_KEYS = new Set(["dev_instagram", "dev_facebook", "dev_linkedin", "dev_website", "dev_wordofmouth", "dev_conversations"]);
// Dialer/buyer-calling KPIs — not counted on a developer-focus day.
const DIALER_KEYS = new Set(["buyers_contacted", "ds_talk_time"]);

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; date?: string; saved?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const settings = await getSettings();
  const me = await getCurrentUser();
  const date = sp.date ?? todayStr(settings.orgTimezone);
  const month = monthOf(date);

  // EVERYONE (managers included) only sees + enters their OWN KPIs here, to minimize
  // mis-entry onto someone else's card. Corrections to others happen in Admin.
  const allReps = await getActiveReps();
  const reps = allReps.filter((r) => r.id === me?.id);
  const selectedId = me?.id ?? reps[0]?.id;
  const rep = reps.find((r) => r.id === selectedId) ?? reps[0];
  // Lead-source KPIs (PPL, direct-mail, refunds) are Marie's responsibility — they only
  // show on her card. Text Responses is auto-synced, never hand-entered.
  const marieId = allReps.find((r) => r.name.trim().split(/\s+/)[0].toLowerCase() === "marie")?.id;

  // Hybrid reps (Michelle/Sharyn): their cross-trained secondary scorecard shows
  // as an OPTIONAL section — logged entries count, skipping them never nags.
  const secRole = rep ? secondaryPositionOf(rep) : null;
  const [roleKpis, secRoleKpis, internetKpis, teamDaily, values, targets] = await Promise.all([
    rep
      ? getKpis({ scope: "per_rep", cadence: "daily", computed: false, roleKey: rep.position })
      : Promise.resolve([]),
    rep && secRole
      ? getKpis({ scope: "per_rep", cadence: "daily", computed: false, roleKey: secRole })
      : Promise.resolve([]),
    // Internet-speed test shows for EVERY rep so each person's daily speed is
    // recorded (alerts still only fire for tracksInternet reps — see alerts.ts).
    rep
      ? getKpis({ scope: "per_rep", cadence: "daily", computed: false, roleKey: "internet" })
      : Promise.resolve([]),
    getKpis({ scope: "team", cadence: "daily", computed: false }),
    getDailyValues(date),
    getAllTargets(),
  ]);

  // The rep's own open flags, so they can add context before a manager reviews.
  const myAlerts = rep
    ? await db.alert.findMany({
        where: { userId: rep.id, status: { in: ["open", "ack"] } },
        include: { kpi: true },
        orderBy: { date: "desc" },
        take: 10,
      })
    : [];

  // Internet speed gets its own prominent test card (below), not a plain field.
  const internetKpi = internetKpis[0] ?? null;
  const internetGoal = internetKpi && rep ? resolveGoalWith(targets, internetKpi, rep.id, month) : null;
  const internetInitial =
    internetKpi && rep ? values.get(`${internetKpi.id}|${rep.id}`) ?? null : null;

  // Dispositions reps can flip between traditional (dialer) and developer/luxury
  // outreach for the day. The focus decides which KPIs show + how they're scored.
  const isDispo = rep?.position === "dispositions";
  const standup = rep && isDispo ? await db.standup.findUnique({ where: { userId_date: { userId: rep.id, date } } }) : null;
  const focus: "traditional" | "developer" = standup?.focus === "developer" ? "developer" : "traditional";

  // Decide which KPIs to show (and which dialer KPIs to grey out on a dev day).
  let shown = roleKpis.filter((k) => !DEV_KEYS.has(k.key));
  let mutedKpis: typeof roleKpis = [];
  if (rep && isDispo && focus === "developer") {
    shown = roleKpis.filter((k) => !DIALER_KEYS.has(k.key)); // includes dev KPIs
    mutedKpis = roleKpis.filter((k) => DIALER_KEYS.has(k.key));
  }

  // Per-rep channel swap: Marie enters Facebook (not Instagram); Sharyn the reverse.
  if (rep) {
    shown = shown.filter((k) => !isKpiHiddenForRep(rep.name, k.key));
    mutedKpis = mutedKpis.filter((k) => !isKpiHiddenForRep(rep.name, k.key));
  }

  const toItem = (k: (typeof roleKpis)[number]) => ({
    kpiId: k.id,
    kpiKey: k.key,
    name: k.name,
    emoji: k.emoji,
    unit: k.unit as Unit,
    goalValue: rep ? resolveGoalWith(targets, k, rep.id, month) : null,
    goalKind: k.goalKind,
    userId: rep?.id ?? "",
    initial: toInputNumber(k.unit as Unit, values.get(`${k.id}|${rep?.id ?? ""}`)),
  });

  // Separate Money (results) from Activity (effort) — the scorecard layout.
  const moneyKpis = shown.filter((k) => k.category === "green");
  const activityKpis = shown.filter((k) => k.category !== "green");

  // Money / Activity score: goals hit out of goals set (from values saved so far).
  const hitOf = (k: (typeof roleKpis)[number]): boolean | null => {
    if (!rep) return null;
    const goal = resolveGoalWith(targets, k, rep.id, month);
    if (goal === null) return null; // tracked-only KPI, not scored
    const v = values.get(`${k.id}|${rep.id}`);
    if (v === undefined || v === null) return false;
    return statusVsGoal(k.goalKind, v, goal) === "hit";
  };
  const moneyScores = moneyKpis.map(hitOf).filter((x): x is boolean => x !== null);
  const actScores = activityKpis.map(hitOf).filter((x): x is boolean => x !== null);
  const moneyHit = moneyScores.filter(Boolean).length, moneyTot = moneyScores.length;
  const actHit = actScores.filter(Boolean).length, actTot = actScores.length;
  const onTrack = moneyTot > 0 ? moneyHit === moneyTot : actTot > 0 ? actHit >= Math.ceil(actTot * 0.6) : false;

  const groups: EntryGroup[] = [];
  if (rep) {
    if (moneyKpis.length > 0) groups.push({ title: "💰 Money — results", hint: "The outcomes that move revenue.", items: moneyKpis.map(toItem) });
    if (activityKpis.length > 0) groups.push({ title: focus === "developer" ? "📊 Activity — developer outreach" : "📊 Activity", hint: "Your daily effort.", items: activityKpis.map(toItem) });
    if (secRole && secRoleKpis.length > 0) {
      const secItems = secRoleKpis.filter((k) => !isKpiHiddenForRep(rep.name, k.key)).map(toItem);
      if (secItems.length > 0) groups.push({
        title: `🔁 ${positionLabel(secRole)} — secondary role (optional)`,
        hint: "You're cross-trained here. Log anything you did in this lane today — it counts on the scorecards, but skipping it never flags you.",
        items: secItems,
      });
    }
  }
  // Lead sources only appear on Marie's card; Text Responses is removed (auto-synced).
  const leadSourceItems = selectedId === marieId ? teamDaily.filter((k) => k.key !== "text_responses") : [];
  if (leadSourceItems.length > 0) {
    groups.push({
      title: "Lead sources",
      hint: "PPL / direct-mail leads + lead refunds — Marie owns these. (Text Responses auto-syncs.)",
      items: leadSourceItems.map((k) => ({
        kpiId: k.id,
        kpiKey: k.key,
        name: k.name,
        emoji: k.emoji,
        unit: k.unit as Unit,
        goalValue: resolveGoalWith(targets, k, null, month),
        goalKind: k.goalKind,
        userId: "",
        initial: toInputNumber(k.unit as Unit, values.get(`${k.id}|`)),
      })),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Enter KPIs</h1>
          <p className="text-slate-500">{friendlyDate(date)}</p>
        </div>
        {isManager(me) && (
          <form action={refreshCrmToday}>
            <button className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700" title="Pull today's calls + offers/contracts from REI Reply now">🔄 Sync CRM</button>
          </form>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {reps.map((r) => {
          const active = r.id === selectedId;
          return (
            <Link
              key={r.id}
              href={`/entry?user=${r.id}${sp.date ? `&date=${sp.date}` : ""}`}
              className={`rounded-full px-4 py-2 text-sm font-medium border ${
                active
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {r.name}
              <span className={`ml-1.5 text-xs ${active ? "text-slate-300" : "text-slate-400"}`}>
                {positionLabel(r.position)}
              </span>
            </Link>
          );
        })}
      </div>

      <form className="flex items-center gap-2 text-sm" action="/entry" method="get">
        {selectedId && <input type="hidden" name="user" value={selectedId} />}
        <label className="text-slate-500">Date</label>
        <input
          type="date"
          name="date"
          defaultValue={date}
          className="rounded-md border border-slate-300 px-3 py-1.5"
        />
        <button className="rounded-md bg-slate-200 px-3 py-1.5 font-medium hover:bg-slate-300">Go</button>
      </form>

      {(sp.saved || sp.err) && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 ${sp.err ? "bg-red-50 text-red-800 ring-red-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"}`}>
          {sp.err ? `⚠️ ${sp.err}` : `✓ Recorded ${sp.saved}`}
        </div>
      )}

      {/* Owner-only bulk lead import — record a batch we uploaded ourselves (e.g. a PPL list
          we didn't buy through the provider) straight to the team KPI, any date, no rep card. */}
      {isOwner(me) && (
        <Card className="border-l-4 border-brand-gold p-4">
          <div className="text-sm font-bold text-slate-800">📥 Bulk lead import <span className="font-normal text-slate-400">(owner)</span></div>
          <p className="mt-0.5 text-xs text-slate-500">Uploaded a batch of leads yourself instead of buying through the provider? Record it here — writes straight to the team KPI for any date, no rep card needed.</p>
          <form action={importTeamLeads} className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-xs font-semibold text-slate-500">Lead type
              <select name="kpiKey" defaultValue="ppl_leads" className="mt-0.5 block rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                {teamDaily.filter((k) => k.key !== "text_responses").map((k) => <option key={k.id} value={k.key}>{k.emoji} {k.name}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-500">Date
              <input type="date" name="date" defaultValue={date} className="mt-0.5 block rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500"># of leads
              <input type="number" name="count" min="0" step="1" placeholder="215" required className="mt-0.5 block w-28 rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-500">How
              <select name="mode" defaultValue="set" className="mt-0.5 block rounded-md border border-slate-300 px-3 py-1.5 text-sm">
                <option value="set">Set to</option>
                <option value="add">Add to existing</option>
              </select>
            </label>
            <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Record leads</button>
          </form>
        </Card>
      )}

      {rep && isDispo && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
          <div>
            <div className="text-sm font-semibold text-slate-700">Today&apos;s focus</div>
            <div className="text-xs text-slate-400">Developer/luxury days score outreach, not the dialer.</div>
          </div>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {(["traditional", "developer"] as const).map((f) => (
              <form key={f} action={setDayFocus}>
                <input type="hidden" name="userId" value={rep.id} />
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="focus" value={f} />
                <button className={`rounded-md px-3 py-1.5 text-sm font-semibold ${focus === f ? "bg-brand-navy text-white shadow" : "text-slate-500 hover:text-slate-700"}`}>
                  {f === "traditional" ? "Traditional" : "Developer / luxury"}
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {rep && (moneyTot > 0 || actTot > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">💰 Money</div>
            <div className={`mt-0.5 text-3xl font-extrabold tabular-nums ${moneyTot > 0 && moneyHit === moneyTot ? "text-emerald-600" : "text-slate-800"}`}>{moneyHit} / {moneyTot}</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">📊 Activity</div>
            <div className={`mt-0.5 text-3xl font-extrabold tabular-nums ${actTot > 0 && actHit === actTot ? "text-emerald-600" : "text-slate-800"}`}>{actHit} / {actTot}</div>
          </Card>
          <Card className={`col-span-2 grid place-items-center p-4 sm:col-span-1 ${onTrack ? "bg-emerald-900/90" : "bg-slate-100"}`}>
            <div className={`text-lg font-bold ${onTrack ? "text-emerald-300" : "text-slate-500"}`}>{onTrack ? "✓ On track" : "In progress"}</div>
          </Card>
        </div>
      )}

      {rep && myAlerts.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
          <h2 className="text-base font-bold text-slate-800">⚠️ Your flagged KPIs</h2>
          <p className="mb-3 text-sm text-slate-500">Add a quick reason so your manager has the context. This doesn&apos;t clear the flag — it just explains it.</p>
          <div className="space-y-2">
            {myAlerts.map((a) => (
              <div key={a.id} className="rounded-lg bg-white p-3 ring-1 ring-amber-100">
                <div className="text-sm font-semibold text-slate-700">{a.kpi.emoji} {a.message}</div>
                <div className="text-xs text-slate-400">{friendlyDate(a.date)}</div>
                {a.repReason ? (
                  <p className="mt-1.5 rounded-md bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">You said: {a.repReason}</p>
                ) : (
                  <form action={addRepReason} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={a.id} />
                    <input name="repReason" placeholder="e.g. internet down 2 hrs / had 2 closings" className="min-w-56 flex-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-sm" />
                    <button className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700">Add reason</button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {rep && internetKpi && (
        <SpeedTestCard
          key={`${rep.id}|${date}`}
          userId={rep.id}
          date={date}
          goal={internetGoal ?? 50}
          initial={internetInitial}
        />
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          No daily KPIs for this role yet. Add some in{" "}
          <Link href="/admin" className="text-slate-900 underline">Admin</Link>.
        </div>
      ) : (
        <EntryForm groups={groups} date={date} enteredBy={rep?.name ?? "team"} action={saveDay} />
      )}

      {mutedKpis.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          {mutedKpis.map((k) => (
            <div key={k.id} className="flex items-center justify-between text-sm text-slate-400">
              <span>{k.emoji} {k.name}</span>
              <span className="text-xs">not counted today · developer focus</span>
            </div>
          ))}
        </div>
      )}

      {/* End-of-day reminder to upload calls for scoring */}
      {rep && ["acquisitions", "dispositions", "listings"].includes(rep.position) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-l-4 border-emerald-400 bg-emerald-50/70 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-800">📞 Before you log off — upload your calls for scoring</div>
            <div className="text-xs text-slate-500">
              {rep.position === "acquisitions"
                ? "Upload your process calls, offer calls, and contract calls (sent / rejected) so we can review and coach."
                : "Upload your buyer & developer calls so we can review and coach."}
            </div>
          </div>
          <Link href="/call-scoring" className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">🎧 Upload a call →</Link>
        </div>
      )}
    </div>
  );
}
