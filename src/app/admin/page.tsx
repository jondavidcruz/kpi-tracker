import Link from "next/link";
import { createKpi, saveKpi, saveSettings, saveUser } from "@/app/actions";
import { getAllUsers, getKpis, getSettings } from "@/lib/data";
import { toInputNumber, type Unit } from "@/lib/format";
import { categoryMeta } from "@/lib/kpi";
import { POSITIONS } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";
import { getCurrentUser, isManager } from "@/lib/auth";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Phoenix", "UTC",
];

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;

  // Admin is restricted to managers/admins.
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <p className="mt-2 text-sm text-slate-500">
          The Admin area is limited to managers. If you need access, ask an admin to set your
          role to “manager.”
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const [settings, users, kpis] = await Promise.all([getSettings(), getAllUsers(), getKpis()]);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold tracking-tight">Admin &amp; Settings</h1>
      </div>

      {sp.saved && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white">✓</span>
          Saved “{sp.saved}”.
        </div>
      )}

      {/* Alerts & schedule */}
      <section>
        <SectionTitle title="Alerts & schedule" subtitle="Where off-target alerts go, and when missing-entry checks fire" accent="bg-red-400" />
        <Card className="p-6">
          <form action={saveSettings} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className={labelCls}>Google Chat webhook URL</span>
              <input name="googleChatWebhook" defaultValue={settings.googleChatWebhook} placeholder="https://chat.googleapis.com/v1/spaces/…" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Alert email recipients (comma-separated)</span>
              <input name="alertEmailRecipients" defaultValue={settings.alertEmailRecipients} placeholder="manager@co.com, owner@co.com" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Email from address</span>
              <input name="emailFromAddress" defaultValue={settings.emailFromAddress} placeholder="kpi-alerts@co.com" className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Workday cutoff (missing-entry check)</span>
              <input type="time" name="workdayCutoff" defaultValue={settings.workdayCutoff} className={inputCls} />
            </label>
            <label>
              <span className={labelCls}>Org timezone</span>
              <select name="orgTimezone" defaultValue={settings.orgTimezone} className={inputCls}>
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </label>
            <div className="sm:col-span-2">
              <SaveBtn>Save settings</SaveBtn>
            </div>
          </form>
        </Card>
      </section>

      {/* People */}
      <section>
        <SectionTitle title="People" subtitle="Position decides which scorecard a rep sees and is alerted on" accent="bg-sky-400" />
        <Card className="p-6">
          {/* column headers */}
          <div className="mb-2 hidden gap-2 px-1 text-xs font-semibold text-slate-400 md:flex">
            <span className="w-32">Name</span>
            <span className="w-56">Email</span>
            <span className="w-28">Access</span>
            <span className="w-44">Scorecard</span>
            <span className="flex-1">Note</span>
          </div>
          <div className="space-y-2">
            {users.map((u) => (
              <form key={u.id} action={saveUser} className="flex flex-wrap items-center gap-2 rounded-lg p-1 hover:bg-slate-50">
                <input type="hidden" name="id" value={u.id} />
                <input name="name" defaultValue={u.name} className={`${inputCls} w-32`} />
                <input name="email" defaultValue={u.email} className={`${inputCls} w-56`} />
                <select name="role" defaultValue={u.role} className={`${inputCls} w-28`}>
                  <option value="rep">rep</option><option value="manager">manager</option><option value="admin">admin</option>
                </select>
                <select name="position" defaultValue={u.position} className={`${inputCls} w-44`}>
                  <option value="">— none —</option>
                  {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
                <input name="note" defaultValue={u.note} placeholder="note" className={`${inputCls} min-w-40 flex-1`} />
                <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked={u.active} /> active</label>
                <SaveBtn small>Save</SaveBtn>
              </form>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Add a person</p>
            <form action={saveUser} className="flex flex-wrap items-center gap-2">
              <input name="name" placeholder="Name" className={`${inputCls} w-32`} />
              <input name="email" placeholder="email@co.com" className={`${inputCls} w-56`} />
              <select name="role" defaultValue="rep" className={`${inputCls} w-28`}>
                <option value="rep">rep</option><option value="manager">manager</option><option value="admin">admin</option>
              </select>
              <select name="position" defaultValue="" className={`${inputCls} w-44`}>
                <option value="">— none —</option>
                {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked /> active</label>
              <SaveBtn small>+ Add person</SaveBtn>
            </form>
          </div>
        </Card>
      </section>

      {/* KPIs */}
      <section>
        <SectionTitle title="KPIs & goals" subtitle="Category drives alert urgency · duration goals are in minutes" accent="bg-emerald-400" />
        <Card className="p-6">
          {[...POSITIONS.map((p) => ({ key: p.key, label: `${p.emoji} ${p.label}` })), { key: "", label: "🏢 Team / shared" }].map((group) => {
            const groupKpis = kpis.filter((k) => (group.key === "" ? k.scope === "team" : k.roleKey === group.key));
            if (groupKpis.length === 0) return null;
            return (
              <div key={group.key || "team"} className="mb-6 last:mb-0">
                <h3 className="mb-2 text-sm font-bold text-slate-600">{group.label}</h3>
                <div className="space-y-1.5">
                  {groupKpis.map((k) => {
                    const cat = categoryMeta(k.category);
                    return (
                      <form key={k.id} action={saveKpi} className="flex flex-wrap items-center gap-2 rounded-lg p-1 hover:bg-slate-50">
                        <input type="hidden" name="id" value={k.id} />
                        <input type="hidden" name="unit" value={k.unit} />
                        <span className="w-48 truncate text-sm font-semibold text-slate-700">{k.emoji} {k.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cat.cls}`}>{k.scope === "per_rep" ? "rep" : "team"}·{k.cadence}</span>
                        <select name="category" defaultValue={k.category} className={`${inputCls} w-32`}>
                          <option value="green">🟢 money</option><option value="blue">🔵 activity</option><option value="yellow">🟡 visibility</option><option value="red">🔴 none</option>
                        </select>
                        <select name="roleKey" defaultValue={k.roleKey} disabled={k.scope === "team"} className={`${inputCls} w-24 disabled:bg-slate-100`}>
                          <option value="">team</option>
                          {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.short}</option>)}
                        </select>
                        <select name="goalKind" defaultValue={k.goalKind} className={`${inputCls} w-28`}>
                          <option value="at_least">at least</option><option value="at_most">at most</option><option value="exact">exact</option><option value="tracked">tracked</option>
                        </select>
                        <input name="goalValue" defaultValue={k.computed ? "" : toInputNumber(k.unit as Unit, k.goalValue)} placeholder={k.unit === "duration" ? "min" : "goal"} disabled={k.computed} className={`${inputCls} w-20 disabled:bg-slate-100`} />
                        <label className="flex items-center gap-1 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked={k.active} /> on</label>
                        <SaveBtn small>Save</SaveBtn>
                      </form>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Add KPI */}
          <div className="mt-2 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200">
            <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">+ Add a KPI</p>
            <form action={createKpi} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
              <label className="col-span-2"><span className={labelCls}>Name</span><div className="flex gap-1"><input name="emoji" placeholder="🆕" className={`${inputCls} w-12`} /><input name="name" placeholder="KPI name" className={inputCls} /></div></label>
              <label><span className={labelCls}>Scope</span><select name="scope" defaultValue="per_rep" className={inputCls}><option value="per_rep">per rep</option><option value="team">team</option></select></label>
              <label><span className={labelCls}>Role</span><select name="roleKey" defaultValue="cc_lm" className={inputCls}>{POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.short}</option>)}</select></label>
              <label><span className={labelCls}>Cadence</span><select name="cadence" defaultValue="daily" className={inputCls}><option value="daily">daily</option><option value="monthly">monthly</option></select></label>
              <label><span className={labelCls}>Unit</span><select name="unit" defaultValue="count" className={inputCls}><option value="count">count</option><option value="duration">duration</option><option value="percent">percent</option><option value="currency">currency</option><option value="ratio">ratio</option></select></label>
              <label><span className={labelCls}>Category</span><select name="category" defaultValue="blue" className={inputCls}><option value="green">🟢 money</option><option value="blue">🔵 activity</option><option value="yellow">🟡 visibility</option><option value="red">🔴 none</option></select></label>
              <label><span className={labelCls}>Goal</span><div className="flex gap-1"><select name="goalKind" defaultValue="at_least" className={`${inputCls} w-20`}><option value="at_least">≥</option><option value="at_most">≤</option><option value="tracked">—</option></select><input name="goalValue" placeholder="#" className={`${inputCls} w-16`} /></div></label>
              <div className="col-span-2 flex items-end sm:col-span-4 lg:col-span-8"><SaveBtn small>Create KPI</SaveBtn><span className="ml-3 text-xs text-slate-400">Use this to build out new Lead-Manager metrics as you finalize them.</span></div>
            </form>
          </div>
        </Card>
      </section>
    </div>
  );
}

function SaveBtn({ children, small }: { children: React.ReactNode; small?: boolean }) {
  return (
    <button className={`rounded-lg bg-slate-900 font-semibold text-white shadow-sm transition hover:bg-slate-700 ${small ? "px-3 py-1.5 text-sm" : "px-5 py-2.5 text-sm"}`}>
      {children}
    </button>
  );
}
