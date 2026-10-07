import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps, getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { crmStages, parseTags } from "@/lib/crm";
import { Card, SectionTitle } from "@/components/ui";
import CrmKanban, { type CrmCard } from "@/components/CrmKanban";
import { createCrmLeadAction } from "./actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ view?: string; who?: string; q?: string; stage?: string; tag?: string; due?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The Seller CRM is for acquisitions + managers.</Card>;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const view = sp.view === "list" ? "list" : "kanban";
  // Permissions (Jon 2026-10-07: "Nick gets his own pipeline"): managers see
  // everyone; a rep's board is scoped to THEIR leads — their own pipeline.
  const manager = isManager(me!);
  const who = manager ? (sp.who ?? "") : me!.name;
  const q = (sp.q ?? "").trim();
  const fStage = sp.stage ?? "";
  const fTag = (sp.tag ?? "").trim();
  const fDue = sp.due === "1";

  const [stages, reps, opps, tasks, appts] = await Promise.all([
    crmStages(),
    getActiveReps(),
    db.crmOpportunity.findMany({
      where: {
        archivedAt: null,
        ...(who ? { assignedTo: who } : {}),
        ...(fStage ? { stage: fStage } : {}),
        ...(fTag ? { OR: [{ tags: { contains: fTag, mode: "insensitive" } }, { contact: { tags: { contains: fTag, mode: "insensitive" } } }] } : {}),
        ...(fDue ? { nextFollowUp: { not: "", lte: today } } : {}),
        ...(q ? { OR: [
          { title: { contains: q, mode: "insensitive" } },
          { tags: { contains: q, mode: "insensitive" } },
          { contact: { name: { contains: q, mode: "insensitive" } } },
          { contact: { phone: { contains: q.replace(/\D/g, "") || q } } },
          { contact: { email: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
      include: { contact: { select: { name: true, phone: true } } },
      orderBy: { updatedAt: "desc" },
      take: 400,
    }),
    db.crmTask.findMany({ where: { doneAt: null }, select: { oppId: true, due: true, title: true, assignedTo: true } }),
    db.crmAppointment.findMany({ where: { at: { gte: new Date() } }, orderBy: { at: "asc" }, take: 10 }),
  ]);
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ view, ...(manager && who ? { who } : {}), ...(q ? { q } : {}), ...(fStage ? { stage: fStage } : {}), ...(fTag ? { tag: fTag } : {}), ...(fDue ? { due: "1" } : {}), ...over });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/crm?${p.toString()}`;
  };
  // dead/nurture live on the board too but collapse visually at the end
  const deadOpps = await db.crmOpportunity.count({ where: { archivedAt: { not: null } } });

  const tasksByOpp = new Map<string, { due: string; title: string }[]>();
  for (const t of tasks) { const a = tasksByOpp.get(t.oppId) ?? []; a.push(t); tasksByOpp.set(t.oppId, a); }

  const money = (n: number | null) => (n == null ? "" : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);
  const cards: CrmCard[] = opps.map((o) => {
    const badges: string[] = [];
    if (o.stage === "at_developers" && o.devPricingSentAt) {
      const h = Math.round((Date.now() - o.devPricingSentAt.getTime()) / 3_600_000);
      badges.push(h >= 36 ? `🔴 ${h}h at devs — chase` : `⏳ ${h}h at devs`);
    }
    const due = (tasksByOpp.get(o.id) ?? []).filter((t) => t.due && t.due.slice(0, 10) <= today);
    if (due.length) badges.push(`⏰ ${due.length} task${due.length > 1 ? "s" : ""} due`);
    if (o.nextFollowUp && o.nextFollowUp <= today) badges.push("📞 follow-up due");
    return {
      id: o.id, title: o.title, contactName: o.contact.name, stage: o.stage,
      assignedTo: o.assignedTo, tags: parseTags(o.tags), badges,
      money: money(o.value) || (o.askPrice != null ? `ask ${money(o.askPrice)}` : ""),
    };
  });

  const upcoming = appts.filter((a) => a.at.getTime() - Date.now() < 24 * 3600_000);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="🧲 Seller CRM — Acquisitions"
        subtitle="Every seller lead, GHL-style: pipeline, notes, tasks, appointments — calls & texts log themselves."
        accent="bg-brand-gold"
        right={
          <div className="flex items-center gap-2">
            <Link href={`/crm?view=kanban${who ? `&who=${who}` : ""}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === "kanban" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>🗂 Board</Link>
            <Link href={`/crm?view=list${who ? `&who=${who}` : ""}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === "list" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📋 List</Link>
          </div>
        }
      />

      {/* 🔎 search + GHL-style filters */}
      <Card className="space-y-2 p-3">
        <form action="/crm" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={view} />
          {manager && who && <input type="hidden" name="who" value={who} />}
          <input name="q" defaultValue={q} placeholder="🔎 Search name, phone, email, property, tag…" className="min-w-[240px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          <select name="stage" defaultValue={fStage} className="rounded-xl border border-slate-200 px-2 py-2 text-xs font-semibold text-slate-600">
            <option value="">All stages</option>
            {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <input name="tag" defaultValue={fTag} placeholder="tag…" className="w-24 rounded-xl border border-slate-200 px-2 py-2 text-xs" />
          <label className="flex items-center gap-1 text-xs font-semibold text-slate-600"><input type="checkbox" name="due" value="1" defaultChecked={fDue} /> 📞 follow-up due</label>
          <button className="rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700">Filter</button>
          {(q || fStage || fTag || fDue) && <Link href={`/crm?view=${view}${manager && who ? `&who=${encodeURIComponent(who)}` : ""}`} className="text-xs font-bold text-slate-400 hover:text-slate-600">✕ clear</Link>}
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {manager ? (
            <>
              <span className="text-[11px] font-bold text-slate-500">Pipeline:</span>
              <Link href={qs({ who: "" })} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!who ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>Everyone</Link>
              {reps.map((r) => (
                <Link key={r.id} href={qs({ who: r.name })} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{r.name.split(" ")[0]}</Link>
              ))}
            </>
          ) : (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">👤 Your pipeline — {me!.name.split(" ")[0]}&apos;s leads only</span>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{opps.length} showing · 💀 {deadOpps} archived — never deleted</span>
        </div>
      </Card>

      {upcoming.length > 0 && (
        <Card className="border-l-4 border-indigo-400 p-3">
          <span className="text-xs font-bold text-slate-700">📅 Next 24h: </span>
          {upcoming.map((a) => (
            <span key={a.id} className="mr-3 text-xs text-slate-600">
              <b>{a.at.toLocaleString("en-US", { timeZone: settings.orgTimezone, weekday: "short", hour: "numeric", minute: "2-digit" })}</b> — {a.title} ({a.withWho})
            </span>
          ))}
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700">＋ New lead</h3>
        <form action={createCrmLeadAction} className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <input name="name" placeholder="Seller name *" required className={inputCls} />
          <input name="phone" placeholder="Phone" className={inputCls} />
          <input name="title" placeholder="Property / opportunity" className={inputCls} />
          <input name="source" placeholder="Source (PPL…)" className={inputCls} />
          <select name="assignedTo" defaultValue={me?.name ?? ""} className={inputCls}>
            {reps.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
          </select>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Add lead</button>
        </form>
      </Card>

      {view === "kanban" ? (
        <CrmKanban columns={stages} cards={cards} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2.5">Contact</th><th className="px-3 py-2.5">Opportunity</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Rep</th><th className="px-3 py-2.5">Value</th><th className="px-3 py-2.5">Follow-up</th><th className="px-3 py-2.5">Flags</th>
            </tr></thead>
            <tbody>
              {cards.map((c) => {
                const st = stages.find((s) => s.key === c.stage);
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2 font-bold text-slate-800"><Link href={`/crm/${c.id}`} className="hover:underline">{c.contactName}</Link></td>
                    <td className="px-3 py-2 text-slate-600">{c.title}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st?.cls ?? ""}`}>{st?.label ?? c.stage}</span></td>
                    <td className="px-3 py-2 text-slate-500">{c.assignedTo}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">{c.money}</td>
                    <td className="px-3 py-2 text-slate-500"></td>
                    <td className="px-3 py-2 text-[10px]">{c.badges.join(" · ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
