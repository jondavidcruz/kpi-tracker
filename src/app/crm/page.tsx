import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps, getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { readPipelines, parseTags } from "@/lib/crm";
import { Card, SectionTitle } from "@/components/ui";
import CrmKanban, { type CrmCard } from "@/components/CrmKanban";
import { createCrmLeadAction, saveCommsPermsAction, bulkOppAction } from "./actions";
import { readCommsMap, firstOf } from "@/lib/crm-comms";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ view?: string; who?: string; q?: string; stage?: string; tag?: string; due?: string; p?: string; na?: string; quiet?: string; fresh?: string; pl?: string }> }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The Seller CRM is for acquisitions + managers.</Card>;
  const settings = await getSettings();
  const today = todayStr(settings.orgTimezone);
  const view = sp.view === "list" ? "list" : sp.view === "cal" ? "cal" : "kanban";
  // Permissions (Jon 2026-10-07: "Nick gets his own pipeline"): managers see
  // everyone; a rep's board is scoped to THEIR leads — their own pipeline.
  const manager = isManager(me!);
  const who = manager ? (sp.who ?? "") : me!.name;
  const q = (sp.q ?? "").trim();
  const fStage = sp.stage ?? "";
  const fTag = (sp.tag ?? "").trim();
  const fDue = sp.due === "1";
  const fNa = sp.na === "1";      // no next action set
  const fQuiet = sp.quiet === "1"; // no touch in 3+ days
  const fFresh = sp.fresh === "1"; // created this week

  // Scale plan (35k+ leads): the board never loads everything — true counts
  // come from an indexed groupBy, each column renders its freshest 60, and
  // the List view paginates. Payload stays ~constant no matter the lead count.
  const pipelines = await readPipelines();
  const plName = sp.pl && pipelines.some((x) => x.name === sp.pl) ? sp.pl : pipelines[0].name;
  const pipe = pipelines.find((x) => x.name === plName)!;
  const whereBase = {
    archivedAt: null,
    // "War Room" = native leads (empty pipeline) · GHL pipelines match by name
    ...(plName === "War Room" ? { pipeline: { in: ["", "War Room"] } } : { pipeline: plName }),
    ...(who ? { assignedTo: { equals: who.trim(), mode: "insensitive" as const } } : {}),
    ...(fStage ? { stage: fStage } : {}),
    ...(fTag ? { OR: [{ tags: { contains: fTag, mode: "insensitive" as const } }, { contact: { tags: { contains: fTag, mode: "insensitive" as const } } }] } : {}),
    ...(fDue ? { nextFollowUp: { not: "", lte: today } } : {}),
    ...(fNa ? { nextFollowUp: "" } : {}),
    ...(fQuiet ? { stage: { notIn: ["nurture", "dead", "signed"] }, updatedAt: { lte: new Date(Date.now() - 3 * 86400000) } } : {}),
    ...(fFresh ? { createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } : {}),
    ...(q ? { OR: [
      { title: { contains: q, mode: "insensitive" as const } },
      { tags: { contains: q, mode: "insensitive" as const } },
      { contact: { name: { contains: q, mode: "insensitive" as const } } },
      { contact: { phone: { contains: q.replace(/\D/g, "") || q } } },
      { contact: { email: { contains: q, mode: "insensitive" as const } } },
    ] } : {}),
  };
  const page = Math.max(1, Number(sp.p) || 1);
  const PER_COL = 60, PER_PAGE = 50;
  const stages = pipe.stages;
  const [reps, grouped, totalCount, tasks, appts] = await Promise.all([
    getActiveReps(),
    db.crmOpportunity.groupBy({ by: ["stage"], where: whereBase, _count: { _all: true }, _sum: { value: true } }),
    db.crmOpportunity.count({ where: whereBase }),
    db.crmTask.findMany({ where: { doneAt: null }, select: { oppId: true, due: true, title: true, assignedTo: true }, take: 2000 }),
    db.crmAppointment.findMany({ where: { at: { gte: new Date() } }, orderBy: { at: "asc" }, take: 10 }),
  ]);
  const stageCounts: Record<string, number> = {};
  const stageSums: Record<string, number> = {};
  for (const g of grouped) { stageCounts[g.stage] = g._count._all; stageSums[g.stage] = g._sum.value ?? 0; }
  const opps = view === "list"
    ? await db.crmOpportunity.findMany({ where: whereBase, include: { contact: { select: { name: true, phone: true } } }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE })
    : (await Promise.all(stages.map((st) => db.crmOpportunity.findMany({ where: { ...whereBase, stage: st.key }, include: { contact: { select: { name: true, phone: true } } }, orderBy: { updatedAt: "desc" }, take: PER_COL })))).flat();
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ view, pl: plName, ...(manager && who ? { who } : {}), ...(q ? { q } : {}), ...(fStage ? { stage: fStage } : {}), ...(fTag ? { tag: fTag } : {}), ...(fDue ? { due: "1" } : {}), ...(fNa ? { na: "1" } : {}), ...(fQuiet ? { quiet: "1" } : {}), ...(fFresh ? { fresh: "1" } : {}), ...over });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/crm?${p.toString()}`;
  };
  // dead/nurture live on the board too but collapse visually at the end
  const deadOpps = await db.crmOpportunity.count({ where: { archivedAt: { not: null } } });
  const commsMap = manager ? await readCommsMap() : {};
  const weekAppts = view === "cal" ? await db.crmAppointment.findMany({ where: { at: { gte: new Date(Date.now() - 86400000), lte: new Date(Date.now() + 8 * 86400000) }, ...(who ? { withWho: { contains: who.split(" ")[0] } } : {}) }, orderBy: { at: "asc" } }) : [];

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
    if (!["nurture", "dead", "signed"].includes(o.stage) && Date.now() - o.updatedAt.getTime() > 3 * 86400000) badges.push("🕸 quiet 3d+");
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
            <Link href={`/crm?view=cal${who ? `&who=${who}` : ""}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === "cal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📅 Week</Link>
          </div>
        }
      />

      {/* 🔀 Pipeline selector — exactly like GHL's dropdown */}
      <div className="flex flex-wrap items-center gap-1.5">
        {pipelines.map((pp) => (
          <Link key={pp.name} prefetch={false} href={qs({ pl: pp.name, stage: "", p: "" })} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${pp.name === plName ? "bg-brand-navy text-white shadow" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>
            {pp.name}
          </Link>
        ))}
      </div>

      {/* 🔎 search + GHL-style filters */}
      <Card className="space-y-2 p-3">
        <form action="/crm" className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="pl" value={plName} />
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
              <Link prefetch={false} href={qs({ who: "" })} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!who ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>Everyone</Link>
              {reps.map((r) => (
                <Link key={r.id} prefetch={false} href={qs({ who: r.name })} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{r.name.split(" ")[0]}</Link>
              ))}
            </>
          ) : (
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-700">👤 Your pipeline — {me!.name.split(" ")[0]}&apos;s leads only</span>
          )}
          <span className="ml-auto text-[11px] text-slate-400">{totalCount.toLocaleString()} leads · 💀 {deadOpps} archived — never deleted</span>
        </div>
      </Card>

      {/* ⚡ Smart Views — one-click working lists */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-bold text-slate-400">⚡ Smart views:</span>
        {([
          ["📞 Due today", { due: "1", na: "", quiet: "", fresh: "", tag: "" }],
          ["🔥 Hot", { tag: "hot", due: "", na: "", quiet: "", fresh: "" }],
          ["🚫 No next action", { na: "1", due: "", quiet: "", fresh: "", tag: "" }],
          ["🕸 Quiet 3d+", { quiet: "1", due: "", na: "", fresh: "", tag: "" }],
          ["✨ New this week", { fresh: "1", due: "", na: "", quiet: "", tag: "" }],
        ] as const).map(([label, over]) => {
          const active = (over.due === "1" && fDue) || (over.na === "1" && fNa) || (over.quiet === "1" && fQuiet) || (over.fresh === "1" && fFresh) || (over.tag === "hot" && fTag === "hot");
          return <Link key={label} prefetch={false} href={active ? qs({ due: "", na: "", quiet: "", fresh: "", tag: "" }) : qs(over as Record<string, string>)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? "bg-brand-gold text-brand-navy" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{label}</Link>;
        })}
      </div>

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
        <CrmKanban columns={stages} cards={cards} counts={stageCounts} sums={stageSums} listHref={`/crm?view=list${manager && who ? `&who=${encodeURIComponent(who)}` : ""}`} />
      ) : view === "cal" ? (
        <Card className="p-4">
          <div className="mb-2 text-sm font-bold text-slate-700">📅 This week — appointments &amp; due follow-ups</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => {
              const day = new Date(Date.now() + (i - 1) * 86400000);
              const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(day);
              const dayAppts = weekAppts.filter((a) => new Intl.DateTimeFormat("en-CA", { timeZone: settings.orgTimezone }).format(a.at) === ymd);
              const dayFu = cards.filter((c) => c.badges.includes("📞 follow-up due") && ymd === today);
              if (i === 0 && dayAppts.length === 0) return null;
              return (
                <div key={ymd} className={`rounded-xl p-2.5 ring-1 ${ymd === today ? "bg-amber-50 ring-amber-200" : "bg-slate-50 ring-slate-100"}`}>
                  <div className="mb-1 text-[11px] font-extrabold text-slate-600">{day.toLocaleDateString("en-US", { timeZone: settings.orgTimezone, weekday: "short", month: "short", day: "numeric" })}{ymd === today ? " · today" : ""}</div>
                  {dayAppts.map((a) => (
                    <Link key={a.id} href={a.oppId ? `/crm/${a.oppId}` : "/crm"} className="mb-1 block rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-semibold text-indigo-800 ring-1 ring-indigo-100 hover:bg-indigo-100">
                      {a.at.toLocaleTimeString("en-US", { timeZone: settings.orgTimezone, hour: "numeric", minute: "2-digit" })} — {a.title} <span className="text-indigo-400">({a.withWho.split(" ")[0]})</span>
                    </Link>
                  ))}
                  {ymd === today && dayFu.slice(0, 8).map((c) => (
                    <Link key={c.id} href={`/crm/${c.id}`} className="mb-1 block rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">📞 {c.contactName}</Link>
                  ))}
                  {dayAppts.length === 0 && ymd !== today && <div className="text-[10px] text-slate-300">—</div>}
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <form action={bulkOppAction}>
          {manager && (
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs">
              <span className="font-bold text-slate-500">Bulk (ticked rows):</span>
              <select name="op" className="rounded-lg border border-slate-200 px-2 py-1 font-semibold">
                <option value="assign">→ reassign to</option>
                <option value="stage">→ move to stage</option>
                <option value="tag">→ add tag</option>
              </select>
              <input name="val" placeholder="rep name / stage key / tag" className="w-44 rounded-lg border border-slate-200 px-2 py-1" />
              <button className="rounded-lg bg-slate-900 px-3 py-1 font-bold text-white hover:bg-slate-700">Apply</button>
              <span className="text-[10px] text-slate-400">stage keys: new · contacted · process_call · at_developers · offer_made · contract_sent · signed · nurture · dead</span>
            </div>
          )}
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              {manager && <th className="px-3 py-2.5"></th>}<th className="px-4 py-2.5">Contact</th><th className="px-3 py-2.5">Opportunity</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Rep</th><th className="px-3 py-2.5">Value</th><th className="px-3 py-2.5">Flags</th>
            </tr></thead>
            <tbody>
              {cards.map((c) => {
                const st = stages.find((s) => s.key === c.stage);
                return (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                    {manager && <td className="px-3 py-2"><input type="checkbox" name="ids" value={c.id} /></td>}
                    <td className="px-4 py-2 font-bold text-slate-800"><Link href={`/crm/${c.id}`} className="hover:underline">{c.contactName}</Link></td>
                    <td className="px-3 py-2 text-slate-600">{c.title}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${st?.cls ?? ""}`}>{st?.label ?? c.stage}</span></td>
                    <td className="px-3 py-2 text-slate-500">{c.assignedTo}</td>
                    <td className="px-3 py-2 font-semibold text-emerald-700">{c.money}</td>
                    <td className="px-3 py-2 text-[10px]">{c.badges.join(" · ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </form>
          {totalCount > PER_PAGE && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
              <span>page {page} of {Math.ceil(totalCount / PER_PAGE)} · {totalCount.toLocaleString()} leads</span>
              <span className="flex gap-2">
                {page > 1 && <Link href={qs({ p: String(page - 1) })} className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200">← prev</Link>}
                {page * PER_PAGE < totalCount && <Link href={qs({ p: String(page + 1) })} className="rounded-lg bg-slate-100 px-3 py-1 hover:bg-slate-200">next →</Link>}
              </span>
            </div>
          )}
        </Card>
      )}

      {/* 📡 Comms access — who gets the PAID channels (managers only) */}
      {manager && (
        <Card className="p-4">
          <details>
            <summary className="cursor-pointer text-sm font-bold text-slate-700">📡 Comms access — who can call / text / email (paid channels)</summary>
            <p className="mt-1 text-xs text-slate-500">Unticked = that agent still gets every free feature (notes, tasks, stages, appointments) but the paid buttons are hidden and blocked server-side. Managers always have everything.</p>
            <div className="mt-2 space-y-1.5">
              {reps.map((r) => {
                const first = firstOf(r.name);
                const p = commsMap[first] ?? { call: false, sms: false, email: false };
                return (
                  <form key={r.id} action={saveCommsPermsAction} className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-slate-100">
                    <input type="hidden" name="first" value={first} />
                    <span className="w-28 font-bold text-slate-700">{r.name.split(" ")[0]}</span>
                    <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="call" defaultChecked={p.call} /> 📞 call</label>
                    <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="sms" defaultChecked={p.sms} /> 💬 SMS</label>
                    <label className="flex items-center gap-1 font-semibold text-slate-600"><input type="checkbox" name="email" defaultChecked={p.email} /> ✉️ email</label>
                    <button className="ml-auto rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-700">Save</button>
                  </form>
                );
              })}
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
