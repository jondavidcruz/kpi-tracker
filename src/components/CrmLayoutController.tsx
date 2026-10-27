"use client";
// 🧩 Contact-page DASHBOARD BUILDER (Jon 2026-10-26: "let me drag the real widget into the
// left/center/right section — not a little popup"). Each panel is tagged data-widget; the three
// columns are tagged data-col. This reads the user's saved layout (per-widget column + order +
// hidden) and arranges the real panels to match — by MOVING their DOM nodes between the columns.
//
// SAFETY: the default layout is a NO-OP — if a user hasn't customized, no node is moved at all,
// so the page is byte-identical to before. All DOM work is wrapped in try/catch, and the drag
// logic only runs while the user is explicitly in "Edit layout" mode. So the blast radius is
// contained to a user who is actively dragging, in their own session, and is reversible (Reset).
import { useEffect, useRef, useState } from "react";
import { saveCrmLayoutAction } from "@/app/crm/actions";
import { CRM_WIDGETS, type CrmLayout, type ColId } from "@/lib/crm-layout";

const COLS: ColId[] = ["left", "center", "right"];

export default function CrmLayoutController({ initial }: { initial: CrmLayout }) {
  const defaultOrder = CRM_WIDGETS.map((w) => w.id);
  const defaultCol = (id: string): ColId => (CRM_WIDGETS.find((w) => w.id === id)?.column as ColId) ?? "left";
  const seed = [...initial.order.filter((id) => defaultOrder.includes(id)), ...defaultOrder.filter((id) => !initial.order.includes(id))];

  const [order, setOrder] = useState<string[]>(seed);
  const [hidden, setHidden] = useState<string[]>(initial.hidden.filter((id) => defaultOrder.includes(id)));
  const [cols, setCols] = useState<Record<string, ColId>>(initial.cols ?? {});
  const [editing, setEditing] = useState(false);

  // refs so the (once-attached) drag listeners always see the latest state
  const sOrder = useRef(order); sOrder.current = order;
  const sHidden = useRef(hidden); sHidden.current = hidden;
  const sCols = useRef(cols); sCols.current = cols;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effCol = (id: string): ColId => (cols[id] as ColId) || defaultCol(id);

  // ── arrange the real DOM to match the layout (no-op when nothing is customized) ──
  const apply = () => {
    try {
      const present = (id: string) => document.querySelector<HTMLElement>(`[data-widget="${CSS.escape(id)}"]`);
      for (const col of COLS) {
        const container = document.querySelector<HTMLElement>(`[data-col="${col}"]`);
        if (!container) continue;
        const desired = sOrder.current.filter((id) => ((sCols.current[id] as ColId) || defaultCol(id)) === col && present(id));
        const current = Array.from(container.children).filter((c) => c instanceof HTMLElement && c.hasAttribute("data-widget")).map((c) => (c as HTMLElement).getAttribute("data-widget") || "");
        // only touch the DOM if the arrangement actually differs (keeps default a true no-op)
        const needs = desired.join("|") !== current.join("|") || desired.some((id) => present(id)?.parentElement !== container);
        if (needs) for (const id of desired) { const n = present(id); if (n) container.appendChild(n); }
      }
      for (const w of CRM_WIDGETS) { const n = present(w.id); if (n) n.style.display = sHidden.current.includes(w.id) ? "none" : ""; }
    } catch { /* leave the server-rendered layout in place */ }
  };
  useEffect(() => { apply(); }, [order, hidden, cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const fd = new FormData();
      fd.set("layout", JSON.stringify({ order: sOrder.current, hidden: sHidden.current, cols: sCols.current }));
      void saveCrmLayoutAction(fd);
    }, 500);
  };

  // place `id` into `col`, just before `beforeId` (or at the end of that column)
  const placeBefore = (id: string, col: ColId, beforeId: string | null) => {
    if (!id) return;
    setCols((pc) => { const nc = { ...pc }; if (col === defaultCol(id)) delete nc[id]; else nc[id] = col; sCols.current = nc; return nc; });
    setOrder((prev) => {
      const without = prev.filter((x) => x !== id);
      let at = without.length;
      if (beforeId && beforeId !== id) { const i = without.indexOf(beforeId); if (i >= 0) at = i; }
      const next = [...without.slice(0, at), id, ...without.slice(at)];
      sOrder.current = next; return next;
    });
    persist();
  };
  const toggleHide = (id: string) => setHidden((prev) => { const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]; sHidden.current = next; persist(); return next; });
  const reset = () => { setOrder(defaultOrder); setHidden([]); setCols({}); sOrder.current = defaultOrder; sHidden.current = []; sCols.current = {}; persist(); };

  // ── edit mode: drag the real panels between columns ──
  useEffect(() => {
    if (!editing) return;
    const widgets = Array.from(document.querySelectorAll<HTMLElement>("[data-widget]"));
    widgets.forEach((w) => { w.setAttribute("draggable", "true"); w.classList.add("fo-editw"); });
    const colEls = Array.from(document.querySelectorAll<HTMLElement>("[data-col]"));
    let dragId = "";
    const clearOver = () => { colEls.forEach((c) => c.classList.remove("fo-over")); widgets.forEach((w) => w.classList.remove("fo-overw")); };
    const onStart = (e: DragEvent) => {
      const w = (e.target as HTMLElement)?.closest?.("[data-widget]") as HTMLElement | null;
      if (!w) return; dragId = w.getAttribute("data-widget") || ""; try { e.dataTransfer?.setData("text/plain", dragId); } catch { /* ok */ } w.classList.add("fo-dragging");
    };
    const onOver = (e: DragEvent) => {
      if (!dragId) return; e.preventDefault();
      clearOver();
      const col = (e.target as HTMLElement)?.closest?.("[data-col]") as HTMLElement | null;
      if (col) col.classList.add("fo-over");
      const overW = (e.target as HTMLElement)?.closest?.("[data-widget]") as HTMLElement | null;
      if (overW && overW.getAttribute("data-widget") !== dragId) overW.classList.add("fo-overw");
    };
    const onDrop = (e: DragEvent) => {
      if (!dragId) return; e.preventDefault();
      const col = ((e.target as HTMLElement)?.closest?.("[data-col]") as HTMLElement | null)?.getAttribute("data-col") as ColId | null;
      const overW = (e.target as HTMLElement)?.closest?.("[data-widget]") as HTMLElement | null;
      const beforeId = overW && overW.getAttribute("data-widget") !== dragId ? overW.getAttribute("data-widget") : null;
      if (col) placeBefore(dragId, col, beforeId);
      clearOver();
    };
    const onEnd = () => { clearOver(); widgets.forEach((w) => w.classList.remove("fo-dragging")); dragId = ""; };
    document.addEventListener("dragstart", onStart);
    document.addEventListener("dragover", onOver);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragend", onEnd);
    return () => {
      widgets.forEach((w) => { w.removeAttribute("draggable"); w.classList.remove("fo-editw", "fo-dragging", "fo-overw"); });
      colEls.forEach((c) => c.classList.remove("fo-over"));
      document.removeEventListener("dragstart", onStart);
      document.removeEventListener("dragover", onOver);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragend", onEnd);
    };
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        .fo-editw{outline:2px dashed #94a3b8;outline-offset:3px;cursor:grab;border-radius:14px}
        .fo-editw:active{cursor:grabbing}
        .fo-dragging{opacity:.4}
        .fo-overw{outline:2px solid #0b1f3a !important}
        [data-col].fo-over{background:rgba(11,31,58,.05);border-radius:16px;outline:2px dashed #0b1f3a;outline-offset:6px}
      `}</style>

      {!editing ? (
        <button onClick={() => setEditing(true)} title="Customize this page — drag panels between the left / center / right sections (saved to your login)"
          className="fixed bottom-20 right-4 z-40 rounded-full bg-brand-navy px-3.5 py-2 text-xs font-bold text-white shadow-lg ring-2 ring-white/70 hover:opacity-90">
          ⚙ Customize
        </button>
      ) : (
        <>
          {/* dimmed hint bar + controls while editing */}
          <div className="fixed inset-x-0 top-0 z-40 flex flex-wrap items-center gap-2 bg-brand-navy px-4 py-2 text-xs font-bold text-white shadow-lg">
            <span>✥ Editing layout — drag any panel into the left, center or right section.</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={reset} className="rounded-lg bg-white/15 px-2.5 py-1 font-bold hover:bg-white/25">↺ Reset</button>
              <button onClick={() => setEditing(false)} className="rounded-lg bg-white px-3 py-1 font-extrabold text-brand-navy hover:bg-slate-100">✓ Done</button>
            </div>
          </div>
          {/* hidden-panels tray (so you can bring one back) */}
          {hidden.length > 0 && (
            <div className="fixed bottom-4 left-4 z-40 max-w-xs rounded-xl bg-white p-2 text-[11px] shadow-xl ring-1 ring-slate-200">
              <div className="mb-1 font-bold text-slate-500">Hidden — tap to show</div>
              <div className="flex flex-wrap gap-1">
                {hidden.map((id) => (
                  <button key={id} onClick={() => toggleHide(id)} className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700">
                    {CRM_WIDGETS.find((w) => w.id === id)?.label ?? id}
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* a tiny hide button floats on each widget via this delegated overlay button */}
          <HideButtons widgets={CRM_WIDGETS.filter((w) => !hidden.includes(w.id)).map((w) => w.id)} onHide={toggleHide} />
        </>
      )}
    </>
  );
}

// Renders a small "🙈 hide" control anchored to each visible widget while editing. Uses fixed
// positioning updated from each widget's rect so we never mutate the widgets' own DOM.
function HideButtons({ widgets, onHide }: { widgets: string[]; onHide: (id: string) => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    const tick = () => force((n) => n + 1);
    const id = setInterval(tick, 500);
    window.addEventListener("scroll", tick, true);
    window.addEventListener("resize", tick);
    return () => { clearInterval(id); window.removeEventListener("scroll", tick, true); window.removeEventListener("resize", tick); };
  }, []);
  return (
    <>
      {widgets.map((wid) => {
        const el = typeof document !== "undefined" ? document.querySelector<HTMLElement>(`[data-widget="${CSS.escape(wid)}"]`) : null;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.bottom < 60) return null;
        return (
          <button key={wid} onClick={() => onHide(wid)} title="Hide this panel"
            style={{ position: "fixed", top: Math.max(56, r.top + 4), left: r.right - 30, zIndex: 41 }}
            className="rounded-full bg-white px-1.5 py-0.5 text-[11px] shadow ring-1 ring-slate-300 hover:bg-red-50">🙈</button>
        );
      })}
    </>
  );
}
