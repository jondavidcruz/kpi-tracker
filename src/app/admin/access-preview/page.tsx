import Link from "next/link";
import { getCurrentUser, isManager, isAdmin, canAccessMarketing, canAccessPayroll, canAccessCSuite, canTrackTime, isOwner, isCSuitePerson } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { positionLabel } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";
import { saveUserAccess } from "@/app/actions";
import { NAV_GROUPS, parseNavHidden, type NavGate } from "@/lib/navItems";

export const dynamic = "force-dynamic";

// Uses the shared NAV_GROUPS (same list the sidebar renders) so the preview + editor
// match a person's real menu exactly.
const GATE_LABEL: Record<NavGate, string> = { all: "Everyone", manager: "Managers", admin: "Owner-level", marketing: "Marketing crew", csuite: "C-Suite (leadership)", training: "Coaching staff" };

export default async function AccessPreviewPage({ searchParams }: { searchParams: Promise<{ as?: string; saved?: string }> }) {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Access preview — restricted</h1>
        <p className="mt-1 text-sm text-slate-500">Managers only.</p>
        <Link href="/admin" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }
  const sp = await searchParams;
  const users = (await getAllUsers()).filter((u) => u.active);
  const selected = users.find((u) => u.id === sp.as) ?? users[0];
  if (!selected) return <Card className="p-6">No active team members.</Card>;

  const flags = {
    manager: isManager(selected),
    admin: isAdmin(selected),
    marketing: canAccessMarketing(selected),
    timecard: canTrackTime(selected),
    payroll: canAccessPayroll(selected),
    csuite: canAccessCSuite(selected),
    owner: isOwner(selected),
  };
  const trainFirst = selected.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const trains = flags.manager || ["michelle", "marie", "sharyn"].includes(trainFirst);
  // Does this person's ROLE allow the item (before the per-section hide override)?
  const roleAllows = (gate: NavGate) =>
    gate === "all" ? true :
    gate === "manager" ? flags.manager :
    gate === "admin" ? flags.admin :
    gate === "marketing" ? flags.marketing :
    gate === "csuite" ? flags.csuite :
    gate === "training" ? trains : false;
  const hiddenSet = new Set(parseNavHidden(selected.navHidden));
  // Items the person could see (role-allowed) — the toggleable list for the editor.
  const availableHrefs = NAV_GROUPS.flatMap((g) => g.items.filter((it) => roleAllows(it.gate)).map((it) => it.href));
  const can = (it: { href: string; gate: NavGate }) => roleAllows(it.gate) && !hiddenSet.has(it.href);
  const editable = isAdmin(me); // only the owner edits access

  // Sensitive-data confirmations — the things you most want to verify.
  const sensitive = [
    { label: "C-Suite (War Room Health, P&L, Payroll, Roadmap, Roster)", ok: flags.csuite },
    { label: "Pay amounts ($ rates, gross, totals)", ok: flags.payroll },
    { label: "Markets & Buyers (buy boxes)", ok: flags.marketing },
    { label: "Alerts, PIPs, Analytics", ok: flags.manager },
    { label: "Admin settings", ok: flags.manager },
    { label: "Owner-only (AI updates, Issues)", ok: flags.admin },
  ];
  const firstName = selected.name.split(" ")[0];

  return (
    <div className="space-y-5">
      <SectionTitle title="🕵️ Access preview" subtitle="See exactly what each person's account can see — confirm nobody has access they shouldn't." accent="bg-slate-500"
        right={<Link href="/admin" className="text-sm font-semibold text-slate-500 hover:text-brand-navy">← Admin</Link>} />

      {/* Person picker */}
      <div className="flex flex-wrap gap-2">
        {users.map((u) => (
          <Link key={u.id} href={`/admin/access-preview?as=${u.id}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 transition ${u.id === selected.id ? "bg-brand-navy text-white ring-brand-navy" : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"}`}>
            {u.name}
          </Link>
        ))}
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-lg font-bold text-slate-800">{selected.name}</span>
          <span className="text-xs text-slate-400">{positionLabel(selected.position)}</span>
          <div className="ml-auto flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {flags.owner && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">Owner</span>}
            {flags.admin && !flags.owner && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700">Admin</span>}
            {flags.manager && !flags.admin && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-sky-700">Manager</span>}
            {flags.payroll && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">Sees pay $</span>}
            {flags.marketing && <span className="rounded bg-pink-100 px-1.5 py-0.5 text-pink-700">Marketing</span>}
            {!flags.manager && !flags.marketing && !flags.payroll && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">Standard team</span>}
          </div>
        </div>

        {/* Sensitive-data confirmation */}
        <div className="mt-4">
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Sensitive areas</div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {sensitive.map((s) => (
              <div key={s.label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ${s.ok ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
                <span className="text-base">{s.ok ? "✓" : "—"}</span>
                <span className="flex-1">{s.label}</span>
                <span className={`text-[10px] ${s.ok ? "font-bold text-emerald-700" : "text-slate-400"}`}>{s.ok ? "CAN SEE" : "hidden"}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Editable access — owner only */}
        {editable && (
          <form action={saveUserAccess} className="mt-4 border-t border-slate-100 pt-4">
            <input type="hidden" name="userId" value={selected.id} />
            <input type="hidden" name="navAvailable" value={JSON.stringify(availableHrefs)} />
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Edit {firstName}&apos;s access {sp.saved && <span className="ml-2 text-emerald-600">✓ saved</span>}</div>

            <div className="mb-1 text-[11px] font-semibold text-slate-500">Sensitive data</div>
            <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-1.5 text-sm text-slate-500">🔒 C-Suite &amp; pay ($ amounts, P&amp;L, payroll, roadmap, roster): <b className={isCSuitePerson(selected) ? "text-emerald-700" : "text-slate-700"}>{isCSuitePerson(selected) ? "Allowed" : "Locked"}</b></span>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="accessMarketing" defaultChecked={selected.accessMarketing} className="h-4 w-4 accent-brand-navy" /> Markets &amp; Buyers</label>
            </div>
            <p className="mb-3 text-[11px] text-slate-400">C-Suite &amp; pay data is hard-limited to <b>Jon, Enrico &amp; Viktoriia</b> — it can&apos;t be granted to anyone else here, and new hires never get it.</p>

            <div className="mb-1 text-[11px] font-semibold text-slate-500">Menu sections — uncheck to remove (hidden from their sidebar entirely)</div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {NAV_GROUPS.map((g) => {
                const items = g.items.filter((it) => roleAllows(it.gate));
                if (items.length === 0) return null;
                return (
                  <div key={g.group}>
                    <div className="mb-1 text-[11px] font-bold text-slate-600">{g.group}</div>
                    <div className="space-y-1">
                      {items.map((it) => (
                        <label key={it.href} className="flex items-center gap-2 text-[13px] text-slate-700">
                          <input type="checkbox" name="navShow" value={it.href} defaultChecked={!hiddenSet.has(it.href)} className="h-3.5 w-3.5 accent-brand-navy" /> {it.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700">Save access</button>
              <span className="text-[11px] text-slate-400">Manager / Admin level is set by their <strong>Role</strong> on the Admin page.</span>
            </div>
          </form>
        )}
      </Card>

      {/* Their menu */}
      <Card className="p-5">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Menu {selected.name.split(" ")[0]} sees</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV_GROUPS.map((g) => {
            const vis = g.items.filter((it) => can(it));
            const hid = g.items.filter((it) => !can(it));
            return (
              <div key={g.group}>
                <div className="mb-1 text-xs font-bold text-slate-600">{g.group}</div>
                <ul className="space-y-0.5 text-sm">
                  {vis.map((it) => (
                    <li key={it.href} className="flex items-center gap-1.5 text-slate-700"><span className="text-emerald-500">✓</span> {it.label}</li>
                  ))}
                  {hid.map((it) => (
                    <li key={it.href} className="flex items-center gap-1.5 text-slate-300 line-through" title={hiddenSet.has(it.href) ? "Hidden by you" : `Restricted to: ${GATE_LABEL[it.gate]}`}><span>✗</span> {it.label}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">✓ = appears in their sidebar · ✗ = hidden from them. The Wall display is visible to everyone.</p>
      </Card>
    </div>
  );
}
