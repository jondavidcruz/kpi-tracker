"use client";
// GHL-style edit panel: click a card → tabbed editor slides in over the board
// (left section nav like GHL's opportunity modal). Everything is editable
// here — details, contact, discovery forms, tasks, appointments, notes —
// without opening the full card page.
import { useEffect, useState, useTransition } from "react";
import {
  setOppStageAction, addCrmNoteAction, saveOppMetaAction, saveCrmContactAction,
  addCrmTaskAction, toggleCrmTaskAction, addCrmApptAction, deleteCrmApptAction, saveCrmFormAction,
  setOppOwnerAction, toggleFollowerAction,
} from "@/app/crm/actions";
import { KIND_EMOJI } from "@/lib/crm-shared";
import { CRM_FORMS } from "@/lib/crm-forms";
import SmsComposer from "@/components/SmsComposer";
import GmailComposer from "@/components/GmailComposer";

type Payload = {
  id: string; title: string; stage: string; pipeline: string; assignedTo: string; tags: string;
  nextFollowUp: string; value: number | null; askPrice: number | null;
  formData: Record<string, Record<string, string | string[]>>;
  me: { name: string; fromLabel: string; signature: string; canSms: boolean; canEmail: boolean };
  followers: string[];
  reps: string[];
  snippets: Array<{ id: string; name: string; kind: string; subject?: string; body: string }>;
  smsHistory: Array<{ body: string; inbound: boolean; at: string }>;
  emailHistory: Array<{ body: string; inbound: boolean; at: string; actor?: string }>;
  underwrites: Array<{ tab: string; mao: number; fee: number; confidence: number; by: string; at: string }>;
  contact: { id: string; name: string; phone: string; altPhone: string; email: string; altEmail: string; address: string; pinnedNote: string; tags: string };
  tasks: Array<{ id: string; title: string; due: string }>;
  appts: Array<{ id: string; title: string; at: string; withWho: string }>;
  events: Array<{ kind: string; body: string; actor: string; at: string }>;
};

const TABS = [
  { key: "opp", label: "Opportunity details", emoji: "📁" },
  { key: "contact", label: "Contact info", emoji: "👤" },
  ...CRM_FORMS.map((f) => ({ key: `form:${f.key}`, label: f.name, emoji: f.emoji })),
  { key: "tasks", label: "Tasks", emoji: "✅" },
  { key: "appts", label: "Appointments", emoji: "📅" },
  { key: "sms", label: "Text message", emoji: "💬" },
  { key: "email", label: "Email", emoji: "✉️" },
  { key: "notes", label: "Notes & activity", emoji: "📝" },
];

const inputCls = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm";
const labelCls = "mb-0.5 block text-[11px] font-bold text-slate-500";

export default function CrmQuickView({ stages }: { stages: Array<{ key: string; label: string }> }) {
  const [oppId, setOppId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [tab, setTab] = useState("opp");
  const [saved, setSaved] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    const h = (e: Event) => { const id = (e as CustomEvent).detail?.id as string; if (id) { setOppId(id); setData(null); setTab("opp"); setSaved(""); } };
    window.addEventListener("fo-quickview", h);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOppId(null); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("fo-quickview", h); window.removeEventListener("keydown", esc); };
  }, []);

  const refetch = async (id: string) => { const r = await fetch(`/api/crm/opp/${id}`); if (r.ok) setData(await r.json()); };
  useEffect(() => { if (oppId) refetch(oppId); }, [oppId]);

  if (!oppId) return null;
  const d = data;
  const submit = (action: (fd: FormData) => Promise<unknown>, extra?: Record<string, string>) => (fd: FormData) => {
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    start(async () => { await action(fd); setSaved("✓ Saved"); setTimeout(() => setSaved(""), 2000); if (oppId) await refetch(oppId); });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-[2px]" onClick={() => setOppId(null)} />
      <div className="fixed inset-x-0 top-[4vh] z-50 mx-auto flex h-[88vh] w-[min(60rem,95vw)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {!d ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-lg font-extrabold tracking-tight text-slate-900">Edit “{d.contact.name}”</div>
                <div className="truncate text-xs text-slate-500">{d.pipeline} · details, tasks, notes and appointments</div>
              </div>
              {saved && <span className="text-xs font-bold text-emerald-600">{saved}</span>}
              {pending && <span className="text-xs text-slate-400">saving…</span>}
              {d.contact.phone && (
                <button onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: d.contact.phone, name: d.contact.name, oppId: d.id, contactId: d.contact.id } }))} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">📞 Call</button>
              )}
              <a href={`/crm/${d.id}`} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Open full ↗</a>
              <button onClick={() => setOppId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
            </div>

            {/* Salesforce-style path — same one as the full card */}
            <div className="flex gap-[3px] overflow-x-auto border-b border-slate-100 px-5 py-2">
              {stages.map((s, i) => {
                const curIdx = stages.findIndex((x) => x.key === d.stage);
                const done = i < curIdx, current = i === curIdx;
                return (
                  <button
                    key={s.key}
                    disabled={current || pending}
                    title={current ? `Current: ${s.label}` : `Move to ${s.label}`}
                    onClick={() => { setData({ ...d, stage: s.key }); const fd = new FormData(); fd.set("id", d.id); fd.set("stage", s.key); start(async () => { await setOppStageAction(fd); }); }}
                    className={`min-w-[80px] flex-1 truncate px-2 py-1 text-center text-[9px] font-bold transition first:rounded-l-full last:rounded-r-full ${
                      current ? "bg-brand-navy text-white" : done ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                    style={{ clipPath: i === stages.length - 1 ? undefined : "polygon(0 0, calc(100% - 7px) 0, 100% 50%, calc(100% - 7px) 100%, 0 100%, 7px 50%)" }}
                  >{s.label}</button>
                );
              })}
            </div>

            <div className="flex min-h-0 flex-1">
              {/* left section nav, GHL-style */}
              <nav className="w-48 shrink-0 space-y-0.5 overflow-y-auto border-r border-slate-100 bg-slate-50/60 p-2">
                {TABS.map((t) => (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold ${tab === t.key ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-slate-100"}`}>
                    {t.emoji} {t.label}
                  </button>
                ))}
              </nav>

              <div className="min-w-0 flex-1 overflow-y-auto p-5">
                {d.contact.pinnedNote && <div className="mb-3 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {d.contact.pinnedNote}</div>}

                {tab === "opp" && (
                  <form action={submit(saveOppMetaAction, { id: d.id })} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Opportunity name</label>
                      <input name="title" defaultValue={d.title} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Stage</label>
                      <select
                        value={d.stage}
                        onChange={(e) => { const stage = e.target.value; setData({ ...d, stage }); const fd = new FormData(); fd.set("id", d.id); fd.set("stage", stage); start(async () => { await setOppStageAction(fd); }); }}
                        className={inputCls}
                      >
                        {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={labelCls}>Owner (saves instantly)</label>
                      <select
                        value={d.assignedTo}
                        onChange={(e) => { const owner = e.target.value; setData({ ...d, assignedTo: owner }); const fd = new FormData(); fd.set("id", d.id); fd.set("owner", owner); start(async () => { await setOppOwnerAction(fd); }); }}
                        className={inputCls}
                      >
                        <option value="">Unassigned</option>
                        {d.reps.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <input type="hidden" name="assignedTo" value={d.assignedTo} />
                    </div>
                    <div>
                      <label className={labelCls}>👣 Followers (can see this lead)</label>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {d.followers.map((f) => (
                          <button key={f} type="button" title="Remove follower" onClick={() => { const fd = new FormData(); fd.set("id", d.id); fd.set("name", f); fd.set("remove", "1"); start(async () => { await toggleFollowerAction(fd); if (oppId) await refetch(oppId); }); }} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-600 ring-1 ring-indigo-100 hover:bg-red-50 hover:text-red-500">{f.split(" ")[0]} ✕</button>
                        ))}
                        <select value="" onChange={(e) => { const n = e.target.value; if (!n) return; const fd = new FormData(); fd.set("id", d.id); fd.set("name", n); start(async () => { await toggleFollowerAction(fd); if (oppId) await refetch(oppId); }); e.target.value = ""; }} className="rounded-lg border border-slate-200 px-1.5 py-1 text-[11px] font-bold text-slate-500">
                          <option value="">＋ add…</option>
                          {d.reps.filter((r) => r !== d.assignedTo && !d.followers.includes(r)).map((r) => <option key={r} value={r}>{r.split(" ")[0]}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Deal value $</label>
                      <input name="value" defaultValue={d.value ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Seller asking $</label>
                      <input name="askPrice" defaultValue={d.askPrice ?? ""} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Next follow-up</label>
                      <input name="nextFollowUp" type="date" defaultValue={d.nextFollowUp} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Tags (comma-separated)</label>
                      <input name="tags" defaultValue={d.tags} className={inputCls} />
                    </div>
                    <div className="col-span-2"><button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Update</button></div>
                  </form>
                )}

                {tab === "contact" && (
                  <form action={submit(saveCrmContactAction, { id: d.contact.id, oppId: d.id, ctags: d.contact.tags })} className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className={labelCls}>Name</label>
                      <input name="name" defaultValue={d.contact.name} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone</label>
                      <input name="phone" defaultValue={d.contact.phone} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Phone 2</label>
                      <input name="altPhone" defaultValue={d.contact.altPhone} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input name="email" defaultValue={d.contact.email} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>Email 2</label>
                      <input name="altEmail" defaultValue={d.contact.altEmail} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>Property address</label>
                      <input name="address" defaultValue={d.contact.address} className={inputCls} />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>📌 Pinned note (always on top)</label>
                      <input name="pinnedNote" defaultValue={d.contact.pinnedNote} className={inputCls} />
                    </div>
                    <div className="col-span-2"><button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Update</button></div>
                  </form>
                )}

                {CRM_FORMS.map((f) => tab === `form:${f.key}` && (
                  <form key={f.key} action={submit(saveCrmFormAction, { oppId: d.id, contactId: d.contact.id, formKey: f.key })} className="space-y-3">
                    <div className="text-sm font-extrabold text-slate-800">{f.emoji} {f.name}</div>
                    {f.key === "financial" && <UnderwriteBlock d={d} />}
                    {f.fields.map((fld) => {
                      const cur = d.formData?.[f.key]?.[fld.key];
                      if (fld.type === "select") return (
                        <div key={fld.key}>
                          <label className={labelCls}>{fld.label}</label>
                          <select name={`f_${fld.key}`} defaultValue={typeof cur === "string" ? cur : ""} className={inputCls}>
                            <option value="">—</option>
                            {fld.options.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </div>
                      );
                      if (fld.type === "checks") return (
                        <div key={fld.key}>
                          <label className={labelCls}>{fld.label}</label>
                          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                            {fld.options.map((o) => (
                              <label key={o} className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-700 ring-1 ring-slate-100">
                                <input type="checkbox" name={`f_${fld.key}`} value={o} defaultChecked={Array.isArray(cur) && cur.includes(o)} />
                                {o}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                      if (fld.type === "textarea") return (
                        <div key={fld.key}>
                          <label className={labelCls}>{fld.label}</label>
                          <textarea name={`f_${fld.key}`} defaultValue={typeof cur === "string" ? cur : ""} rows={2} placeholder={fld.hint ?? ""} className={inputCls} />
                        </div>
                      );
                      return (
                        <div key={fld.key}>
                          <label className={labelCls}>{fld.label}</label>
                          <input name={`f_${fld.key}`} defaultValue={typeof cur === "string" ? cur : ""} placeholder={fld.hint ?? ""} className={inputCls} />
                        </div>
                      );
                    })}
                    <button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Save {f.name}</button>
                  </form>
                ))}

                {tab === "tasks" && (
                  <div className="space-y-3">
                    <form action={submit(addCrmTaskAction, { oppId: d.id, contactId: d.contact.id })} className="flex gap-2">
                      <input name="title" placeholder="New task…" required className={inputCls} />
                      <input name="due" type="date" className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <button className="rounded-xl bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">Add</button>
                    </form>
                    {d.tasks.length === 0 && <div className="text-xs text-slate-400">No open tasks.</div>}
                    {d.tasks.map((t) => (
                      <form key={t.id} action={submit(toggleCrmTaskAction, { id: t.id })} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                        <button className="grid h-5 w-5 place-items-center rounded border border-slate-300 bg-white text-[10px] text-transparent hover:text-emerald-600" title="Mark done">✓</button>
                        <span className="flex-1 text-sm text-slate-700">{t.title}</span>
                        {t.due && <span className="text-[11px] font-bold text-slate-400">{t.due}</span>}
                      </form>
                    ))}
                  </div>
                )}

                {tab === "appts" && (
                  <div className="space-y-3">
                    <form action={submit(addCrmApptAction, { oppId: d.id, contactId: d.contact.id })} className="grid grid-cols-2 gap-2">
                      <input name="title" placeholder="Appointment title…" required className={`${inputCls} col-span-2`} />
                      <select name="aptType" className={inputCls}>
                        <option value="phone">📞 Phone apt</option>
                        <option value="inperson">🤝 In person apt</option>
                      </select>
                      <select name="purpose" className={inputCls}>
                        <option value="Process call">Process call</option>
                        <option value="Offer call">Offer call</option>
                        <option value="Negotiation">Negotiation</option>
                        <option value="Follow-up info">Follow-up info</option>
                        <option value="Inspection / photos">Inspection / photos</option>
                        <option value="Contract signing">Contract signing</option>
                        <option value="custom">✏️ Custom…</option>
                      </select>
                      <input name="purposeCustom" placeholder="custom purpose (if ✏️)" className={inputCls} />
                      <input name="at" type="datetime-local" required className={inputCls} />
                      <input name="note" placeholder="Note (optional)" className={inputCls} />
                      <div className="col-span-2"><button className="rounded-xl bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">Book appointment</button></div>
                    </form>
                    {d.appts.length === 0 && <div className="text-xs text-slate-400">Nothing booked.</div>}
                    {d.appts.map((a) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                        <span className="flex-1 text-sm text-slate-700">📅 {a.title}</span>
                        <span className="text-[11px] font-bold text-slate-500">{new Date(a.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                        <form action={submit(deleteCrmApptAction, { id: a.id })}><button className="text-xs text-slate-400 hover:text-red-500" title="Delete">🗑</button></form>
                      </div>
                    ))}
                  </div>
                )}

                {tab === "sms" && (
                  !d.me.canSms ? <div className="text-xs text-amber-600">Texting isn&apos;t enabled for you — ask Jon (Comms access on /crm).</div>
                  : !d.contact.phone ? <div className="text-xs text-slate-400">No phone number on file.</div>
                  : <SmsComposer compact history={d.smsHistory} oppId={d.id} contactId={d.contact.id} to={d.contact.phone} leadName={d.contact.name} rep={d.me.name} snippets={d.snippets.filter((s) => s.kind === "sms")} />
                )}

                {tab === "email" && (
                  !d.me.canEmail ? <div className="text-xs text-amber-600">Email isn&apos;t enabled for you — ask Jon (Comms access on /crm).</div>
                  : !d.contact.email ? <div className="text-xs text-slate-400">No email on file.</div>
                  : <GmailComposer history={d.emailHistory} oppId={d.id} contactId={d.contact.id} to={d.contact.email} leadName={d.contact.name} rep={d.me.name} fromLabel={d.me.fromLabel} signature={d.me.signature} snippets={d.snippets.filter((s) => s.kind === "email")} />
                )}

                {tab === "notes" && (
                  <div className="space-y-3">
                    <form action={submit(addCrmNoteAction, { oppId: d.id, contactId: d.contact.id })} className="flex gap-2">
                      <input name="body" placeholder="Add a note…" required className={inputCls} />
                      <button className="rounded-xl bg-brand-navy px-3 py-1.5 text-xs font-bold text-white">📝 Add</button>
                    </form>
                    <div className="space-y-1.5">
                      {d.events.map((e, i) => (
                        <div key={i} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-700 ring-1 ring-slate-100">
                          <span className="mr-1">{KIND_EMOJI[e.kind] ?? "•"}</span>
                          <span className="whitespace-pre-line">{e.body}</span>
                          <span className="ml-1 text-[9px] text-slate-400">{e.actor} · {new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

// 🧮 Financials & Offer: the lead's saved underwriting (matched by address),
// what we offered vs what the seller said, and a negotiation playbook when
// the answer was no (Jon 2026-10-08). All data already in the payload — zero
// extra fetches.
const UW_TABS: Record<string, string> = {
  cash: "💵 Cash", novation: "📝 Novation", creative: "🎨 Creative",
  listing: "🏷 Listing", flip: "🔨 Flip", cash_land: "🏞 Land (Cash)",
  developer: "🚧 Developer", note_land: "📜 Land Note",
};
function UnderwriteBlock({ d }: { d: Payload }) {
  const uw = d.underwrites ?? [];
  const fin = (d.formData?.financial ?? {}) as Record<string, string | string[]>;
  const num = (s: unknown) => parseFloat(String(s ?? "").replace(/[^0-9.]/g, "")) || 0;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
  // latest underwrite per exit strategy
  const latest = new Map<string, (typeof uw)[number]>();
  for (const u of uw) if (!latest.has(u.tab)) latest.set(u.tab, u);
  const bestMao = Math.max(0, ...uw.map((u) => u.mao));
  const ourOffer = num(fin.ourOffer);
  const sellerNum = num(fin.sellerNumber) || num((d.formData?.discovery as Record<string, string | string[]> | undefined)?.wants);
  const resp = String(fin.sellerResponse ?? "");
  const rejected = resp.includes("Rejected") || resp.includes("Countered");
  const addr = d.contact.address || d.title;
  const calcHref = `/underwriting?address=${encodeURIComponent(addr)}`;

  // negotiation playbook (rule-based, uses the real numbers on this lead)
  const tips: string[] = [];
  if (rejected) {
    const gap = sellerNum && ourOffer ? sellerNum - ourOffer : 0;
    if (gap > 0) tips.push(`Gap is ${money(gap)} (they want ${money(sellerNum)}, we offered ${money(ourOffer)}). Reframe to their NET: on the open market they lose ~6% commissions + concessions — our number is net, theirs isn't.`);
    const nov = latest.get("novation");
    if (nov && sellerNum && nov.mao >= sellerNum) tips.push(`Our Novation number (${money(nov.mao)}) covers their ask — pivot: "What if I could get you ${money(sellerNum)}, we just need a little more time to close?"`);
    const cre = latest.get("creative");
    if (cre && sellerNum && cre.mao >= sellerNum) tips.push(`Creative terms reach ${money(cre.mao)} — ask: "If the price were right, would you be open to receiving it over time instead of all at once?"`);
    if (!tips.length && sellerNum && bestMao && sellerNum > bestMao) tips.push(`They're ${money(sellerNum - bestMao)} above our best number (${money(bestMao)}). Don't chase — ask "What would you do with the proceeds?" to surface the real need, then anchor with assessed value + sold comps.`);
    tips.push("Ask what they'd NET from their best alternative, then go quiet — let them fill the silence.");
    tips.push("No deal today ≠ dead: set a follow-up, most land sellers say yes between day 30 and 120.");
  }

  return (
    <div className="space-y-2 rounded-xl bg-indigo-50/50 p-3 ring-1 ring-indigo-100">
      <div className="flex items-center gap-2">
        <span className="text-xs font-extrabold text-indigo-900">🧮 Underwriting on file</span>
        <a href={calcHref} target="_blank" className="ml-auto rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100">Open calculator ↗</a>
      </div>
      {latest.size === 0 ? (
        <div className="text-[11px] text-slate-500">No saved underwriting matches this address yet — run it in the <a href={calcHref} target="_blank" className="font-bold text-indigo-700 underline">calculator</a> (address pre-filled) and the MAOs appear here automatically.</div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {[...latest.values()].map((u) => (
            <a key={u.tab} href={calcHref} target="_blank" className="rounded-lg bg-white p-2 ring-1 ring-indigo-100 hover:ring-indigo-300">
              <div className="text-[10px] font-bold text-slate-500">{UW_TABS[u.tab] ?? u.tab}</div>
              <div className="text-sm font-extrabold text-slate-900">{money(u.mao)} <span className="text-[9px] font-semibold text-slate-400">MAO</span></div>
              <div className="text-[10px] text-slate-400">fee {money(u.fee)} · {u.confidence}% conf · {u.by.split(" ")[0]} {new Date(u.at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</div>
            </a>
          ))}
        </div>
      )}
      {(ourOffer > 0 || sellerNum > 0 || resp) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {ourOffer > 0 && <span className="rounded-lg bg-white px-2 py-1 font-bold text-slate-700 ring-1 ring-slate-200">Our offer: {money(ourOffer)}</span>}
          {sellerNum > 0 && <span className="rounded-lg bg-white px-2 py-1 font-bold text-slate-700 ring-1 ring-slate-200">Seller: {money(sellerNum)}</span>}
          {resp && <span className={`rounded-lg px-2 py-1 font-bold ring-1 ${resp.includes("Accepted") ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : rejected ? "bg-red-50 text-red-700 ring-red-200" : "bg-white text-slate-600 ring-slate-200"}`}>{resp}</span>}
        </div>
      )}
      {tips.length > 0 && (
        <div className="rounded-lg bg-white p-2.5 ring-1 ring-amber-200">
          <div className="text-[11px] font-extrabold text-amber-800">🤝 Negotiation playbook — they said no. Try this:</div>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-slate-600">
            {tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
