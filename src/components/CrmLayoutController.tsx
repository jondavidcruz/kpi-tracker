"use client";
// 🧩 Contact-page layout customizer (Jon 2026-10-26: "let me move + hide these widgets myself").
// Each customizable panel is tagged data-widget="<id>". This reads the user's saved order +
// hidden set and applies them with CSS `order` / `display` — no server JSX restructuring, so
// it's safe on this big page. The ⚙ Customize overlay reorders (↑/↓) + toggles visibility per
// column and saves to the user's login (debounced). Reorder is within a column (flex `order`).
import { useEffect, useRef, useState } from "react";
import { saveCrmLayoutAction } from "@/app/crm/actions";
import { CRM_WIDGETS, type CrmLayout } from "@/lib/crm-layout";

export default function CrmLayoutController({ initial }: { initial: CrmLayout }) {
  // effective order = saved order first, then any widgets not yet in it (new ones) in default order
  const defaultOrder = CRM_WIDGETS.map((w) => w.id);
  const seed = [...initial.order.filter((id) => defaultOrder.includes(id)), ...defaultOrder.filter((id) => !initial.order.includes(id))];
  const [order, setOrder] = useState<string[]>(seed);
  const [hidden, setHidden] = useState<string[]>(initial.hidden.filter((id) => defaultOrder.includes(id)));
  const [open, setOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // apply to the DOM whenever order/hidden change
  useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-widget]").forEach((el) => {
      const id = el.getAttribute("data-widget") || "";
      const idx = order.indexOf(id);
      el.style.order = idx >= 0 ? String(idx) : "999";
      el.style.display = hidden.includes(id) ? "none" : "";
    });
  }, [order, hidden]);

  const persist = (nextOrder: string[], nextHidden: string[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("layout", JSON.stringify({ order: nextOrder, hidden: nextHidden }));
      void saveCrmLayoutAction(fd);
    }, 500);
  };
  // 🖱 Drag-to-reorder (Jon 2026-10-26: "make it drag-and-drop, not clicky"): drop the dragged
  // widget just before the target. Only within the same column (left stays left, right right).
  const dropBefore = (targetId: string) => {
    const id = dragId;
    setDragId(null); setOverId(null);
    if (!id || id === targetId) return;
    const colOf = (x: string) => CRM_WIDGETS.find((w) => w.id === x)?.column;
    if (colOf(id) !== colOf(targetId)) return; // don't cross columns
    setOrder((prev) => {
      const without = prev.filter((x) => x !== id);
      const at = without.indexOf(targetId);
      const next = [...without.slice(0, at), id, ...without.slice(at)];
      persist(next, hidden);
      return next;
    });
  };
  const toggleHide = (id: string) => {
    setHidden((prev) => { const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]; persist(order, next); return next; });
  };
  const reset = () => { setOrder(defaultOrder); setHidden([]); persist(defaultOrder, []); };

  const colList = (col: "left" | "right") => order.filter((id) => CRM_WIDGETS.find((w) => w.id === id)?.column === col);
  const labelOf = (id: string) => CRM_WIDGETS.find((w) => w.id === id)?.label ?? id;

  return (
    <>
      <button onClick={() => setOpen(true)} title="Customize this page — reorder & hide widgets (saved to your login)"
        className="fixed bottom-20 right-4 z-40 rounded-full bg-brand-navy px-3.5 py-2 text-xs font-bold text-white shadow-lg ring-2 ring-white/70 hover:opacity-90">
        ⚙ Customize
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/20 p-4" onClick={() => setOpen(false)}>
          <div className="mt-16 max-h-[80vh] w-80 overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-extrabold text-slate-800">⚙ Customize layout</span>
              <button onClick={() => setOpen(false)} className="ml-auto text-slate-300 hover:text-slate-500">✕</button>
            </div>
            <p className="mb-3 text-[11px] text-slate-400">Drag ⠿ to reorder, and hide what you don&apos;t use. Saved to your login, just for you.</p>
            {(["left", "right"] as const).map((col) => (
              <div key={col} className="mb-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{col} column</div>
                <div className="space-y-1">
                  {colList(col).map((id) => {
                    const isHidden = hidden.includes(id);
                    const isDragging = dragId === id;
                    const isOver = overId === id && dragId !== id;
                    return (
                      <div key={id}
                        draggable
                        onDragStart={() => setDragId(id)}
                        onDragEnd={() => { setDragId(null); setOverId(null); }}
                        onDragOver={(e) => { e.preventDefault(); if (overId !== id) setOverId(id); }}
                        onDrop={(e) => { e.preventDefault(); dropBefore(id); }}
                        className={`flex cursor-grab items-center gap-2 rounded-lg px-2 py-2 text-[12px] ring-1 transition active:cursor-grabbing ${isDragging ? "opacity-40" : ""} ${isOver ? "ring-2 ring-brand-navy" : isHidden ? "bg-slate-50 text-slate-400 ring-slate-100" : "bg-white text-slate-700 ring-slate-200"}`}>
                        <span className="select-none text-slate-300" title="Drag to reorder">⠿</span>
                        <span className={`min-w-0 flex-1 truncate ${isHidden ? "line-through" : ""}`}>{labelOf(id)}</span>
                        <button onClick={() => toggleHide(id)} title={isHidden ? "Show" : "Hide"} className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${isHidden ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                          {isHidden ? "Show" : "Hide"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <button onClick={reset} className="mt-1 w-full rounded-lg bg-slate-100 py-1.5 text-[11px] font-bold text-slate-500 hover:bg-slate-200">↺ Reset to default</button>
          </div>
        </div>
      )}
    </>
  );
}
