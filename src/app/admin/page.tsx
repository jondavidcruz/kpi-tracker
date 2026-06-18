import Link from "next/link";
import { createKpi, saveKpi, saveSettings, saveUser, deleteUser, setTeamPassword, setMyPassword } from "@/app/actions";
import { adminConfigured } from "@/lib/supabase/admin";
import { getAllUsers, getKpis, getSettings } from "@/lib/data";
import { toInputNumber, type Unit } from "@/lib/format";
import { categoryMeta } from "@/lib/kpi";
import { POSITIONS, positionLabel } from "@/lib/roles";
import type { User } from "@prisma/client";
import { Card, SectionTitle } from "@/components/ui";
import { getCurrentUser, isManager, isAdmin } from "@/lib/auth";

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
  searchParams: Promise<{ saved?: string; pwok?: string; pwerr?: string }>;
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
  const activeUsers = users.filter((u) => u.active);
  const removedUsers = users.filter((u) => !u.active);
  const canDelete = isAdmin(me);

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

      {/* Backup & security — owner only */}
      {isAdmin(me) && (
        <section>
          <SectionTitle title="🗄️ Backup & security" subtitle="Keep a copy of everything, and control who can get in" accent="bg-slate-500" />
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3">
              <a href="/api/backup" className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">⬇️ Download full backup (JSON)</a>
              <span className="text-xs text-slate-500">A complete export of every table — download anytime.</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>📧 <strong>Nightly off-site backup:</strong> a full JSON export is emailed to you automatically every morning (≈9am UTC) — keep those emails as your rolling copies.</li>
              <li>⏱️ <strong>Real-time backup (primary):</strong> turn on Supabase <strong>Point-in-Time Recovery</strong> for continuous, restore-to-any-second backups → Supabase dashboard → <em>Database → Backups → enable PITR</em>. (Daily automated backups are already on with the Pro plan.)</li>
              <li>🔒 <strong>Invite-only signups:</strong> the app already blocks anyone without an account you created — but to fully lock the door, disable public sign-ups in Supabase → <em>Authentication → Sign In / Providers → Email → turn OFF “Allow new users to sign up.”</em> After that, accounts exist <strong>only</strong> when you create them below.</li>
            </ul>
          </Card>
        </section>
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
            <label className="sm:col-span-2">
              <span className={labelCls}>Weekly report email recipients (Monday AM team KPIs)</span>
              <input name="weeklyEmailRecipients" defaultValue={settings.weeklyEmailRecipients} placeholder="you@gmail.com, marie@gmail.com" className={inputCls} />
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
            <label>
              <span className={labelCls}>Annual revenue goal ($) for the weekly report</span>
              <input name="annualRevenueGoal" defaultValue={settings.annualRevenueGoal || ""} placeholder="e.g. 1000000" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Ethan shift-reminder email</span>
              <input name="ethanReminderEmail" defaultValue={settings.ethanReminderEmail} placeholder="ethan@gmail.com" className={inputCls} />
            </label>
            <label className="sm:col-span-2">
              <span className={labelCls}>Ethan shift calendar — secret iCal URL (Google Calendar → AQ Shift → Settings → “Secret address in iCal format”)</span>
              <input name="ethanShiftIcsUrl" defaultValue={settings.ethanShiftIcsUrl} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" className={inputCls} />
              <span className="mt-1 block text-[11px] text-slate-400">On days the calendar shows “Ethan - AQ Shift”, he gets an end-of-day email if he hasn’t logged his KPIs.</span>
            </label>
            <div className="sm:col-span-2">
              <SaveBtn>Save settings</SaveBtn>
            </div>
          </form>
        </Card>
      </section>

      {/* People */}
      <section>
        <SectionTitle title="People" subtitle={`${activeUsers.length} active · position decides which scorecard a rep sees`} accent="bg-sky-400" />

        <div className="space-y-3">
          {activeUsers.map((u) => <PersonCard key={u.id} u={u} />)}
        </div>

        {/* Add a person */}
        <Card className="mt-4 p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Add a person</p>
          <form action={saveUser} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label><span className={labelCls}>Name</span><input name="name" placeholder="Full name" className={inputCls} /></label>
              <label><span className={labelCls}>Email (personal Gmail for login)</span><input name="email" placeholder="name@gmail.com" className={inputCls} /></label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label><span className={labelCls}>Access</span><select name="role" defaultValue="rep" className={inputCls}><option value="rep">rep</option><option value="manager">manager</option><option value="admin">admin</option></select></label>
              <label><span className={labelCls}>Scorecard</span><select name="position" defaultValue="" className={inputCls}><option value="">none</option>{POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
              <label className="flex items-end gap-4 pb-1">
                <span className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked /> active</span>
                <span className="flex items-center gap-1.5 text-sm text-slate-600" title="Show the internet speed test on this person's entry screen"><input type="checkbox" name="tracksInternet" /> ⚡️ speed test</span>
              </label>
            </div>
            <div><SaveBtn small>+ Add person</SaveBtn></div>
          </form>
        </Card>

        {/* Removed / inactive — tucked away so the main list stays clean */}
        {removedUsers.length > 0 && (
          <details className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
            <summary className="cursor-pointer text-sm font-semibold text-slate-600">
              🗄 Removed / inactive ({removedUsers.length}) — hidden from the team
            </summary>
            <p className="mt-2 text-xs text-slate-400">These people are locked out and don&apos;t appear on any scorecard. Re-check &quot;active&quot; + Save to bring someone back, or delete permanently to purge their name and history.</p>
            <div className="mt-3 space-y-3">
              {removedUsers.map((u) => <PersonCard key={u.id} u={u} removed canDelete={canDelete} />)}
            </div>
          </details>
        )}
      </section>

      {/* Login & passwords */}
      <section id="access" className="scroll-mt-4">
        <SectionTitle title="🔑 Login & passwords" subtitle="The team signs in with email + password — no email links needed" accent="bg-brand-gold" />

        {sp.pwok && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Password set for {sp.pwok === "you" ? "you" : sp.pwok}.</div>}
        {sp.pwerr === "nokey" && <div className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">Add <code>SUPABASE_SERVICE_ROLE_KEY</code> in Vercel to set team passwords here (see note below).</div>}
        {sp.pwerr === "short" && <div className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Password must be at least 8 characters.</div>}
        {sp.pwerr === "1" && <div className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">Couldn&apos;t set that password — try again.</div>}

        {/* Change my own password — any manager */}
        <Card className="p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Change my password</p>
          <form action={setMyPassword} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="to" value="/admin" />
            <label className="flex-1"><span className={labelCls}>New password (8+ characters)</span><input type="password" name="password" autoComplete="new-password" minLength={8} required className={inputCls} /></label>
            <SaveBtn small>Update my password</SaveBtn>
          </form>
        </Card>

        {/* Set the team's passwords — owner only */}
        {isAdmin(me) && (
          <Card className="mt-4 p-5">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">Set a team member&apos;s password</p>
            <p className="mb-3 text-xs text-slate-500">Give each person a password and share it with them — no emails involved. They can change it later from their own Admin screen.</p>
            {!adminConfigured() ? (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                One-time setup: in Vercel → your project → Settings → Environment Variables, add <code>SUPABASE_SERVICE_ROLE_KEY</code> (from Supabase → Settings → API → <code>service_role</code> secret), then redeploy. After that this tool turns on.
              </div>
            ) : (
              <div className="space-y-2">
                {activeUsers.map((u) => (
                  <form key={u.id} action={setTeamPassword} className="flex flex-wrap items-end gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                    <input type="hidden" name="email" value={u.email} />
                    <div className="min-w-40 flex-1">
                      <div className="text-sm font-semibold text-slate-700">{u.name}</div>
                      <div className="text-xs text-slate-400">{u.email}</div>
                    </div>
                    <input type="password" name="password" autoComplete="new-password" minLength={8} placeholder="new password (8+)" className={`${inputCls} max-w-56`} required />
                    <button className="rounded-lg bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Set</button>
                  </form>
                ))}
              </div>
            )}
          </Card>
        )}
      </section>

      {/* Weekly reviews — owner-private (admin only) */}
      {isAdmin(me) && (
        <section>
          <SectionTitle title="Weekly performance reviews 🔒" subtitle="Owner-only · keep / coach / reassign decisions" accent="bg-violet-400" />
          <Card className="p-6">
            <div className="flex flex-wrap gap-2">
              {users.filter((u) => u.position).map((u) => (
                <span key={u.id} className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                  <Link href={`/review/${u.id}`} className="bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200">
                    📋 {u.name}
                  </Link>
                  <Link href={`/review/${u.id}/export`} className="border-l border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100" title={`Printable all-time KPI record for ${u.name} (Save as PDF)`}>
                    📄 PDF
                  </Link>
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">Only you (admin) can see this section. &quot;📄 PDF&quot; opens a printable all-time KPI record — use it to archive someone&apos;s history before removing them.</p>
          </Card>
        </section>
      )}

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
              <label><span className={labelCls}>Role</span><select name="roleKey" defaultValue="acquisitions" className={inputCls}>{POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.short}</option>)}</select></label>
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

// One person, laid out clearly (name/email on top, role/scorecard/note below).
function PersonCard({ u, removed, canDelete }: { u: User; removed?: boolean; canDelete?: boolean }) {
  // Show an archived role (e.g. retired Cold Call/Lead Mgr) as a labelled option
  // so it doesn't silently fall back to "none".
  const knownPosition = POSITIONS.some((p) => p.key === u.position);
  return (
    <div className={`rounded-xl p-4 ring-1 ${removed ? "bg-white ring-slate-200" : "bg-white ring-slate-200"}`}>
      <form action={saveUser} className="space-y-3">
        <input type="hidden" name="id" value={u.id} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label><span className={labelCls}>Name</span><input name="name" defaultValue={u.name} className={inputCls} /></label>
          <label><span className={labelCls}>Email</span><input name="email" defaultValue={u.email} className={inputCls} /></label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label><span className={labelCls}>Access</span>
            <select name="role" defaultValue={u.role} className={inputCls}>
              <option value="rep">rep</option><option value="manager">manager</option><option value="admin">admin</option>
            </select>
          </label>
          <label><span className={labelCls}>Scorecard</span>
            <select name="position" defaultValue={u.position} className={inputCls}>
              <option value="">none</option>
              {!knownPosition && u.position && <option value={u.position}>{positionLabel(u.position)} (archived)</option>}
              {POSITIONS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          <label><span className={labelCls}>Note</span><input name="note" defaultValue={u.note} placeholder="optional" className={inputCls} /></label>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" name="active" defaultChecked={u.active} /> active</label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600" title="Show the internet speed test on this person's entry screen"><input type="checkbox" name="tracksInternet" defaultChecked={u.tracksInternet} /> ⚡️ speed test</label>
          <div className="ml-auto"><SaveBtn small>Save</SaveBtn></div>
        </div>
      </form>

      {removed && canDelete && (
        <form action={deleteUser} className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-2">
          <input type="hidden" name="id" value={u.id} />
          <span className="mr-auto text-xs text-slate-400">Permanently remove {u.name.split(" ")[0]} and all their history</span>
          <button className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">🗑 Delete permanently</button>
        </form>
      )}
    </div>
  );
}
