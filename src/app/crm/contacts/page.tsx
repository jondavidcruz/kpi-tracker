import Link from "next/link";
import { db } from "@/lib/db";
import { formatAddress } from "@/lib/address";
import { getCurrentUser, isManager, canManageAllLeads } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { parseTags, CRM_STAGES } from "@/lib/crm-shared";
import SelectAllBox from "@/components/SelectAllBox";
import { bulkContactsAction, mergeContactsAction } from "../actions";
import CallButton from "@/components/CallButton";
import { commsFor } from "@/lib/crm-comms";
import { readPipelines, pipelineLockFor } from "@/lib/crm";
import { findDuplicateContacts } from "@/lib/crm-dupes";

export const dynamic = "force-dynamic";

// 👤 Contacts — the GHL global contact list: every seller in one searchable,
// paginated table (name / phone / email / owner / tags / last activity).
const PAGE = 50;

export default async function CrmContactsPage({ searchParams }: { searchParams: Promise<{ q?: string; p?: string; who?: string; dupes?: string; dept?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Contacts live inside the Seller CRM (acquisitions + managers).</Card>;
  const manager = isManager(me!);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const who = manager ? (sp.who ?? "") : me!.name;
  const page = Math.max(1, Number(sp.p) || 1);

  // 🔁 Duplicates view (?dupes=1): contacts sharing a phone number. Managers
  // and full-access reps see every group; a plain rep sees only groups that
  // include one of THEIR contacts. Read-only — resolve by keeping one card and
  // archiving the other from its quick view (🗑 = archive, never delete).
  if (sp.dupes === "1") {
    const fullAccess = canManageAllLeads(me!);
    const { groups, scanned } = await findDuplicateContacts({ owner: fullAccess ? undefined : me!.name });
    return (
      <div className="space-y-4">
        <SectionTitle title="🔁 Duplicate contacts" subtitle={`${groups.length} seller${groups.length === 1 ? "" : "s"} appear more than once (same phone) · ${scanned.toLocaleString()} contacts scanned`} accent="bg-rose-400"
          right={<span className="flex items-center gap-2"><Link href="/crm/contacts" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">← All contacts</Link></span>} />
        <Card className="border-l-4 border-rose-300 p-3 text-xs text-slate-600">
          <b>Why it matters:</b> two cards for one seller = two reps calling the same person. <b>How to fix:</b> {fullAccess ? <>press <b>⭐ Keep</b> on the card with the real history — every lead, text, call, note and task from the other card(s) moves onto it, blank fields get filled in, and the other card is archived (never deleted; the kept card&apos;s timeline shows a receipt). If both leads stay open under two reps, pick ONE owner afterwards.</> : <>open both, keep the one with the real history, copy anything missing into it, then 🗑 on the other card&apos;s quick view (archive-only — nothing is ever deleted).</>} If the two cards are different parcels from one seller, keep both and make sure they share ONE owner.
        </Card>
        {groups.length === 0 && <Card className="p-10 text-center text-sm text-slate-400">🎉 No duplicates{fullAccess ? "" : " among your contacts"}.</Card>}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const owners = new Set(g.members.map((m) => (m.owner || "").split(" ")[0]).filter(Boolean));
            return (
              <Card key={g.phone} className="p-3">
                <form action={mergeContactsAction} id={`merge-${g.phone}`}>{g.members.map((m) => <input key={m.id} type="hidden" name="ids" value={m.id} />)}</form>
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-sm font-extrabold text-slate-800">({g.phone.slice(0, 3)}) {g.phone.slice(3, 6)}-{g.phone.slice(6)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${owners.size > 1 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{owners.size > 1 ? `⚠️ ${owners.size} different owners` : "same owner · exact dupe"}</span>
                </div>
                <div className="space-y-1.5">
                  {g.members.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs ring-1 ring-slate-100">
                      {m.opp ? <Link href={`/crm/${m.opp.id}`} className="font-bold text-slate-800 hover:text-indigo-600">{m.name}</Link> : <span className="font-bold text-slate-800">{m.name}</span>}
                      <span className="text-[11px] font-semibold text-slate-500">{m.owner.split(" ")[0] || "— unassigned"}</span>
                      {m.opp ? <span className="text-[10px] text-slate-400">{m.opp.pipeline} › {m.opp.stage}</span> : <span className="text-[10px] text-slate-300">no open lead</span>}
                      <span className="ml-auto text-[10px] text-slate-400">touched {m.updatedAt.toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                      <Link prefetch={false} href={`/crm/conversations?c=${m.id}`} title="Open conversation" className="rounded bg-white px-2 py-1 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">💬</Link>
                      {fullAccess && g.members.length > 1 && (
                        <button form={`merge-${g.phone}`} name="keep" value={m.id} title="Keep THIS card — merge the other card(s) into it (archive-only)" className="rounded bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200">⭐ Keep</button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // 🔒 Pipeline isolation (Jon 2026-10-19): a pipeline-locked rep only sees contacts
  // tied to their own pipeline(s), so Contacts is safe to show them.
  const lockPipes = await pipelineLockFor(me!);
  const pipeIn = lockPipes?.length ? (lockPipes.includes("War Room") ? [...lockPipes, ""] : lockPipes) : null;
  // 🗂 Department scope (Jon 2026-10-24): dept=dispo → contacts with a dispo-pipeline
  // opp; dept=acq → contacts with an acquisitions (non-dispo) opp. So Dispositions
  // and Acquisitions each see only their own people.
  const dept = sp.dept === "dispo" ? "dispo" : sp.dept === "acq" ? "acq" : "";
  const { isDispoPipeline } = await import("@/lib/dispo-buyers");
  const dispoNames = dept ? (await readPipelines()).filter((p) => isDispoPipeline(p.name)).map((p) => p.name) : [];
  const oppAnd: Record<string, unknown>[] = [];
  if (pipeIn) oppAnd.push({ pipeline: { in: pipeIn } });
  if (dept === "dispo" && dispoNames.length) oppAnd.push({ pipeline: { in: dispoNames } });
  if (dept === "acq" && dispoNames.length) oppAnd.push({ pipeline: { notIn: dispoNames } });
  // 🔎 Deep search (Jon 2026-10-20): also match contacts by their leads' NOTES and
  // land/discovery answers (e.g. "waterfront"), like the board search.
  let deepContactIds: string[] = [];
  if (q) {
    try {
      const like = `%${q}%`;
      const rows = await db.$queryRaw<{ contactId: string }[]>`
        SELECT DISTINCT o."contactId" FROM "CrmOpportunity" o
        WHERE o."archivedAt" IS NULL AND o."contactId" <> '' AND (
          o."formData"::text ILIKE ${like}
          OR EXISTS (SELECT 1 FROM "CrmEvent" e WHERE e."oppId" = o.id AND e.body ILIKE ${like})
        ) LIMIT 3000`;
      deepContactIds = rows.map((r) => r.contactId);
    } catch { /* fall back to field search */ }
  }
  const where = {
    archivedAt: null,
    ...(who ? { assignedTo: { equals: who, mode: "insensitive" as const } } : {}),
    ...(oppAnd.length ? { opportunities: { some: { AND: oppAnd } } } : {}),
    ...(q ? { OR: [
      { name: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q.replace(/\D/g, "") || q } },
      { altPhone: { contains: q.replace(/\D/g, "") || q } },
      { email: { contains: q, mode: "insensitive" as const } },
      { address: { contains: q, mode: "insensitive" as const } },
      { tags: { contains: q, mode: "insensitive" as const } },
      ...(deepContactIds.length ? [{ id: { in: deepContactIds } }] : []),
    ] } : {}),
  };
  const [total, contacts] = await Promise.all([
    db.crmContact.count({ where }),
    db.crmContact.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE,
      include: { opportunities: { where: { archivedAt: null }, select: { id: true, stage: true, pipeline: true }, take: 1, orderBy: { updatedAt: "desc" } } } }),
  ]);
  const pipelines = manager ? await readPipelines() : [];
  const reps2 = manager ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const comms = await commsFor(me!);
  const reps = manager ? await db.user.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (np: number) => `/crm/contacts?p=${np}${q ? `&q=${encodeURIComponent(q)}` : ""}${who ? `&who=${encodeURIComponent(who)}` : ""}`;

  return (
    <div className="space-y-4">
      <SectionTitle title={dept === "dispo" ? "🎯 Dispositions Contacts" : dept === "acq" ? "📞 Acquisitions Contacts" : "👤 Contacts"} subtitle={`${total.toLocaleString()} ${dept === "dispo" ? "dispo buyers, agents & deal contacts" : "contacts"} — search by name, phone, email, property or tag.`} accent="bg-brand-gold"
        right={<span className="flex items-center gap-2"><Link prefetch={false} href="/crm/contacts?dupes=1" title="Sellers who appear more than once (same phone)" className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 ring-1 ring-rose-200 hover:bg-rose-100">🔁 Duplicates</Link><Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Pipeline</Link></span>} />

      <Card className="space-y-2 p-3">
        <form className="flex flex-wrap items-center gap-2" action="/crm/contacts" method="get">
          <input name="q" defaultValue={q} placeholder="🔎 Search contacts…" className="min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
          {who && <input type="hidden" name="who" value={who} />}
          <button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Search</button>
          {q && <Link href={`/crm/contacts${who ? `?who=${encodeURIComponent(who)}` : ""}`} className="text-xs font-bold text-slate-400 hover:text-slate-600">clear</Link>}
        </form>
        {manager && (
          <div className="flex flex-wrap gap-1.5">
            <Link prefetch={false} href={`/crm/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!who ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>Everyone</Link>
            {reps.map((r) => (
              <Link key={r.id} prefetch={false} href={`/crm/contacts?who=${encodeURIComponent(r.name)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${who === r.name ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600"}`}>{r.name.split(" ")[0]}</Link>
            ))}
          </div>
        )}
      </Card>

      <form action={bulkContactsAction}>
      {manager && (
        <Card className="mb-3 flex flex-wrap items-center gap-2 p-3">
          <SelectAllBox />
          <span className="text-[11px] font-bold text-slate-500">Mass edit checked →</span>
          <select name="op" className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold">
            <option value="addtag">🏷 Add tag</option>
            <option value="owner">👤 Set owner</option>
            <option value="stage">📊 Set stage</option>
            <option value="pipeline">🔀 Move pipeline</option>
          </select>
          <input name="value" placeholder="value (tag text / exact stage key)" className="min-w-[160px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs" list="bulkhints" />
          <datalist id="bulkhints">
            {reps2.map((r) => <option key={r.id} value={r.name} />)}
            {pipelines.map((p) => <option key={p.name} value={p.name} />)}
            {CRM_STAGES.map((st) => <option key={st.key} value={st.key} />)}
          </datalist>
          <button className="rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">Apply</button>
          <span className="text-[10px] text-slate-400">owner also reassigns their leads · tag adds to contact + leads</span>
        </Card>
      )}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {manager && <th className="w-8 px-3 py-2.5"></th>}
              <th className="px-4 py-2.5">Contact</th><th className="px-3 py-2.5">Phone</th><th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Owner</th><th className="px-3 py-2.5">Stage</th><th className="px-3 py-2.5">Tags</th><th className="px-3 py-2.5 text-right">Last activity</th><th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c) => {
              const opp = c.opportunities[0];
              return (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/60">
                  {manager && <td className="px-3 py-2.5"><input type="checkbox" name="ids" value={c.id} /></td>}
                  <td className="px-4 py-2.5">
                    {opp ? <Link href={`/crm/${opp.id}`} className="font-bold text-slate-800 hover:text-indigo-600">{c.name}</Link> : <span className="font-bold text-slate-800">{c.name}</span>}
                    {c.address && <div className="max-w-[200px] truncate text-[11px] text-slate-400">{formatAddress(c.address)}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{c.phone}</td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-slate-600">{c.email}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[12px] font-semibold text-slate-500">{c.assignedTo.split(" ")[0] || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[11px] font-bold text-slate-500">{opp?.stage ?? "—"}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-1">
                      {parseTags(c.tags).slice(0, 3).map((t) => <span key={t} className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600">#{t}</span>)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-[11px] text-slate-400">{c.updatedAt.toLocaleDateString([], { month: "short", day: "numeric" })}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="flex items-center gap-1">
                      {comms.call && c.phone && <CallButton phone={c.phone} name={c.name} oppId={opp?.id} contactId={c.id} label="📞" subtle />}
                      <Link prefetch={false} href={`/crm/conversations?c=${c.id}`} title="Open conversation" className="rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200">💬</Link>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {contacts.length === 0 && <div className="p-8 text-center text-sm text-slate-400">No contacts match.</div>}
      </Card>
      </form>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Page {page} of {pages}</span>
        <span className="flex gap-2">
          {page > 1 && <Link prefetch={false} href={qs(page - 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold hover:bg-slate-200">← Prev</Link>}
          {page < pages && <Link prefetch={false} href={qs(page + 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 font-bold hover:bg-slate-200">Next →</Link>}
        </span>
      </div>
    </div>
  );
}
