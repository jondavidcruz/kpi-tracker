import Link from "next/link";
import { getCurrentUser, isManager, isAdmin, canAccessMarketing, canAccessPayroll, canTrackTime, isOwner } from "@/lib/auth";
import { getAllUsers } from "@/lib/data";
import { positionLabel } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// Mirrors the sidebar groups + their gating, so this preview shows exactly what
// menu a given person sees. Keep in sync with src/components/Sidebar.tsx.
type Gate = "all" | "manager" | "admin" | "marketing" | "timecard";
const NAV: { group: string; items: { label: string; gate: Gate }[] }[] = [
  { group: "Overview", items: [
    { label: "Dashboard", gate: "all" }, { label: "Process Map", gate: "all" }, { label: "Deals", gate: "all" },
    { label: "Underwriting", gate: "all" }, { label: "Schedule & Time", gate: "all" }, { label: "Resources & SOPs", gate: "admin" },
  ] },
  { group: "Performance", items: [
    { label: "Enter KPIs", gate: "all" }, { label: "Weekly report", gate: "all" }, { label: "Monthly report", gate: "all" },
    { label: "Internet Speed", gate: "manager" }, { label: "Analytics", gate: "manager" }, { label: "Trends", gate: "manager" }, { label: "Benchmarks", gate: "manager" },
  ] },
  { group: "Coaching", items: [
    { label: "Alerts", gate: "manager" }, { label: "PIPs", gate: "manager" }, { label: "Call scoring", gate: "all" }, { label: "Scripts", gate: "all" },
  ] },
  { group: "Support", items: [
    { label: "Software & Logins", gate: "all" }, { label: "Change Portal", gate: "all" }, { label: "AI Champion", gate: "all" },
    { label: "Tickets", gate: "all" }, { label: "AI updates", gate: "admin" }, { label: "Admin", gate: "manager" },
  ] },
  { group: "Marketing", items: [{ label: "Markets & Buyers", gate: "marketing" }] },
  { group: "C-Suite", items: [
    { label: "Payroll", gate: "timecard" }, { label: "Roadmap", gate: "admin" }, { label: "Escrow & Closing", gate: "manager" },
    { label: "Closed deals", gate: "admin" }, { label: "Team Roster", gate: "admin" },
  ] },
  { group: "EOS", items: [
    { label: "Vision (V/TO)", gate: "all" }, { label: "Rocks", gate: "all" }, { label: "Issues", gate: "admin" },
    { label: "Monday Meeting", gate: "manager" }, { label: "Leadership Meeting", gate: "manager" },
  ] },
];

const GATE_LABEL: Record<Gate, string> = { all: "Everyone", manager: "Managers (you + Marie)", admin: "Owner-level", marketing: "Marketing crew", timecard: "Time/pay staff" };

export default async function AccessPreviewPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
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
    owner: isOwner(selected),
  };
  const can = (gate: Gate) =>
    gate === "all" ? true :
    gate === "manager" ? flags.manager :
    gate === "admin" ? flags.admin :
    gate === "marketing" ? flags.marketing :
    gate === "timecard" ? flags.timecard : false;

  // Sensitive-data confirmations — the things you most want to verify.
  const sensitive = [
    { label: "Pay amounts ($ rates, gross, totals)", ok: flags.payroll, who: "Jon, Viktoriia, Enrico" },
    { label: "Payroll / Time Card page", ok: flags.timecard, who: "Managers + pay staff" },
    { label: "Markets & Buyers (buy boxes)", ok: flags.marketing, who: "Sharyn, Marie, Viktoriia, Jon" },
    { label: "Alerts, PIPs, Analytics", ok: flags.manager, who: "Jon + Marie" },
    { label: "Admin settings", ok: flags.manager, who: "Jon + Marie" },
    { label: "Owner-only (Roster, Closed deals, AI updates, Issues)", ok: flags.admin, who: "Owner-level" },
  ];

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
      </Card>

      {/* Their menu */}
      <Card className="p-5">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Menu {selected.name.split(" ")[0]} sees</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {NAV.map((g) => {
            const visible = g.items.filter((it) => can(it.gate));
            const hidden = g.items.filter((it) => !can(it.gate));
            if (visible.length === 0 && hidden.length === 0) return null;
            return (
              <div key={g.group}>
                <div className="mb-1 text-xs font-bold text-slate-600">{g.group}</div>
                <ul className="space-y-0.5 text-sm">
                  {visible.map((it) => (
                    <li key={it.label} className="flex items-center gap-1.5 text-slate-700"><span className="text-emerald-500">✓</span> {it.label}</li>
                  ))}
                  {hidden.map((it) => (
                    <li key={it.label} className="flex items-center gap-1.5 text-slate-300 line-through" title={`Restricted to: ${GATE_LABEL[it.gate]}`}><span>✗</span> {it.label}</li>
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
