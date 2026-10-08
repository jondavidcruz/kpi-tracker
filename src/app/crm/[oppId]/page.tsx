import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { getActiveReps, getSettings } from "@/lib/data";
import { readPipelines, parseTags, KIND_EMOJI } from "@/lib/crm";
import { stripHtml } from "@/lib/crm-shared";
import { CRM_FORMS } from "@/lib/crm-forms";
import { Card } from "@/components/ui";
import CallButton from "@/components/CallButton";
import { setOppStageAction, addCrmNoteAction, logCrmTouchAction, saveOppMetaAction, saveCrmContactAction, addCrmTaskAction, toggleCrmTaskAction, addCrmApptAction, deleteCrmApptAction, addOpportunityAction, addCrmPartyAction, deleteCrmPartyAction, saveCrmFormAction, draftContractAction, toggleDndAction } from "../actions";
import { commsFor, readSignatures, firstOf, defaultSignature } from "@/lib/crm-comms";
import { readSnippets, readSequences, readSeqState } from "@/lib/crm-templates";
import SmsComposer from "@/components/SmsComposer";
import GmailComposer from "@/components/GmailComposer";
import { enrollSequenceAction, unenrollSequenceAction } from "../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const lbl = "block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5";

export default async function OpportunityPage({ params }: { params: Promise<{ oppId: string }> }) {
  const { oppId } = await params;
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The Seller CRM is for acquisitions + managers.</Card>;
  const settings = await getSettings();
  const tz = settings.orgTimezone;

  const opp = await db.crmOpportunity.findUnique({ where: { id: oppId }, include: { contact: true } });
  if (!opp) return <Card className="p-10 text-center text-slate-400">Lead not found. <Link href="/crm" className="font-bold text-sky-700 underline">Back to the pipeline</Link></Card>;
  // Reps open only leads in THEIR pipeline (managers see everything).
  const followersList = Array.isArray((opp.formData as Record<string, unknown> | null)?.__followers) ? ((opp.formData as Record<string, unknown>).__followers as string[]) : [];
  if (!isManager(me!) && opp.assignedTo && opp.assignedTo !== me!.name && !followersList.includes(me!.name)) {
    return <Card className="p-10 text-center text-slate-400">This lead is in {opp.assignedTo.split(" ")[0]}&apos;s pipeline. <Link href="/crm" className="font-bold text-sky-700 underline">Back to yours</Link></Card>;
  }
  const c = opp.contact;

  const [pipelines, reps, events, tasks, appts, siblingOpps, parties] = await Promise.all([
    readPipelines(),
    getActiveReps(),
    db.crmEvent.findMany({ where: { contactId: c.id }, orderBy: { at: "desc" }, take: 80 }),
    db.crmTask.findMany({ where: { oppId }, orderBy: [{ doneAt: "asc" }, { due: "asc" }] }),
    db.crmAppointment.findMany({ where: { oppId }, orderBy: { at: "asc" } }),
    db.crmOpportunity.findMany({ where: { contactId: c.id, id: { not: oppId } }, select: { id: true, title: true, stage: true } }),
    db.crmParty.findMany({ where: { oppId }, orderBy: { createdAt: "asc" } }),
  ]);
  const [snippets, sequences, seqState] = await Promise.all([readSnippets(), readSequences(), readSeqState()]);
  const enrolled = seqState[opp.id];
  const pipe = pipelines.find((x) => x.name === (opp.pipeline || "War Room")) ?? pipelines[0];
  const stages = pipe.stages;
  const st = stages.find((s) => s.key === opp.stage);
  const comms = await commsFor(me!);
  const mySignature = (await readSignatures())[firstOf(me!.name)] || defaultSignature(me!.name);
  const fmtAt = (d: Date) => d.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const devH = opp.devPricingSentAt ? Math.round((Date.now() - opp.devPricingSentAt.getTime()) / 3_600_000) : null;

  return (
    <div className="space-y-4">
      {/* ── Header: who, stage, actions ── */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/crm" className="text-sm font-bold text-slate-400 hover:text-slate-600">←</Link>
          <div>
            <div className="text-lg font-extrabold tracking-tight text-slate-900">{c.name}</div>
            <div className="text-xs text-slate-500">{opp.title}</div>
          </div>
          <form action={setOppStageAction} className="flex items-center gap-1.5">
            <input type="hidden" name="id" value={opp.id} />
            <select name="stage" defaultValue={opp.stage} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold">
              {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <button className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Move</button>
          </form>
          {opp.stage === "at_developers" && devH != null && (
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${devH >= 36 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>⏳ {devH}h at developers</span>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {comms.call && c.phone && <CallButton phone={c.phone} name={c.name} oppId={opp.id} contactId={c.id} label="📞 Call" />}
            {comms.call && c.altPhone && <CallButton phone={c.altPhone} name={c.name} oppId={opp.id} contactId={c.id} label="📞 Alt" subtle />}
            
            {!comms.call && !comms.sms && !comms.email && <span className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-400" title="Notes, tasks, stages & appointments are all yours — paid channels are off for your account">📝 notes-only access</span>}
            <a href={`/underwriting?address=${encodeURIComponent(opp.title)}`} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">🧮 Underwrite</a>
          </span>
        </div>

        {/* Salesforce-style path: the whole pipeline as a clickable chevron bar —
            green behind the current stage, one click moves the lead. */}
        <div className="mt-3 flex gap-[3px] overflow-x-auto pb-1">
          {stages.map((s, i) => {
            const curIdx = stages.findIndex((x) => x.key === opp.stage);
            const done = i < curIdx, current = i === curIdx;
            return (
              <form key={s.key} action={setOppStageAction} className="min-w-0 flex-1" style={{ minWidth: 86 }}>
                <input type="hidden" name="id" value={opp.id} />
                <input type="hidden" name="stage" value={s.key} />
                <button
                  title={current ? `Current stage: ${s.label}` : `Move to ${s.label}`}
                  disabled={current}
                  className={`w-full truncate px-2 py-1.5 text-center text-[10px] font-bold transition first:rounded-l-full last:rounded-r-full ${
                    current ? "bg-brand-navy text-white"
                    : done ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                  style={{ clipPath: i === stages.length - 1 ? undefined : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)" }}
                >{s.label}</button>
              </form>
            );
          })}
        </div>
        {c.pinnedNote && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {c.pinnedNote}</div>}
      </Card>

      <div className="flex flex-wrap items-start gap-4">
        {/* GHL-style section nav */}
        <nav className="sticky top-4 hidden w-44 shrink-0 flex-col gap-0.5 rounded-2xl bg-white p-2 shadow-sm ring-1 ring-slate-200 xl:flex">
          {[["#opp", "Opportunity details"], ["#contact", "Contact details"], ["#discovery", "📋 Discovery"], ["#parties", "Parties (DS)"], ["#tasks", "Tasks"], ["#appts", "Appointments"], ["#compose", "Email / SMS"], ["#timeline", "Notes & timeline"]].map(([h, l]) => (
            <a key={h} href={h} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900">{l}</a>
          ))}
        </nav>
        {/* ── Left column ── */}
        <div className="flex w-full max-w-md flex-col gap-3 lg:w-[380px]">
          {/* contact card */}
          <Card className="p-4">
            <details open id="contact" className="scroll-mt-4">
              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-400">👤 Contact — all phones &amp; emails (edit)</summary>
              <form action={saveCrmContactAction} className="mt-2 space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="oppId" value={opp.id} />
                <div className="grid grid-cols-2 gap-2">
                  <label><span className={lbl}>Name</span><input name="name" defaultValue={c.name} className={inputCls} /></label>
                  <label><span className={lbl}>Phone</span><input name="phone" defaultValue={c.phone} className={inputCls} /></label>
                  <label><span className={lbl}>Phone 2</span><input name="altPhone" defaultValue={c.altPhone} className={inputCls} /></label>
                  <label><span className={lbl}>Email</span><input name="email" defaultValue={c.email} className={inputCls} /></label>
                  <label><span className={lbl}>Email 2</span><input name="altEmail" defaultValue={c.altEmail} className={inputCls} /></label>
                </div>
                <label><span className={lbl}>Address</span><input name="address" defaultValue={c.address} className={inputCls} /></label>
                <label><span className={lbl}>Contact tags</span><input name="ctags" defaultValue={c.tags} placeholder="motivated, probate…" className={inputCls} /></label>
                <label><span className={lbl}>📌 Pinned note (always visible)</span><input name="pinnedNote" defaultValue={c.pinnedNote} className={inputCls} /></label>
                <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Save contact</button>
              </form>
            </details>
            <div className="mt-2 space-y-1 text-[13px] text-slate-700">
              {c.phone && <div>📱 {c.phone}{c.altPhone ? ` · ${c.altPhone}` : ""}</div>}
              {c.email && <div>✉️ {c.email}{c.altEmail ? ` · ${c.altEmail}` : ""}</div>}
              {c.address && <div>🏠 {c.address}</div>}
              <div className="text-xs text-slate-400">Source: {c.source || "—"} · added {c.createdAt.toLocaleDateString()}</div>
              {parseTags(c.tags).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">{parseTags(c.tags).map((t) => <span key={t} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">#{t}</span>)}</div>
              )}
            </div>
            {/* multi-opportunity */}
            <div className="mt-3 border-t border-slate-100 pt-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Other opportunities ({siblingOpps.length})</div>
              {siblingOpps.map((o) => (
                <Link key={o.id} href={`/crm/${o.id}`} className="mt-1 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                  <span className="flex-1">{o.title}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${stages.find((s) => s.key === o.stage)?.cls ?? ""}`}>{stages.find((s) => s.key === o.stage)?.label ?? o.stage}</span>
                </Link>
              ))}
              <form action={addOpportunityAction} className="mt-1.5 flex gap-1.5">
                <input type="hidden" name="contactId" value={c.id} />
                <input name="title" placeholder="＋ another property…" className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
                <button className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-200">Add</button>
              </form>
            </div>
          </Card>

          {/* 🔕 DND by channel (GHL-style, Jon 2026-10-08) — blocks senders cold */}
          <Card className="p-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">🔕 DND — Do Not Disturb</div>
            <div className="grid grid-cols-2 gap-1.5">
              {([["all", "🚫 ALL channels"], ["sms", "💬 Text messages"], ["email", "✉️ Email"], ["call", "📞 Calls"]] as const).map(([ch, label]) => {
                const on = new RegExp(`\\bdnd_${ch}\\b`).test(c.tags) || (ch !== "all" && /\bdnd_all\b|\bdnc\b/.test(c.tags));
                return (
                  <form key={ch} action={toggleDndAction}>
                    <input type="hidden" name="contactId" value={c.id} />
                    <input type="hidden" name="channel" value={ch} />
                    <button className={`w-full rounded-lg px-2 py-1.5 text-left text-[11px] font-bold ring-1 ${on ? "bg-red-50 text-red-700 ring-red-200" : "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100"}`}>
                      {on ? "⛔ " : ""}{label}
                    </button>
                  </form>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-slate-400">Red = blocked. Texts/emails are refused server-side and logged; incoming STOP replies set this automatically.</p>
          </Card>

          {/* 📎 Documents — every file saved on this lead (PandaDoc, Drive, uploads) */}
          <Card className="p-4">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">📎 Documents</div>
            {events.filter((e) => e.kind === "file").length === 0 ? (
              <p className="text-xs text-slate-400">No documents yet — signed PandaDocs and Drive files attach here automatically.</p>
            ) : (
              <div className="space-y-1.5">
                {events.filter((e) => e.kind === "file").map((e) => {
                  const link = (e.meta as { link?: string } | null)?.link;
                  const name = stripHtml(e.body).replace(/^📎\s*/, "").slice(0, 90);
                  return (
                    <a key={e.id} href={link ?? "#"} target="_blank" rel="noreferrer" className={`block rounded-lg px-2.5 py-1.5 text-xs ring-1 ${link ? "bg-indigo-50/50 text-indigo-800 ring-indigo-100 hover:bg-indigo-50" : "bg-slate-50 text-slate-500 ring-slate-100"}`}>
                      📄 {name}
                      <span className="block text-[9px] text-slate-400">{e.at.toLocaleDateString("en-US")} · {e.actor}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </Card>

          {/* opportunity meta */}
          <Card className="p-4">
            <div id="opp" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">🎯 Opportunity</div>
            <form action={saveOppMetaAction} className="space-y-2">
              <input type="hidden" name="id" value={opp.id} />
              <label><span className={lbl}>Title / property</span><input name="title" defaultValue={opp.title} className={inputCls} /></label>
              <label><span className={lbl}>Pipeline</span>
                <select name="pipeline" defaultValue={opp.pipeline || "War Room"} className={inputCls}>
                  {pipelines.map((pp) => <option key={pp.name} value={pp.name}>{pp.name}</option>)}
                </select></label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className={lbl}>Seller wants $</span><input name="askPrice" defaultValue={opp.askPrice ?? ""} className={inputCls} /></label>
                <label><span className={lbl}>Est. value / fee $</span><input name="value" defaultValue={opp.value ?? ""} className={inputCls} /></label>
                <label><span className={lbl}>Assigned to</span>
                  <select name="assignedTo" defaultValue={opp.assignedTo} className={inputCls}>
                    <option value="">unassigned</option>
                    {reps.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                  </select></label>
                <label><span className={lbl}>Next follow-up</span><input type="date" name="nextFollowUp" defaultValue={opp.nextFollowUp} className={inputCls} /></label>
              </div>
              <label><span className={lbl}>Tags</span><input name="tags" defaultValue={opp.tags} placeholder="hot, novation, flood-check…" className={inputCls} /></label>
              <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Save</button>
            </form>
          </Card>

          {/* tasks */}
          <Card className="p-4">
            <div id="tasks" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">⏰ Tasks</div>
            <div className="space-y-1.5">
              {tasks.map((t) => (
                <form key={t.id} action={toggleCrmTaskAction} className="flex items-center gap-2 text-sm">
                  <input type="hidden" name="id" value={t.id} />
                  <button className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[11px] font-bold ring-1 ${t.doneAt ? "bg-emerald-500 text-white ring-emerald-600" : "bg-white text-transparent ring-slate-300 hover:ring-emerald-400"}`}>✓</button>
                  <span className={t.doneAt ? "text-slate-400 line-through" : "font-semibold text-slate-700"}>{t.title}</span>
                  {t.due && !t.doneAt && <span className={`ml-auto text-[10px] font-bold ${t.due.slice(0, 10) <= new Date().toISOString().slice(0, 10) ? "text-red-600" : "text-slate-400"}`}>{t.due.slice(0, 10)}</span>}
                  {t.assignedTo && <span className="text-[10px] text-slate-400">{t.assignedTo.split(" ")[0]}</span>}
                </form>
              ))}
              {tasks.length === 0 && <p className="text-xs text-slate-400">No tasks yet.</p>}
            </div>
            <form action={addCrmTaskAction} className="mt-2 flex flex-wrap gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <input name="title" placeholder="＋ task…" required className="min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input type="date" name="due" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <select name="assignedTo" defaultValue={me?.name ?? ""} className="rounded-lg border border-slate-200 px-1.5 py-1 text-xs">
                {reps.map((r) => <option key={r.id} value={r.name}>{r.name.split(" ")[0]}</option>)}
              </select>
              <button className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">Add</button>
            </form>
          </Card>

          {/* 📋 Discovery forms — the GHL custom-field sections, simplified */}
          <Card className="p-4" id="discovery">
            <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">📋 Discovery — fill as you talk</div>
            {(() => {
              const fd = (opp.formData ?? {}) as Record<string, Record<string, string | string[]>>;
              return CRM_FORMS.map((form) => {
                const answers = fd[form.key] ?? {};
                const count = Object.keys(answers).length;
                return (
                  <details key={form.key} className="mb-1.5 rounded-xl bg-slate-50 ring-1 ring-slate-100" open={count > 0 && count < form.fields.length}>
                    <summary className="cursor-pointer px-3 py-2 text-xs font-bold text-slate-700">
                      {form.emoji} {form.name}
                      <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${count ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{count}/{form.fields.length}</span>
                    </summary>
                    <form action={saveCrmFormAction} className="space-y-2 px-3 pb-3">
                      <input type="hidden" name="oppId" value={opp.id} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <input type="hidden" name="formKey" value={form.key} />
                      {form.fields.map((f) => (
                        <label key={f.key} className="block">
                          <span className={lbl}>{f.label}</span>
                          {f.type === "text" && <input name={`f_${f.key}`} defaultValue={(answers[f.key] as string) ?? ""} placeholder={f.hint ?? ""} className={inputCls} />}
                          {f.type === "textarea" && <textarea name={`f_${f.key}`} rows={2} defaultValue={(answers[f.key] as string) ?? ""} placeholder={f.hint ?? ""} className={inputCls} />}
                          {f.type === "select" && (
                            <select name={`f_${f.key}`} defaultValue={(answers[f.key] as string) ?? ""} className={inputCls}>
                              <option value="">—</option>
                              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          )}
                          {f.type === "checks" && (
                            <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                              {f.options.map((o) => (
                                <label key={o} className="flex items-center gap-1 text-[11px] font-medium text-slate-600">
                                  <input type="checkbox" name={`f_${f.key}`} value={o} defaultChecked={Array.isArray(answers[f.key]) && (answers[f.key] as string[]).includes(o)} /> {o}
                                </label>
                              ))}
                            </span>
                          )}
                        </label>
                      ))}
                      <button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Save {form.name}</button>
                    </form>
                  </details>
                );
              });
            })()}
          </Card>

          {/* parties in the deal */}
          <Card className="p-4">
            <div id="parties" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">🤝 Parties in this deal</div>
            <div className="space-y-1.5">
              {parties.map((p) => (
                <div key={p.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs ring-1 ring-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500 ring-1 ring-slate-200">{p.role || "party"}</span>
                    <span className="font-bold text-slate-800">{p.name}</span>
                    <form action={deleteCrmPartyAction} className="ml-auto"><input type="hidden" name="id" value={p.id} /><button className="text-[10px] text-slate-300 hover:text-red-500">✕</button></form>
                  </div>
                  <div className="mt-0.5 text-[11px] text-brand-navy">{[p.phone, p.email].filter(Boolean).join(" · ")}</div>
                  {p.note && <div className="text-[10px] text-slate-400">{p.note}</div>}
                </div>
              ))}
              {parties.length === 0 && <p className="text-xs text-slate-400">No one attached yet — listing agent, escrow, title, attorney…</p>}
            </div>
            <form action={addCrmPartyAction} className="mt-2 grid grid-cols-2 gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <select name="role" className="rounded-lg border border-slate-200 px-2 py-1 text-xs">
                <option value="listing agent">listing agent</option>
                <option value="buyer agent">buyer agent</option>
                <option value="escrow">escrow</option>
                <option value="title">title</option>
                <option value="attorney">attorney</option>
                <option value="JV partner">JV partner</option>
                <option value="other">other</option>
              </select>
              <input name="name" placeholder="Name *" required className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input name="phone" placeholder="Phone" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input name="email" placeholder="Email" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input name="note" placeholder="Note (company, file #…)" className="col-span-2 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <button className="col-span-2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-white">＋ Attach party</button>
            </form>
          </Card>

          {/* appointments */}
          <Card className="p-4">
            <div id="appts" className="mb-1.5 scroll-mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-400">📅 Appointments <span className="normal-case text-slate-300">(alarm posts to the huddle chat ~1h before)</span></div>
            <div className="space-y-1.5">
              {appts.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg bg-indigo-50/70 px-2.5 py-1.5 text-xs ring-1 ring-indigo-100">
                  <span className="font-bold text-indigo-800">{fmtAt(a.at)}</span>
                  <span className="font-semibold text-slate-700">{a.title}</span>
                  <span className="text-slate-400">· {a.withWho}</span>
                  <form action={deleteCrmApptAction} className="ml-auto"><input type="hidden" name="id" value={a.id} /><button className="text-[10px] text-slate-300 hover:text-red-500">✕</button></form>
                </div>
              ))}
              {appts.length === 0 && <p className="text-xs text-slate-400">Nothing booked.</p>}
            </div>
            <form action={addCrmApptAction} className="mt-2 flex flex-wrap gap-1.5">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <input name="title" placeholder="＋ offer call…" required className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs" />
<select name="aptType" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
                <option value="phone">📞 Phone apt</option>
                <option value="inperson">🤝 In person apt</option>
              </select>
              <select name="purpose" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
                <option value="Process call">Process call</option>
                <option value="Offer call">Offer call</option>
                <option value="Negotiation">Negotiation</option>
                <option value="Follow-up info">Follow-up info</option>
                <option value="Inspection / photos">Inspection / photos</option>
                <option value="Contract signing">Contract signing</option>
                <option value="custom">✏️ Custom…</option>
              </select>
              <input name="purposeCustom" placeholder="custom purpose (if ✏️)" className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <input type="datetime-local" name="at" required className="rounded-lg border border-slate-200 px-2 py-1 text-xs" />
              <button className="rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-bold text-white">Book</button>
            </form>
          </Card>
        </div>

        {/* ── Right column: composer + timeline ── */}
        <div className="min-w-0 flex-1 space-y-2.5" style={{ flexBasis: "480px", flexGrow: 999 }}>
          <Card className="p-3">
            <form action={addCrmNoteAction} className="flex gap-2">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <input name="body" placeholder="Write a note… what did the seller say?" required className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
              <button className="rounded-xl bg-brand-navy px-4 py-2 text-sm font-bold text-white hover:opacity-90">📝 Note</button>
            </form>
            <form action={logCrmTouchAction} className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="contactId" value={c.id} />
              <span className="font-bold text-slate-400">Quick log:</span>
              <button name="kind" value="call" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">📞 called</button>
              <button name="kind" value="sms" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">💬 texted</button>
              <button name="kind" value="email" className="rounded-lg bg-slate-100 px-2.5 py-1 font-bold text-slate-600 hover:bg-slate-200">✉️ emailed</button>
              <input name="body" placeholder="optional note" className="min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 py-1" />
            </form>
          </Card>

          {comms.sms && c.phone && (
            <Card id="compose" className="scroll-mt-4 p-4">
              <SmsComposer history={[...events].reverse().filter((e) => e.kind === "sms").map((e) => { const b = stripHtml(e.body); return { body: b.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: b.startsWith("⬅"), at: e.at.toISOString() }; })} oppId={opp.id} contactId={c.id} to={c.phone} leadName={c.name} rep={me!.name} snippets={snippets.filter((x) => x.kind === "sms")} />
            </Card>
          )}

          {comms.email && c.email && (
            <GmailComposer
              history={[...events].reverse().filter((e) => e.kind === "email").map((e) => { const b = stripHtml(e.body); return { body: b.replace(/^[⬅➡️️\s]*(Seller|Us):\s*/u, "").slice(0, 400), inbound: b.startsWith("⬅"), at: e.at.toISOString(), actor: e.actor }; })}
              oppId={opp.id} contactId={c.id} to={c.email} leadName={c.name} rep={me!.name}
              fromLabel={`${me!.name} <${me!.name.split(" ")[0].toLowerCase()}@freedom-offers.com>`}
              signature={mySignature}
              snippets={snippets.filter((x) => x.kind === "email")}
            />
          )}

          <Card className="flex flex-wrap items-center gap-2 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📝 Contracts</span>
            <form action={draftContractAction}>
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="kind" value="cash" />
              <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700" title="Quick close, 30–60 days — no disclosures">💵 Draft cash offer</button>
            </form>
            <form action={draftContractAction}>
              <input type="hidden" name="oppId" value={opp.id} />
              <input type="hidden" name="kind" value="novation" />
              <button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700" title="Disclosures to list, 90–180 days">🏷 Draft novation offer</button>
            </form>
            <span className="text-[10px] text-slate-400">drafts in PandaDoc with seller, address &amp; price pre-filled — link lands on the timeline. Moving to an offer stage auto-drafts cash (tag the lead <b>novation</b> first to flip it).</span>
          </Card>

          {comms.email && c.email && (
            <Card className="p-0">
              <details className="group" open={!!enrolled}>
                <summary className="flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">📧 Sequences</span>
                  {enrolled && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">▶ running</span>}
                  <span className="ml-auto text-slate-300 transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3">
                  {enrolled ? (
                    <>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                        ▶ {sequences.find((x) => x.id === enrolled.seqId)?.name ?? enrolled.seqId} — step {enrolled.step + 1}, next {enrolled.nextYmd}
                      </span>
                      <span className="text-[10px] text-slate-400">auto-stops the moment they reply</span>
                      <form action={unenrollSequenceAction} className="ml-auto">
                        <input type="hidden" name="oppId" value={opp.id} />
                        <input type="hidden" name="contactId" value={c.id} />
                        <button className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">⏹ stop</button>
                      </form>
                    </>
                  ) : (
                    <form action={enrollSequenceAction} className="flex flex-1 flex-wrap items-center gap-1.5">
                      <input type="hidden" name="oppId" value={opp.id} />
                      <input type="hidden" name="contactId" value={c.id} />
                      <input type="hidden" name="email" value={c.email} />
                      <select name="seqId" className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold">
                        {sequences.map((sq) => <option key={sq.id} value={sq.id}>{sq.name} ({sq.steps.length} emails)</option>)}
                      </select>
                      <button className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-700">▶ Enroll</button>
                      <span className="text-[10px] text-slate-400">like Direct REI's drip — ours, free, stops on reply</span>
                    </form>
                  )}
                </div>
              </details>
            </Card>
          )}

          <div id="timeline" className="scroll-mt-4 pl-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">Timeline — everything, newest first</div>
          {events.map((e) => (
            <Card key={e.id} className={`flex gap-2.5 p-3 ${e.kind === "system" ? "opacity-70" : ""}`}>
              <span className="text-base">{KIND_EMOJI[e.kind] ?? "•"}</span>
              <div className="min-w-0 flex-1">
                <div className="whitespace-pre-line text-[13px] text-slate-800">{e.kind === "note" ? <><b>{e.actor}:</b> {stripHtml(e.body)}</> : <><b className="capitalize">{e.kind}</b> — {stripHtml(e.body)}</>}</div>
                <div className="mt-0.5 text-[10px] text-slate-400">{fmtAt(e.at)}{e.actor && e.kind !== "note" ? ` · ${e.actor}` : ""}{e.oppId && e.oppId !== opp.id ? " · other opportunity" : ""}</div>
              </div>
            </Card>
          ))}
          {events.length === 0 && <Card className="p-6 text-center text-xs text-slate-400">Nothing yet — the first note starts the story.</Card>}
        </div>
      </div>
    </div>
  );
}
