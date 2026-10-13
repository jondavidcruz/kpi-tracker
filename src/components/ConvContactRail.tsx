"use client";
// 📇 Conversations right rail — now a FULL editor (Jon 2026-10-13).
// A random inbound number should never be lost: the rep can name the lead,
// fix the phone/email/owner, and add one or many parcels of land right here —
// the same power as the quick-note view, from the SMS viewpoint.
//
// • Name is split into First + Last on input but stored as ONE merged `name`
//   field, so the opportunity card still shows "First Last" unchanged.
// • Each parcel is its OWN opportunity (a seller with 10 lands = 10 cards),
//   with its own address, APN/parcel number, and its own notes.
import { useState } from "react";
import Link from "next/link";
import { saveConvContactAction, addPropertyAction, savePropertyAction, addPropertyNoteAction } from "@/app/crm/actions";

type Prop = { id: string; title: string; stage: string; pipeline: string; apn: string; createdAt: string };
type Contact = { id: string; name: string; phone: string; altPhone: string; email: string; address: string; assignedTo: string; pinnedNote: string; source: string; createdAt: string };

function fmtPhone(p: string) {
  return p.replace(/^\+1/, "").replace(/(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3");
}
// 🕒 how long the lead/parcel has been sitting — keep leads moving (Jon 2026-10-13)
function AgeChip({ iso }: { iso: string }) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  const cls = d >= 30 ? "bg-red-50 text-red-700 ring-red-100" : d >= 7 ? "bg-amber-50 text-amber-700 ring-amber-100" : "bg-emerald-50 text-emerald-700 ring-emerald-100";
  return <span title={`In the system ${d} day${d === 1 ? "" : "s"} — keep it moving`} className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>🕒 {d <= 0 ? "New today" : `${d}d in system`}</span>;
}
// Split a stored full name into first + last for the edit form. A placeholder
// name that is really just a phone number starts blank so the rep types fresh.
function splitName(name: string): { first: string; last: string } {
  const looksLikePhone = /^[\d()+\-.\s]+$/.test(name.trim());
  if (!name.trim() || looksLikePhone) return { first: "", last: "" };
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

const lbl = "text-[10px] font-bold uppercase tracking-wide text-slate-400";
const inp = "mt-0.5 block w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs text-slate-800";

export default function ConvContactRail({ contact, opps, owners, canEdit }: { contact: Contact; opps: Prop[]; owners: string[]; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const { first, last } = splitName(contact.name);
  const displayName = contact.name?.trim() || fmtPhone(contact.phone) || "Unknown";

  return (
    <div className="hidden w-80 shrink-0 overflow-y-auto border-l border-slate-100 bg-white p-4 lg:block">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Contact details</span>
        {canEdit && (
          <button onClick={() => setEditing((v) => !v)} className="rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">
            {editing ? "✕ Close" : "✎ Edit"}
          </button>
        )}
      </div>
      <div className="mb-3"><AgeChip iso={contact.createdAt} /></div>

      {/* ── CONTACT: read view ── */}
      {!editing && (
        <div className="space-y-2 text-sm">
          <div><div className={lbl}>Name</div><div className="font-semibold text-slate-800">{displayName}</div></div>
          {contact.phone && <div><div className={lbl}>Phone</div><div className="font-mono text-sm font-bold tracking-wide text-slate-800">{fmtPhone(contact.phone)}</div></div>}
          {contact.altPhone && <div><div className={lbl}>Phone 2</div><div className="text-slate-700">{fmtPhone(contact.altPhone)}</div></div>}
          {contact.email && <div><div className={lbl}>Email</div><div className="break-all text-slate-700">{contact.email}</div></div>}
          {contact.address && <div><div className={lbl}>Mailing address</div><div className="text-slate-700">{contact.address}</div></div>}
          <div><div className={lbl}>Owner</div><div className="text-slate-700">{contact.assignedTo || "Unassigned"}</div></div>
          {contact.source && <div><div className={lbl}>Source</div><div className="text-slate-700">{contact.source}</div></div>}
          {contact.pinnedNote && <div className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {contact.pinnedNote}</div>}
        </div>
      )}

      {/* ── CONTACT: edit view ── */}
      {editing && canEdit && (
        <form action={saveConvContactAction} onSubmit={() => setEditing(false)} className="space-y-2">
          <input type="hidden" name="id" value={contact.id} />
          <div className="flex gap-2">
            <label className="flex-1"><span className={lbl}>First name</span><input name="firstName" defaultValue={first} placeholder="First" className={inp} /></label>
            <label className="flex-1"><span className={lbl}>Last name</span><input name="lastName" defaultValue={last} placeholder="Last" className={inp} /></label>
          </div>
          <label className="block"><span className={lbl}>Phone</span><input name="phone" defaultValue={contact.phone} placeholder="909-395-6195" className={inp} /></label>
          <label className="block"><span className={lbl}>Phone 2</span><input name="altPhone" defaultValue={contact.altPhone} className={inp} /></label>
          <label className="block"><span className={lbl}>Email</span><input name="email" type="email" defaultValue={contact.email} className={inp} /></label>
          <label className="block"><span className={lbl}>Mailing address</span><input name="address" defaultValue={contact.address} placeholder="Where the owner gets mail" className={inp} /></label>
          <label className="block"><span className={lbl}>Owner</span>
            <select name="assignedTo" defaultValue={contact.assignedTo} className={inp}>
              <option value="">Unassigned</option>
              {owners.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
          <label className="block"><span className={lbl}>📌 Pinned note</span><input name="pinnedNote" defaultValue={contact.pinnedNote} placeholder="Always-visible summary" className={inp} /></label>
          <div className="flex gap-2 pt-1">
            <button className="flex-1 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700">Save contact</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
          </div>
        </form>
      )}

      {/* ── PROPERTIES / PARCELS ── one opportunity per parcel of land ── */}
      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Properties · {opps.length}</span>
        </div>
        {opps.length === 0 && (
          <div className="mb-2 rounded-lg bg-indigo-50 px-2.5 py-2 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-100">
            No property yet — add one below to put this lead in the pipeline so it isn&apos;t lost.
          </div>
        )}
        <div className="space-y-2.5">
          {opps.map((p) => (
            <div key={p.id} className="rounded-xl bg-slate-50 p-2.5 ring-1 ring-slate-100">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-bold text-slate-700">{p.pipeline || "War Room"} · {p.stage}</span>
                <Link href={`/crm/${p.id}`} className="shrink-0 rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200 hover:bg-slate-100">Open land ↗</Link>
              </div>
              <div className="mb-1.5"><AgeChip iso={p.createdAt} /></div>
              {canEdit ? (
                <form action={savePropertyAction} className="space-y-1.5">
                  <input type="hidden" name="id" value={p.id} />
                  <label className="block"><span className={lbl}>Property address</span><input name="address" defaultValue={p.title} className={inp} /></label>
                  <label className="block"><span className={lbl}>APN / Parcel #</span><input name="apn" defaultValue={p.apn} placeholder="123-456-789" className={inp} /></label>
                  <button className="w-full rounded-lg bg-slate-200 px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-300">Save parcel</button>
                </form>
              ) : (
                <div className="space-y-0.5 text-xs">
                  <div className="font-semibold text-slate-800">{p.title}</div>
                  {p.apn && <div className="text-slate-500">APN {p.apn}</div>}
                </div>
              )}
              {canEdit && (
                <form action={addPropertyNoteAction} className="mt-1.5 flex gap-1">
                  <input type="hidden" name="oppId" value={p.id} />
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input name="body" placeholder="Note for THIS parcel…" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px]" />
                  <button className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-200">+ note</button>
                </form>
              )}
            </div>
          ))}
        </div>

        {/* add another parcel */}
        {canEdit && (
          <details className="mt-2.5 rounded-xl bg-white p-0 ring-1 ring-slate-200">
            <summary className="cursor-pointer rounded-xl bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100">➕ Add another property / parcel</summary>
            <form action={addPropertyAction} className="space-y-1.5 p-2.5">
              <input type="hidden" name="contactId" value={contact.id} />
              <label className="block"><span className={lbl}>Property address</span><input name="address" placeholder="123 Land Rd, County, ST" className={inp} /></label>
              <label className="block"><span className={lbl}>APN / Parcel #</span><input name="apn" placeholder="123-456-789" className={inp} /></label>
              <label className="block"><span className={lbl}>First note (optional)</span><input name="note" placeholder="e.g. 5 acres, owner wants $40k" className={inp} /></label>
              <button className="w-full rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700">Add property</button>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}
