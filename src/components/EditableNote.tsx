"use client";
// ✎ Inline note editor (Jon 2026-10-13): edit a note you wrote, right in the
// timeline. Only the author (or a manager) gets the pencil; others see plain text.
import { useState } from "react";
import { editCrmNoteAction, deleteCrmNoteAction } from "@/app/crm/actions";

export default function EditableNote({ id, oppId, actor, body, canEdit }: { id: string; oppId: string; actor: string; body: string; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(body);

  if (editing) {
    return (
      <form action={editCrmNoteAction} onSubmit={() => setEditing(false)} className="space-y-1.5">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="oppId" value={oppId} />
        <textarea name="body" value={val} onChange={(e) => setVal(e.target.value)} rows={3} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-[13px]" autoFocus />
        <div className="flex gap-1.5">
          <button className="rounded-lg bg-brand-navy px-3 py-1 text-[11px] font-bold text-white hover:opacity-90">Save</button>
          <button type="button" onClick={() => { setVal(body); setEditing(false); }} className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-500">Cancel</button>
        </div>
      </form>
    );
  }
  return (
    <div className="group/note">
      <span className="whitespace-pre-line text-[13px] text-slate-800"><b>{actor}:</b> {body}</span>
      {canEdit && (
        <button onClick={() => setEditing(true)} title="Edit this note" className="ml-1.5 align-middle text-[10px] font-bold text-slate-300 opacity-0 transition group-hover/note:opacity-100 hover:text-indigo-600">✎ edit</button>
      )}
      {canEdit && (
        <form action={deleteCrmNoteAction} className="inline" onSubmit={(e) => { if (!confirm("Delete this note?")) e.preventDefault(); }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="oppId" value={oppId} />
          <button title="Delete this note" className="ml-1 align-middle text-[10px] font-bold text-slate-300 opacity-0 transition group-hover/note:opacity-100 hover:text-red-600">🗑</button>
        </form>
      )}
    </div>
  );
}
