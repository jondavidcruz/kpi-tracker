import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps, getSettings } from "@/lib/data";
import { todayStr } from "@/lib/date";
import { readPipelines, parseTags } from "@/lib/crm";
import { Card, SectionTitle } from "@/components/ui";
import CrmKanban, { type CrmCard } from "@/components/CrmKanban";
import PipelineSelect from "@/components/PipelineSelect";
import SelectAllBox from "@/components/SelectAllBox";
import CrmFilterBar from "@/components/CrmFilterBar";
import CrmQuickView from "@/components/CrmQuickView";
import { commsFor } from "@/lib/crm-comms";
import { createCrmLeadAction, bulkOppAction } from "./actions";
import CrmOwnerSelect from "@/components/CrmOwnerSelect";

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
  // Managers default to EVERYONE (Jon 2026-10-09 — "I don't have leads
  // assigned to me"); the dropdown narrows it. Reps stay locked to their own.
  const whoRaw = manager ? (sp.who === "all" || sp.who == null ? "" : sp.who) : me!.name;
  // role chips (Jon 2026-10-08): "role:acquisitions" / "role:dispositions"
  // scope the board to everyone in that seat at once.
  const roleReps = whoRaw.startsWith("role:")
    ? (await db.user.findMany({ where: { active: true, position: whoRaw.slice(5) }, select: { name: true } })).map((u) => u.name)
    : null;
  const who = roleReps ? "" : whoRaw;
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
  // Lead counts per pipeline (also powers the tab badges). Default tab =
  // the busiest pipeline, so the board never opens on an empty view.
  const plGroup = await db.crmOpportunity.groupBy({ by: ["pipeline"], where: { archivedAt: null }, _count: { _all: true } });
  const plCounts: Record<string, number> = {};
  for (const g of plGroup) plCounts[g.pipeline === "" ? "War Room" : g.pipeline] = (plCounts[g.pipeline === "" ? "War Room" : g.pipeline] ?? 0) + g._count._all;
  const busiest = [...pipelines].sort((a, b) => (plCounts[b.name] ?? 0) - (plCounts[a.name] ?? 0))[0]?.name ?? pipelines[0].name;
  const plName = sp.pl && pipelines.some((x) => x.name === sp.pl) ? sp.pl : busiest;
  const pipe = pipelines.find((x) => x.name === plName)!;
  const whereBase = {
    archivedAt: null,
    // "War Room" = native leads (empty pipeline) · GHL pipelines match by name
    ...(plName === "War Room" ? { pipeline: { in: ["", "War Room"] } } : { pipeline: plName }),
    ...(roleReps ? { assignedTo: { in: roleReps } } : {}),
    ...(who ? { OR: [
      { assignedTo: { equals: who.trim(), mode: "insensitive" as const } },
      { formData: { path: ["__followers"], array_contains: who.trim() } },
    ] } : {}),
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
  const whoQ = manager ? `&who=${encodeURIComponent(whoRaw || "all")}` : "";
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
    ? await db.crmOpportunity.findMany({ where: whereBase, include: { contact: { select: { name: true, phone: true, address: true, email: true } } }, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PER_PAGE, take: PER_PAGE })
    : (await Promise.all(stages.map((st) => db.crmOpportunity.findMany({ where: { ...whereBase, stage: st.key }, include: { contact: { select: { name: true, phone: true, address: true, email: true } } }, orderBy: { updatedAt: "desc" }, take: PER_COL })))).flat();
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams({ view, pl: plName, ...(manager ? { who: whoRaw || "all" } : {}), ...(q ? { q } : {}), ...(fStage ? { stage: fStage } : {}), ...(fTag ? { tag: fTag } : {}), ...(fDue ? { due: "1" } : {}), ...(fNa ? { na: "1" } : {}), ...(fQuiet ? { quiet: "1" } : {}), ...(fFresh ? { fresh: "1" } : {}), ...over });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/crm?${p.toString()}`;
  };
  // dead/nurture live on the board too but collapse visually at the end
  const deadOpps = await db.crmOpportunity.count({ where: { archivedAt: { not: null } } });
  const comms = await commsFor(me!);
  const weekAppts = view === "cal" ? await db.crmAppointment.findMany({ where: { at: { gte: new Date(Date.now() - 86400000), lte: new Date(Date.now() + 8 * 86400000) }, ...(who ? { withWho: { contains: who.split(" ")[0] } } : {}) }, orderBy: { at: "asc" } }) : [];

  const tasksByOpp = new Map<string, { due: string; title: string }[]>();
  for (const t of tasks) { const a = tasksByOpp.get(t.oppId) ?? []; a.push(t); tasksByOpp.set(t.oppId, a); }

  // 🔴 unread-SMS counts per contact (Jon 2026-10-08): inbound texts newer
  // than the last outbound reply AND newer than the thread's last-read stamp.
  const cardCids = [...new Set(opps.map((o) => o.contactId))];
  const [recentSms, readRow] = await Promise.all([
    cardCids.length ? db.crmEvent.findMany({ where: { contactId: { in: cardCids }, kind: "sms" }, orderBy: { at: "desc" }, take: 1500, select: { contactId: true, body: true, at: true } }) : [],
    db.resource.findFirst({ where: { category: "__conv_read__" } }),
  ]);
  let convRead: Record<string, string> = {};
  try { convRead = readRow?.description ? JSON.parse(readRow.description) : {}; } catch { /* none */ }
  const smsUnread = new Map<string, number>();
  const sealed = new Set<string>();
  for (const e of recentSms) {
    if (sealed.has(e.contactId)) continue;
    const inbound = e.body.startsWith("⬅");
    if (!inbound) { sealed.add(e.contactId); continue; }
    const readAt = convRead[e.contactId];
    if (readAt && e.at.toISOString() <= readAt) { sealed.add(e.contactId); continue; }
    smsUnread.set(e.contactId, (smsUnread.get(e.contactId) ?? 0) + 1);
  }

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
      id: o.id, title: o.title, contactName: o.contact.name, contactId: o.contactId, phone: o.contact.phone, address: o.contact.address, stage: o.stage,
      assignedTo: o.assignedTo, tags: parseTags(o.tags), badges,
      money: money(o.value) || (o.askPrice != null ? `ask ${money(o.askPrice)}` : ""),
      email: o.contact.email, smsUnread: smsUnread.get(o.contactId) ?? 0,
      valueNum: o.value ?? o.askPrice ?? 0, updatedAt: o.updatedAt.toISOString(), createdAt: o.createdAt.toISOString(),
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
            
            <Link href="/crm/conversations" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">💬 Conversations</Link>
            <Link href={`/crm?view=kanban${whoQ}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === "kanban" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>🗂 Board</Link>
            <Link href={`/crm?view=list${whoQ}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === "list" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📋 List</Link>
            <Link href={`/crm?view=cal${whoQ}`} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${view === "cal" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>📅 Week</Link>
          </div>
        }
      />

      {/* 🔀 Pipeline dropdown — exactly like GHL's */}
      <div className="flex flex-wrap items-center gap-2">
        <PipelineSelect
          pipelines={pipelines.filter((pp) => pp.name !== "War Room" || (plCounts["War Room"] ?? 0) > 0).map((pp) => ({ name: pp.name, count: plCounts[pp.name] ?? 0 }))}
          current={plName}
          baseQs={`view=${view}${whoQ}`}
        />
        <span className="text-[11px] text-slate-400">{(plCounts[plName] ?? 0).toLocaleString()} opportunities in this pipeline</span>
      </div>

      {/* 🔎 search + GHL-style filters */}
      <Card className="space-y-2 p-3">
        <CrmFilterBar
          base={{ view, pl: plName, ...(manager ? { who: whoRaw || "all" } : {}) }}
          q={q} stage={fStage} tag={fTag} due={fDue}
          stages={stages.map((st) => ({ key: st.key, label: st.label }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          {manager ? (
            // one clear dropdown instead of the chip row (Jon 2026-10-08) —
            // it always STATES whose leads are on screen, so nothing feels missing
            <CrmOwnerSelect current={whoRaw || "all"} meName={me!.name} reps={reps.map((r) => r.name)} hrefTemplate={qs({ who: "__WHO__" })} />
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
        <details>
          <summary className="cursor-pointer text-sm font-bold text-slate-700">＋ New lead <span className="font-normal text-slate-400">— everything in one go: who, the property address, source, rep and your notes</span></summary>
          <form action={createCrmLeadAction} className="mt-3 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Seller name *</span><input name="name" placeholder="Jane Smith" required className={inputCls} /></label>
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Phone</span><input name="phone" placeholder="(555) 123-4567" className={inputCls} /></label>
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Email</span><input name="email" type="email" placeholder="jane@email.com" className={inputCls} /></label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <label className="col-span-2 block sm:col-span-3"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Property street address</span><input name="street" placeholder="123 Main St" className={inputCls} /></label>
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">City</span><input name="city" placeholder="Dallas" className={inputCls} /></label>
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">State</span><input name="state" placeholder="TX" maxLength={20} className={inputCls} /></label>
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Zip</span><input name="zip" placeholder="75001" maxLength={10} className={inputCls} /></label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Where did this lead come from? (source)</span><input name="source" placeholder="PPL / Direct REI / referral / cold call…" className={inputCls} /></label>
              <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Assigned to</span><select name="assignedTo" defaultValue={me?.name ?? ""} className={inputCls}>
                {reps.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
              </select></label>
            </div>
            <label className="block"><span className="mb-0.5 block text-[10px] font-extrabold uppercase tracking-wide text-slate-400">Notes — everything from the first call (lands on the timeline instantly)</span><textarea name="notes" rows={3} placeholder={"motivated — behind on taxes\nwants to close in 30 days\nquoted ~$80k on the phone"} className={inputCls} /></label>
            <div className="flex items-center gap-3">
              <button className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700">Add lead → opens the full card</button>
              <p className="text-[10px] text-slate-400">Address is auto-scrubbed to &quot;street, City, ST zip&quot;. Welcome text (and email when given) sends automatically; the lead lands in the rep&apos;s own pipeline.</p>
            </div>
          </form>
        </details>
      </Card>

      {view === "kanban" ? (
        <><CrmQuickView stages={stages.map((st) => ({ key: st.key, label: st.label }))} /><CrmKanban columns={stages} cards={cards} counts={stageCounts} sums={stageSums} canSms={comms.sms} listHref={`/crm?view=list${whoQ}`} reps={reps.map((r) => r.name)} /></>
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
              <SelectAllBox />
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

    </div>
  );
}
