"use client";
// GHL-style quick view: click a card → this drawer slides in over the board.
// Peek the lead, change stage, drop a note, call — then ✕ and you're right
// back on the pipeline. "Open full" goes to the complete page.
import { useEffect, useState, useTransition } from "react";
import { setOppStageAction, addCrmNoteAction } from "@/app/crm/actions";
import { KIND_EMOJI } from "@/lib/crm-shared";

type Payload = {
  id: string; title: string; stage: string; pipeline: string; assignedTo: string; tags: string;
  nextFollowUp: string; value: number | null; askPrice: number | null;
  contact: { id: string; name: string; phone: string; altPhone: string; email: string; pinnedNote: string };
  tasks: Array<{ id: string; title: string; due: string }>;
  events: Array<{ kind: string; body: string; actor: string; at: string }>;
};

export default function CrmQuickView({ stages }: { stages: Array<{ key: string; label: string }> }) {
  const [oppId, setOppId] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [note, setNote] = useState("");
  const [, start] = useTransition();

  useEffect(() => {
    const h = (e: Event) => { const id = (e as CustomEvent).detail?.id as string; if (id) { setOppId(id); setData(null); } };
    window.addEventListener("fo-quickview", h);
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOppId(null); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("fo-quickview", h); window.removeEventListener("keydown", esc); };
  }, []);

  useEffect(() => {
    if (!oppId) return;
    fetch(`/api/crm/opp/${oppId}`).then(async (r) => { if (r.ok) setData(await r.json()); });
  }, [oppId]);

  if (!oppId) return null;
  const d = data;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px]" onClick={() => setOppId(null)} />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl">
        {!d ? (
          <div className="p-10 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <>
            <div className="sticky top-0 flex items-start gap-3 border-b border-slate-100 bg-white px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="text-lg font-extrabold tracking-tight text-slate-900">{d.contact.name}</div>
                <div className="truncate text-xs text-slate-500">{d.title}</div>
              </div>
              <a href={`/crm/${d.id}`} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200">Open full ↗</a>
              <button onClick={() => setOppId(null)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {d.contact.pinnedNote && <div className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">📌 {d.contact.pinnedNote}</div>}

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={d.stage}
                  onChange={(e) => {
                    const stage = e.target.value;
                    setData({ ...d, stage });
                    const fd = new FormData(); fd.set("id", d.id); fd.set("stage", stage);
                    start(async () => { await setOppStageAction(fd); });
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold"
                >
                  {stages.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
                {d.assignedTo && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">👤 {d.assignedTo.split(" ")[0]}</span>}
                {d.nextFollowUp && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700">📞 {d.nextFollowUp}</span>}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {d.contact.phone && (
                  <button onClick={() => window.dispatchEvent(new CustomEvent("fo-call", { detail: { phone: d.contact.phone, name: d.contact.name, oppId: d.id, contactId: d.contact.id } }))} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">📞 Call</button>
                )}
                <span className="self-center text-xs text-slate-500">{[d.contact.phone, d.contact.altPhone].filter(Boolean).join(" · ")}</span>
              </div>

              <form
                action={(fd) => { fd.set("oppId", d.id); fd.set("contactId", d.contact.id); start(async () => { await addCrmNoteAction(fd); setNote(""); const r = await fetch(`/api/crm/opp/${d.id}`); if (r.ok) setData(await r.json()); }); }}
                className="flex gap-1.5"
              >
                <input name="body" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quick note…" required className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
                <button className="rounded-xl bg-brand-navy px-3 py-2 text-xs font-bold text-white">📝</button>
              </form>

              {d.tasks.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Open tasks</div>
                  {d.tasks.map((t) => <div key={t.id} className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-100">⏰ {t.title}{t.due ? ` · ${t.due}` : ""}</div>)}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Latest activity</div>
                {d.events.map((e, i) => (
                  <div key={i} className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700 ring-1 ring-slate-100">
                    <span className="mr-1">{KIND_EMOJI[e.kind] ?? "•"}</span>
                    <span className="whitespace-pre-line">{e.body}</span>
                    <span className="ml-1 text-[9px] text-slate-400">{new Date(e.at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
