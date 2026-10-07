"use client";
// GHL-style edit panel: click a card → tabbed editor slides in over the board
// (left section nav like GHL's opportunity modal). Everything is editable
// here — details, contact, discovery forms, tasks, appointments, notes —
// without opening the full card page.
import { useEffect, useState, useTransition } from "react";
import {
  setOppStageAction, addCrmNoteAction, saveOppMetaAction, saveCrmContactAction,
  addCrmTaskAction, toggleCrmTaskAction, addCrmApptAction, deleteCrmApptAction, saveCrmFormAction,
} from "@/app/crm/actions";
import { KIND_EMOJI } from "@/lib/crm-shared";
import { CRM_FORMS } from "@/lib/crm-forms";

type Payload = {
  id: string; title: string; stage: string; pipeline: string; assignedTo: string; tags: string;
  nextFollowUp: string; value: number | null; askPrice: number | null;
  formData: Record<string, Record<string, string | string[]>>;
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
                      <label className={labelCls}>Owner</label>
                      <input name="assignedTo" defaultValue={d.assignedTo} className={inputCls} placeholder="Rep name" />
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
