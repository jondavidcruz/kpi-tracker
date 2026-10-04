"use client";
// Widget-style dashboard (Jon 2026-10-04: "customize like an Apple product —
// remove stuff on my own, reorder, per person"). Every dashboard section is a
// widget: ⚙️ Customize turns on edit mode — eye toggles hide/show, drag
// reorders — and the layout saves per user. Sections stay mounted (CSS-hidden)
// so nothing refetches, and permission gates still decide what exists at all.
import { Children, isValidElement, useState, useTransition, type ReactNode } from "react";
import { saveDashLayoutAction } from "@/app/actions";

export type DashLayout = { hidden: string[]; order: string[] };

export default function DashWidgets({ layout, children }: { layout: DashLayout; children: ReactNode }) {
  const kids = Children.toArray(children).filter(isValidElement) as Array<React.ReactElement<{ id: string; label: string }>>;
  const [hidden, setHidden] = useState<Set<string>>(new Set(layout.hidden));
  const [order, setOrder] = useState<string[]>(layout.order);
  const [edit, setEdit] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pos = new Map(order.map((k, i) => [k, i]));
  const sorted = [...kids].sort((a, b) => (pos.get(a.props.id) ?? 999) - (pos.get(b.props.id) ?? 999));

  const persist = (h: Set<string>, o: string[]) => {
    const fd = new FormData();
    fd.set("hidden", JSON.stringify([...h]));
    fd.set("order", JSON.stringify(o));
    start(async () => { await saveDashLayoutAction(fd); });
  };
  const toggle = (id: string) => {
    const h = new Set(hidden);
    if (h.has(id)) h.delete(id); else h.add(id);
    setHidden(h);
    persist(h, order);
  };
  const dropOn = (target: string) => {
    if (!drag || drag === target) return;
    const cur = sorted.map((k) => k.props.id);
    const next = cur.filter((x) => x !== drag);
    next.splice(next.indexOf(target), 0, drag);
    setOrder(next);
    persist(hidden, next);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-end gap-2">
        {edit && <span className="text-[11px] text-slate-400">👁 show/hide · ⠿ drag to reorder · saves instantly, just for you{pending ? " · saving…" : ""}</span>}
        <button
          type="button"
          onClick={() => setEdit((v) => !v)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${edit ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
        >
          {edit ? "✓ Done" : "⚙️ Customize"}
        </button>
      </div>
      {sorted.map((kid) => {
        const id = kid.props.id;
        const isHidden = hidden.has(id);
        if (!edit && isHidden) return <div key={id} className="hidden">{kid}</div>;
        if (!edit) return <div key={id}>{kid}</div>;
        return (
          <div
            key={id}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(id); } }}
            onDrop={(e) => { e.preventDefault(); dropOn(id); setOver(null); }}
            className={`rounded-2xl ring-2 transition ${over === id && drag && drag !== id ? "ring-indigo-400" : "ring-slate-200"} ${isHidden ? "opacity-40" : ""}`}
          >
            <div
              draggable
              onDragStart={() => setDrag(id)}
              onDragEnd={() => { setDrag(null); setOver(null); }}
              className="flex cursor-grab items-center gap-2 rounded-t-2xl bg-slate-100 px-3 py-1.5 active:cursor-grabbing"
            >
              <span className="text-slate-400">⠿</span>
              <span className="text-xs font-bold text-slate-600">{kid.props.label}</span>
              <button type="button" onClick={() => toggle(id)} className="ml-auto rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                {isHidden ? "🙈 hidden — tap to show" : "👁 shown — tap to hide"}
              </button>
            </div>
            <div className={`p-2 ${isHidden ? "max-h-24 overflow-hidden" : ""}`}>{kid}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Marker wrapper — gives each dashboard section an id + label for the board. */
export function DashSection({ children }: { id: string; label: string; children: ReactNode }) {
  return <>{children}</>;
}
