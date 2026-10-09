import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { stripHtml, KIND_EMOJI } from "@/lib/crm-shared";
import { commsFor, readSignatures, firstOf, defaultSignature } from "@/lib/crm-comms";
import { readSnippets } from "@/lib/crm-templates";
import CallButton from "@/components/CallButton";
import ConvComposerTabs from "@/components/ConvComposerTabs";
import { startConversationAction, bulkConvAction } from "@/app/crm/actions";
import { readConvMap, setConvRead } from "@/lib/conv-read";

export const dynamic = "force-dynamic";

// 💬 Conversations — the GHL team inbox, rebuilt: every SMS / email / call
// per seller in one thread, newest conversations on the left, composer at
// the bottom, contact details on the right.
const COMMS = ["sms", "email", "call", "voicemail"];

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
}
function timeAgo(d: Date) {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default async function ConversationsPage({ searchParams }: { searchParams: Promise<{ c?: string; who?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">Conversations live inside the Seller CRM (acquisitions + managers).</Card>;
  const manager = isManager(me!);
  const sp = await searchParams;
  const comms = await commsFor(me!);
  const snippets = await readSnippets();
  const mySignature = (await readSignatures())[firstOf(me!.name)] || defaultSignature(me!.name);
  const fromLabel = `${me!.name} <${firstOf(me!.name)}@freedom-offers.com>`;

  // thread list: latest comms event per contact
  const recent = await db.crmEvent.findMany({
    where: { kind: { in: COMMS } },
    orderBy: { at: "desc" }, take: 600,
    select: { contactId: true, kind: true, body: true, at: true },
  });
  const latestByContact = new Map<string, { kind: string; body: string; at: Date }>();
  for (const e of recent) if (!latestByContact.has(e.contactId)) latestByContact.set(e.contactId, e);
  const contactIds = [...latestByContact.keys()].slice(0, 120);
  const mineOnly = manager && sp.who === "me";
  const contacts = await db.crmContact.findMany({
    where: { id: { in: contactIds }, ...(manager ? (mineOnly ? { assignedTo: { equals: me!.name, mode: "insensitive" } } : {}) : { assignedTo: { in: ["", me!.name] } }) },
    select: { id: true, name: true, phone: true, assignedTo: true },
  });
  // 👁 red dot = seller wrote last AND the thread hasn't been opened since
  const convRead = await readConvMap();
  const threads = contacts
    .map((c) => {
      const last = latestByContact.get(c.id)!;
      const unseen = !convRead[c.id] || last.at.toISOString() > convRead[c.id];
      return { ...c, last, needsReply: stripHtml(last.body).startsWith("⬅") && unseen };
    })
    .sort((a, b) => (Number(b.needsReply) - Number(a.needsReply)) || (b.last.at.getTime() - a.last.at.getTime()))
    .slice(0, 50);

  // selected thread
  const cId = sp.c || threads[0]?.id || "";
  const contact = cId ? await db.crmContact.findUnique({ where: { id: cId } }) : null;
  // opening a thread marks it read (clears the red dot everywhere)
  if (cId) setConvRead([cId], true).catch(() => {});
  const visible = contact && (manager || !contact.assignedTo || contact.assignedTo === me!.name);
  const [events, opp] = contact && visible ? await Promise.all([
    db.crmEvent.findMany({ where: { contactId: contact.id, kind: { in: COMMS } }, orderBy: { at: "desc" }, take: 80 }),
    db.crmOpportunity.findFirst({ where: { contactId: contact.id, archivedAt: null }, select: { id: true, title: true, stage: true, pipeline: true } }),
  ]) : [[], null];
  const thread = [...events].reverse();

  return (
    <div className="space-y-4">
      <SectionTitle
        title="💬 Conversations"
        subtitle="The team inbox — every text, email and call with every seller, in one thread."
        accent="bg-brand-gold"
        right={
          <div className="flex items-center gap-2">
            <Link href="/crm" className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">🗂 Back to pipeline</Link>
          </div>
        }
      />

      {/* ➕ New message to ANYONE — no contact required (Jon 2026-10-08).
          Enter a number and/or email; we find-or-create the contact and open
          their thread, so you can text yourself or any brand-new number. */}
      <details className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <summary className="cursor-pointer text-xs font-bold text-slate-700">➕ New message — text or email any number, even if they&apos;re not a contact yet</summary>
        <form action={startConversationAction} className="mt-2 flex flex-wrap items-end gap-2">
          <label className="text-[10px] font-bold text-slate-500">Name (optional)<input name="name" placeholder="Jon test" className="mt-0.5 block rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></label>
          <label className="text-[10px] font-bold text-slate-500">Phone<input name="phone" placeholder="909-395-6195" className="mt-0.5 block rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></label>
          <label className="text-[10px] font-bold text-slate-500">Email<input name="email" type="email" placeholder="name@example.com" className="mt-0.5 block rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></label>
          <button className="rounded-lg bg-brand-navy px-4 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700">Open thread →</button>
        </form>
      </details>

      <Card className="overflow-hidden p-0">
        <div className="flex h-[84vh]">
          {/* left: thread list */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-100 bg-slate-50/50">
            <div className="sticky top-0 flex items-center gap-2 border-b border-slate-100 bg-white px-3 py-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">
              <span>Team inbox · {threads.length}</span>
              {manager && (
                <span className="ml-auto flex gap-1 normal-case tracking-normal">
                  <Link prefetch={false} href="/crm/conversations" className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${!mineOnly ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-500"}`}>All</Link>
                  <Link prefetch={false} href="/crm/conversations?who=me" className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${mineOnly ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-500"}`}>Mine</Link>
                </span>
              )}
            </div>
            {threads.length === 0 && <div className="p-4 text-xs text-slate-400">No conversations yet — texts, emails and calls will appear here.</div>}
            {/* ☑️ mass selection (Jon 2026-10-08): tick threads → mark read /
                unread / DNC in one shot. The checkbox stops the row's link. */}
            <form action={bulkConvAction}>
              <div className="sticky top-9 z-10 flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-3 py-1.5">
                <span className="text-[10px] font-bold text-slate-400">☑ selected →</span>
                <button name="op" value="read" className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300">mark read</button>
                <button name="op" value="unread" className="rounded bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-300">mark unread</button>
                {manager && <button name="op" value="dnc" className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 hover:bg-red-200">🚫 DNC</button>}
              </div>
              {threads.map((t) => (
                <div key={t.id} className={`flex items-start gap-2 border-b border-slate-100 px-2 py-2.5 hover:bg-white ${t.id === cId ? "bg-white ring-2 ring-inset ring-brand-navy/20" : ""}`}>
                  <input type="checkbox" name="cids" value={t.id} className="mt-2 h-3.5 w-3.5 shrink-0 accent-indigo-600" />
                  <Link prefetch={false} href={`/crm/conversations?c=${t.id}`} className="flex min-w-0 flex-1 items-start gap-2.5">
                    <span className="relative mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-navy/90 text-[11px] font-bold text-white">
                      {initials(t.name)}
                      {t.needsReply && <span title="They wrote last — unread" className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-red-500 ring-2 ring-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-800">{t.name}</span>
                        <span className="shrink-0 text-[10px] text-slate-400">{timeAgo(t.last.at)}</span>
                      </span>
                      <span className="block truncate text-xs text-slate-500">{KIND_EMOJI[t.last.kind] ?? "•"} {stripHtml(t.last.body).replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "")}</span>
                    </span>
                  </Link>
                </div>
              ))}
            </form>
          </div>

          {/* middle: the thread */}
          <div className="flex min-w-0 flex-1 flex-col bg-slate-50/30">
            {!contact || !visible ? (
              <div className="grid flex-1 place-items-center text-sm text-slate-400">Pick a conversation on the left.</div>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-4 py-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-navy/90 text-[11px] font-bold text-white">{initials(contact.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-slate-900">{contact.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{[contact.phone, contact.email].filter(Boolean).join(" · ")}</div>
                  </div>
                  {comms.call && contact.phone && <CallButton phone={contact.phone} name={contact.name} oppId={opp?.id} contactId={contact.id} />}
                  {opp && <Link href={`/crm/${opp.id}`} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Open lead ↗</Link>}
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {thread.length === 0 && <div className="text-center text-xs text-slate-400">No messages yet — start the conversation below.</div>}
                  {thread.map((e, i) => {
                    const body = stripHtml(e.body);
                    const inbound = body.startsWith("⬅");
                    const clean = body.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "");
                    const when = e.at.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                    if (e.kind === "call" || e.kind === "voicemail") return (
                      <div key={i} className="flex justify-center">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500">{KIND_EMOJI[e.kind] ?? "📞"} {clean} · {when}</span>
                      </div>
                    );
                    // 📷 inbound MMS/photos arrive as bare image URLs (Jon
                    // 2026-10-08: "will we SEE the photos, not a string?") —
                    // render them as actual images, keep the rest as text.
                    const imgUrls = clean.match(/https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi) ?? [];
                    const textOnly = imgUrls.reduce((s, u) => s.replace(u, ""), clean).replace(/[[\]]/g, "").trim();
                    return (
                      <div key={i} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${inbound ? "rounded-bl-sm bg-white text-slate-800 ring-1 ring-slate-200" : "rounded-br-sm bg-brand-navy text-white"}`}>
                          {imgUrls.map((u) => (
                            <a key={u} href={u} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt="photo" className="mb-1 max-h-56 rounded-lg" />
                            </a>
                          ))}
                          {textOnly && <div className="whitespace-pre-line break-words">{textOnly}</div>}
                          <div className={`mt-0.5 text-right text-[9px] ${inbound ? "text-slate-400" : "text-white/60"}`}>{KIND_EMOJI[e.kind] ?? ""} {when}{!inbound && e.actor ? ` · ${e.actor.split(" ")[0]}` : ""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <ConvComposerTabs contactId={contact.id} oppId={opp?.id ?? ""} phone={contact.phone} email={contact.email} leadName={contact.name} rep={me!.name} fromLabel={fromLabel} signature={mySignature} canSms={comms.sms} canEmail={comms.email} snippets={snippets}
                  smsHistory={thread.filter((e) => e.kind === "sms").map((e) => { const b = stripHtml(e.body); return { body: b.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: b.startsWith("⬅"), at: e.at.toISOString() }; })}
                  emailHistory={thread.filter((e) => e.kind === "email").map((e) => { const b = stripHtml(e.body); return { body: b.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: b.startsWith("⬅"), at: e.at.toISOString(), actor: e.actor }; })} />
              </>
            )}
          </div>

          {/* right: contact details rail */}
          {contact && visible && (
            <div className="hidden w-64 shrink-0 overflow-y-auto border-l border-slate-100 bg-white p-4 lg:block">
              <div className="mb-3 text-xs font-extrabold uppercase tracking-wide text-slate-400">Contact details</div>
              <div className="space-y-2 text-sm">
                <div><div className="text-[10px] font-bold text-slate-400">Name</div><div className="font-semibold text-slate-800">{contact.name}</div></div>
                {contact.phone && <div><div className="text-[10px] font-bold text-slate-400">Phone</div><div className="text-slate-700">{contact.phone}</div></div>}
                {contact.altPhone && <div><div className="text-[10px] font-bold text-slate-400">Phone 2</div><div className="text-slate-700">{contact.altPhone}</div></div>}
                {contact.email && <div><div className="text-[10px] font-bold text-slate-400">Email</div><div className="break-all text-slate-700">{contact.email}</div></div>}
                {contact.address && <div><div className="text-[10px] font-bold text-slate-400">Property</div><div className="text-slate-700">{contact.address}</div></div>}
                <div><div className="text-[10px] font-bold text-slate-400">Owner</div><div className="text-slate-700">{contact.assignedTo || "Unassigned"}</div></div>
                {opp && (
                  <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-100">
                    <div className="text-[10px] font-bold text-slate-400">Opportunity</div>
                    <div className="truncate text-xs font-semibold text-slate-700">{opp.title}</div>
                    <div className="text-[11px] text-slate-500">{opp.pipeline || "War Room"} · {opp.stage}</div>
                  </div>
                )}
                {contact.pinnedNote && <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {contact.pinnedNote}</div>}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
