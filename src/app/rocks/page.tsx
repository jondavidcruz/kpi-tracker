import { addRock, updateRockStatus, editRock, deleteRock } from "@/app/actions";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getSettings, getActiveReps } from "@/lib/data";
import { db } from "@/lib/db";
import { todayStr } from "@/lib/date";
import { quarterOf, quarterEnd, quarterLabel } from "@/lib/eos";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

const STATUS: Record<string, { label: string; pill: string; bar: string }> = {
  on_track: { label: "On track", pill: "bg-emerald-100 text-emerald-800", bar: "bg-emerald-500" },
  off_track: { label: "Off track", pill: "bg-red-100 text-red-700", bar: "bg-red-500" },
  done: { label: "Done", pill: "bg-sky-100 text-sky-800", bar: "bg-sky-500" },
};

function RockCard({ r, canEdit, leader, reps, fmt }: {
  r: { id: string; title: string; owner: string; isCompany: boolean; quarter: string; dueDate: string; status: string; progress: number; milestones: string; notes: string };
  canEdit: boolean; leader: boolean; reps: { name: string }[]; fmt: (d: string) => string;
}) {
  const st = STATUS[r.status] ?? STATUS.on_track;
  const steps = r.milestones.split("\n").map((s) => s.trim()).filter(Boolean);
  return (
    <Card className="p-4">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${st.pill}`}>{st.label}</span>
        {r.isCompany
          ? <span className="rounded-md bg-brand-navy px-1.5 py-0.5 text-[11px] font-semibold text-white">🏢 Company</span>
          : <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{r.owner || "Unassigned"}</span>}
        <span className="flex-1 font-bold text-slate-800">{r.title}</span>
        {r.dueDate && <span className="text-xs text-slate-400">due {fmt(r.dueDate)}</span>}
      </div>

      <div className="mb-2 flex items-center gap-2">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div className={`absolute inset-y-0 left-0 rounded-full ${st.bar} transition-all`} style={{ width: `${Math.max(0, Math.min(100, r.progress))}%` }} />
        </div>
        <span className="w-9 text-right text-xs font-semibold text-slate-500">{r.progress}%</span>
      </div>

      {steps.length > 0 && (
        <ul className="mb-2 space-y-0.5">
          {steps.map((s, i) => <li key={i} className="text-xs text-slate-600">• {s}</li>)}
        </ul>
      )}
      {r.notes && <p className="mb-2 whitespace-pre-wrap text-xs text-slate-500">{r.notes}</p>}

      {canEdit && (
        <form action={updateRockStatus} className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-2.5">
          <input type="hidden" name="id" value={r.id} />
          <label><span className={labelCls}>Status</span>
            <select name="status" defaultValue={r.status} className={`${inputCls} w-32`}>{Object.keys(STATUS).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}</select>
          </label>
          <label><span className={labelCls}>Progress %</span>
            <input name="progress" type="number" min={0} max={100} defaultValue={r.progress} className={`${inputCls} w-24`} />
          </label>
          <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Update</button>
        </form>
      )}

      {leader && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-brand-navy">Edit / delete</summary>
          <form action={editRock} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input type="hidden" name="id" value={r.id} />
            <label className="sm:col-span-2"><span className={labelCls}>Title</span><input name="title" defaultValue={r.title} className={inputCls} required /></label>
            <label><span className={labelCls}>Owner</span>
              <select name="owner" defaultValue={r.owner} className={inputCls}>
                <option value="">— (set company below)</option>
                {reps.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 pt-6 text-sm text-slate-600"><input type="checkbox" name="isCompany" defaultChecked={r.isCompany} /> Company rock</label>
            <label><span className={labelCls}>Quarter</span><input name="quarter" defaultValue={r.quarter} className={inputCls} /></label>
            <label><span className={labelCls}>Due date</span><input name="dueDate" type="date" defaultValue={r.dueDate} className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Milestones (one per line)</span><textarea name="milestones" defaultValue={r.milestones} rows={3} className={inputCls} /></label>
            <label className="sm:col-span-2"><span className={labelCls}>Notes</span><textarea name="notes" defaultValue={r.notes} rows={2} className={inputCls} /></label>
            <div className="sm:col-span-2"><button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save changes</button></div>
          </form>
          <form action={deleteRock} className="mt-1.5">
            <input type="hidden" name="id" value={r.id} />
            <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete this rock</button>
          </form>
        </details>
      )}
    </Card>
  );
}

export default async function RocksPage({ searchParams }: { searchParams: Promise<{ saved?: string; empty?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const leader = isManager(me);
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const thisQuarter = quarterOf(today);
  const [rocks, reps] = await Promise.all([
    db.rock.findMany({ where: { quarter: thisQuarter }, orderBy: [{ isCompany: "desc" }, { owner: "asc" }, { createdAt: "asc" }] }),
    getActiveReps(),
  ]);

  const fmt = (ymd: string) => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
  };
  const canEditRock = (owner: string) => leader || owner === me.name;

  const company = rocks.filter((r) => r.isCompany);
  const individual = rocks.filter((r) => !r.isCompany);
  const done = rocks.filter((r) => r.status === "done").length;
  const offTrack = rocks.filter((r) => r.status === "off_track").length;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="🪨 Rocks"
        subtitle={`The 3–7 priorities that must get done this quarter — ${quarterLabel(thisQuarter)}. Quarterly, not daily.`}
        accent="bg-brand-gold"
        right={<div className="flex gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{rocks.length} rocks</span>
          <span className="rounded-full bg-sky-100 px-2.5 py-1 font-semibold text-sky-800">{done} done</span>
          {offTrack > 0 && <span className="rounded-full bg-red-100 px-2.5 py-1 font-semibold text-red-700">{offTrack} off track</span>}
        </div>}
      />

      {sp.saved && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Rock saved.</div>}
      {sp.empty && <div className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Add a title before saving.</div>}

      {/* Add */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Add a rock for {quarterLabel(thisQuarter)}</h3>
        <form action={addRock} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <input type="hidden" name="quarter" value={thisQuarter} />
          <label className="sm:col-span-2"><span className={labelCls}>What must get done this quarter?</span><input name="title" placeholder="e.g. Hire & ramp a 2nd dispo rep" className={inputCls} required /></label>
          {leader ? (
            <label><span className={labelCls}>Owner</span>
              <select name="owner" defaultValue={me.name} className={inputCls}>{reps.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}</select>
            </label>
          ) : <input type="hidden" name="owner" value={me.name} />}
          <label className="sm:col-span-2"><span className={labelCls}>Milestones — break it into steps (one per line)</span><textarea name="milestones" rows={2} placeholder={"Write JD\nPost + screen\nOffer signed"} className={inputCls} /></label>
          <label><span className={labelCls}>Due date</span><input name="dueDate" type="date" defaultValue={quarterEnd(today)} className={inputCls} /></label>
          {leader && <label className="flex items-center gap-2 text-sm text-slate-600 sm:col-span-3"><input type="checkbox" name="isCompany" /> This is a <strong>company</strong> rock (no single owner)</label>}
          <div className="sm:col-span-3"><button className="rounded-lg bg-brand-navy px-5 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Add rock</button></div>
        </form>
      </Card>

      {/* Company rocks */}
      <div>
        <SectionTitle title="🏢 Company Rocks" subtitle="The whole team's priorities this quarter" accent="bg-brand-navy" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {company.length === 0 && <Card className="p-8 text-center text-slate-400 lg:col-span-2">No company rocks yet.</Card>}
          {company.map((r) => <RockCard key={r.id} r={r} canEdit={canEditRock(r.owner)} leader={leader} reps={reps} fmt={fmt} />)}
        </div>
      </div>

      {/* Individual rocks */}
      <div>
        <SectionTitle title="🙋 Individual Rocks" subtitle="Each person's quarterly priority — everyone can see everyone's" accent="bg-sky-400" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {individual.length === 0 && <Card className="p-8 text-center text-slate-400 lg:col-span-2">No individual rocks yet.</Card>}
          {individual.map((r) => <RockCard key={r.id} r={r} canEdit={canEditRock(r.owner)} leader={leader} reps={reps} fmt={fmt} />)}
        </div>
      </div>
    </div>
  );
}
