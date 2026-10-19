import Link from "next/link";
import { getCurrentUser, isManager, isAdmin, canAccessMarketing, canAccessPayroll, canAccessCSuite, canTrackTime, isOwner, isCSuitePerson, ONBOARDING_NAV } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { positionLabel } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";
import { saveUserAccess, applyDeptAccessAction } from "@/app/actions";
import { NAV_GROUPS, parseNavHidden, type NavGate } from "@/lib/navItems";
import PreviewPane from "./PreviewPane";

export const dynamic = "force-dynamic";

// Uses the shared NAV_GROUPS (same list the sidebar renders) so the preview + editor
// match a person's real menu exactly.
const GATE_LABEL: Record<NavGate, string> = { all: "Everyone", manager: "Managers", admin: "Owner-level", marketing: "Marketing crew", csuite: "C-Suite (leadership)", training: "Coaching staff" };

export default async function AccessPreviewPage({ searchParams }: { searchParams: Promise<{ as?: string; saved?: string; blank?: string }> }) {
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
  const hiddenArr = parseNavHidden(selected.navHidden);
  const hiddenSet = new Set(hiddenArr);
  // Match the REAL sidebar's hide rule exactly: a hidden parent (e.g. /crm) also
  // hides its children (/crm/next …). The editor checkboxes stay exact-match, but
  // the preview + ✓/✗ breakdown must mirror what actually renders, or they drift
  // from the live menu (Jon 2026-10-19: "it's not syncing with what they see").
  const isHiddenPath = (href: string) => hiddenArr.some((h) => href === h || href.startsWith(h + "/"));
  // Opt-in mode (Jon 2026-10-15): "Start blank" renders every box UNCHECKED so you
  // tick only what to GRANT, instead of unchecking everything you don't want.
  const blankStart = sp.blank === "1";
  // Items grantable in the editor. Marketing-gated rows (Vetted Buyers, Buyer
  // Research, Lead Sourcing) are ALWAYS listed — checking one grants the
  // Markets & Buyers flag on save, so the owner can just tick the sections
  // instead of hunting for the separate toggle.
  const grantable = (gate: NavGate) => roleAllows(gate) || gate === "marketing";
  const availableHrefs = NAV_GROUPS.flatMap((g) => g.items.filter((it) => grantable(it.gate)).map((it) => it.href));
  const can = (it: { href: string; gate: NavGate }) => roleAllows(it.gate) && !isHiddenPath(it.href);
  // Onboarding ramp overrides navHidden: the account only shows ONBOARDING_NAV
  // (learning + basics). So the LIVE preview must factor that in, not just navHidden.
  const onboardingLock = !!(selected as { onboarding?: boolean }).onboarding;
  const inOnboarding = (href: string) => ONBOARDING_NAV.some((p) => href === p || href.startsWith(p + "/"));
  const visibleItem = (it: { href: string; gate: NavGate }) => onboardingLock ? (roleAllows(it.gate) && inOnboarding(it.href)) : can(it);
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
         <div className="mt-4 border-t border-slate-100 pt-4">
          {/* ⚡ Department presets — one click grants everything in that department
              + the universal sections (Jon 2026-10-19). Separate form from Save. */}
          <div className="mb-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">⚡ Department preset — grant {firstName} a whole department at once</div>
            <form action={applyDeptAccessAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="userId" value={selected.id} />
              <button name="dept" value="acquisitions" className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700">🎯 Acquisitions access</button>
              <button name="dept" value="dispositions" className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-violet-700">📦 Dispositions access</button>
              <span className="text-[11px] text-slate-500">Grants that department&apos;s pages + Dashboard/KPIs/Coaching/Requests; hides the rest. Dispositions also gets Markets &amp; Buyers. You can fine-tune the checkboxes after.</span>
            </form>
          </div>

          <form key={`${selected.id}:${blankStart ? "blank" : "cur"}`} action={saveUserAccess}>
            <input type="hidden" name="userId" value={selected.id} />
            <input type="hidden" name="navAvailable" value={JSON.stringify(availableHrefs)} />
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Edit {firstName}&apos;s access {sp.saved && <span className="ml-2 text-emerald-600">✓ saved</span>}</span>
              <span className="ml-auto flex items-center gap-1.5 text-[11px]">
                <Link href={`/admin/access-preview?as=${selected.id}&blank=1`} className={`rounded-full px-2.5 py-0.5 font-bold ${blankStart ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>🧹 Start blank — grant only what I check</Link>
                {blankStart && <Link href={`/admin/access-preview?as=${selected.id}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-slate-600 hover:bg-slate-200">↩ Show current access</Link>}
              </span>
            </div>
            {blankStart && <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">Opt-in mode: everything&apos;s unchecked. Tick only the sections {firstName} should have, then Save. (Unticked = hidden from their sidebar.)</div>}

            <div className="mb-1 text-[11px] font-semibold text-slate-500">Sensitive data</div>
            <div className="mb-2 flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="flex items-center gap-1.5 text-sm text-slate-500">🔒 C-Suite &amp; pay ($ amounts, P&amp;L, payroll, roadmap, roster): <b className={isCSuitePerson(selected) ? "text-emerald-700" : "text-slate-700"}>{isCSuitePerson(selected) ? "Allowed" : "Locked"}</b></span>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="accessMarketing" defaultChecked={blankStart ? false : selected.accessMarketing} className="h-4 w-4 accent-brand-navy" /> Markets &amp; Buyers <span className="text-[11px] text-slate-400">(auto-granted when any 🩷 Buyers section below is checked)</span></label>
            </div>
            <p className="mb-3 text-[11px] text-slate-400">C-Suite &amp; pay data is hard-limited to <b>Jon, Enrico &amp; Viktoriia</b> — it can&apos;t be granted to anyone else here, and new hires never get it.</p>

            <div className="mb-1 text-[11px] font-semibold text-slate-500">Menu sections — uncheck to remove (hidden from their sidebar entirely)</div>
            <div className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {NAV_GROUPS.map((g) => {
                const items = g.items.filter((it) => grantable(it.gate));
                if (items.length === 0) return null;
                return (
                  <div key={g.group}>
                    <div className="mb-1 text-[11px] font-bold text-slate-600">{g.group}</div>
                    <div className="space-y-1">
                      {items.map((it) => (
                        <label key={it.href} className="flex items-center gap-2 text-[13px] text-slate-700">
                          <input type="checkbox" name="navShow" value={it.href} defaultChecked={blankStart ? false : (it.gate === "marketing" ? flags.marketing && !hiddenSet.has(it.href) : !hiddenSet.has(it.href))} className="h-3.5 w-3.5 accent-brand-navy" /> {it.label}
                          {it.gate === "marketing" && <span className="rounded bg-pink-100 px-1 py-0.5 text-[10px] font-bold text-pink-700">Buyers</span>}
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
         </div>
        )}
      </Card>

      {/* 📱 Live preview — the teammate's REAL screen, embedded. Click a sidebar
          item → it loads that page in the pane rendered AS them (?viewas). */}
      <Card className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">📱 Live preview — click any item to open it right here, exactly as {firstName} sees it</span>
          {onboardingLock && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">🔒 Onboarding — locked to training + daily basics until certified</span>}
        </div>
        {(() => {
          const groups = NAV_GROUPS.map((g) => ({
            group: g.group,
            items: g.items.filter(visibleItem).map((it) => ({ href: it.href, label: it.label })),
          })).filter((g) => g.items.length > 0);
          const startHref = groups[0]?.items[0]?.href ?? "/dashboard";
          return <PreviewPane userId={selected.id} firstName={firstName} groups={groups} startHref={startHref} />;
        })()}
        <div className="mt-3 text-[11px] text-slate-400">This loads each real page rendered as {firstName} — their menu, their hidden money, their access redirects. It&apos;s read-only: nothing you click here changes their account. The detailed ✓/✗ breakdown is below.</div>
      </Card>

      {/* Their menu — detailed ✓/✗ breakdown */}
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
