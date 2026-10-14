"use client";
// 🗂 Deal Board — freeform dispositions whiteboard (Jon 2026-10-14). Draw with
// the pen, drop text anywhere and type with no limit, pull a seller's parcels
// in pre-filled, and watch the running total so you can price each parcel above
// what the seller wants and never lose money. Autosaves per board.
import { useCallback, useEffect, useRef, useState } from "react";
import { saveDealBoardAction, pullSellerParcelsAction, type DealBoard, type BoardNote, type BoardStroke } from "@/app/crm/dealboard/actions";

const COLORS = ["#fde047", "#34d399", "#60a5fa", "#f472b6", "#fb923c", "#ffffff", "#f87171"];
const BOARD_W = 2600, BOARD_H = 1700;
type Tool = "select" | "pen" | "text" | "erase";

export default function DealBoard({ board }: { board: DealBoard }) {
  const [notes, setNotes] = useState<BoardNote[]>(board.notes ?? []);
  const [strokes, setStrokes] = useState<BoardStroke[]>(board.strokes ?? []);
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#fde047");
  const [saved, setSaved] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<BoardStroke | null>(null);
  const dragId = useRef<string | null>(null);
  const dragOff = useRef({ x: 0, y: 0 });
  const [, force] = useState(0);

  // debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback((nextNotes: BoardNote[], nextStrokes: BoardStroke[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved("saving…");
    saveTimer.current = setTimeout(async () => {
      const fd = new FormData();
      fd.set("id", board.id);
      fd.set("payload", JSON.stringify({ name: board.name, notes: nextNotes, strokes: nextStrokes }));
      await saveDealBoardAction(fd);
      setSaved("✓ saved");
      setTimeout(() => setSaved(""), 1500);
    }, 900);
  }, [board.id, board.name]);

  useEffect(() => { queueSave(notes, strokes); }, [notes, strokes, queueSave]);

  const ptIn = (e: React.PointerEvent) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left + wrapRef.current!.scrollLeft, y: e.clientY - r.top + wrapRef.current!.scrollTop };
  };

  // ── canvas pointer handlers ──
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-note]")) return; // note handles its own
    const p = ptIn(e);
    if (tool === "pen") { drawing.current = { color, width: 3, pts: [p.x, p.y] }; (e.target as Element).setPointerCapture?.(e.pointerId); }
    else if (tool === "text") { const id = `n_${Math.random().toString(36).slice(2, 8)}`; const n = { id, x: p.x, y: p.y, text: "", color }; setNotes((ns) => [...ns, n]); setTimeout(() => document.getElementById(`note-${id}`)?.focus(), 30); setTool("select"); }
    else if (tool === "erase") { // erase nearest stroke
      setStrokes((ss) => ss.filter((s) => !nearStroke(s, p)));
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (drawing.current) { const p = ptIn(e); drawing.current.pts.push(p.x, p.y); force((n) => n + 1); return; }
    if (dragId.current) { const p = ptIn(e); setNotes((ns) => ns.map((n) => n.id === dragId.current ? { ...n, x: p.x - dragOff.current.x, y: p.y - dragOff.current.y } : n)); }
  };
  const onUp = () => { if (drawing.current) { const d = drawing.current; drawing.current = null; if (d.pts.length > 2) setStrokes((ss) => [...ss, d]); } dragId.current = null; };

  const noteDown = (e: React.PointerEvent, n: BoardNote) => {
    if (tool === "erase") { e.stopPropagation(); setNotes((ns) => ns.filter((x) => x.id !== n.id)); return; }
    if (tool !== "select") return;
    if ((e.target as HTMLElement).isContentEditable && document.activeElement === e.target) return;
    e.stopPropagation(); const p = ptIn(e); dragId.current = n.id; dragOff.current = { x: p.x - n.x, y: p.y - n.y };
  };

  const editNote = (id: string, text: string) => setNotes((ns) => ns.map((n) => n.id === id ? { ...n, text } : n));
  const delNote = (id: string) => setNotes((ns) => ns.filter((n) => n.id !== id));
  const colorNote = (id: string, c: string) => setNotes((ns) => ns.map((n) => n.id === id ? { ...n, color: c } : n));

  // ── pull a seller's parcels ──
  const [pullQ, setPullQ] = useState("");
  const [pulling, setPulling] = useState(false);
  const pull = async () => {
    if (!pullQ.trim()) return;
    setPulling(true);
    const res = await pullSellerParcelsAction(pullQ).catch(() => []);
    setPulling(false);
    if (!res.length) { setSaved("no seller found"); setTimeout(() => setSaved(""), 1500); return; }
    // drop a column per seller: header note + a note per parcel
    let x = (wrapRef.current?.scrollLeft ?? 0) + 40;
    const baseY = (wrapRef.current?.scrollTop ?? 0) + 60;
    const add: BoardNote[] = [];
    for (const s of res) {
      add.push({ id: `n_${Math.random().toString(36).slice(2, 8)}`, x, y: baseY, text: `👤 ${s.seller} — ${s.parcels.length} parcel${s.parcels.length > 1 ? "s" : ""}`, color: "#60a5fa", w: 240 });
      s.parcels.forEach((p, i) => add.push({ id: `n_${Math.random().toString(36).slice(2, 8)}`, x, y: baseY + 60 + i * 72, text: `📍 ${p.title}${p.apn ? `\nAPN ${p.apn}` : ""}\nwants: $${p.wants != null ? p.wants.toLocaleString() : "?"}\nour price: $`, color: "#fde047", w: 240 }));
      x += 270;
    }
    setNotes((ns) => [...ns, ...add]);
    setPullQ("");
  };

  // ── running total: sum every "$NNN" found in the notes ──
  const total = notes.reduce((sum, n) => {
    const m = (n.text.match(/\$\s?[\d,]+(?:\.\d+)?/g) ?? []).map((x) => Number(x.replace(/[^\d.]/g, ""))).filter((v) => !isNaN(v));
    return sum + m.reduce((a, b) => a + b, 0);
  }, 0);

  const curStroke = drawing.current;
  return (
    <div className="flex h-[calc(100vh-130px)] flex-col overflow-hidden rounded-2xl ring-1 ring-slate-200">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
        {([["select", "🖱 Move"], ["pen", "✏️ Pen"], ["text", "🔤 Text"], ["erase", "🧽 Erase"]] as [Tool, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTool(t)} className={`rounded-lg px-2.5 py-1.5 font-bold ${tool === t ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
        ))}
        <span className="mx-1 flex items-center gap-1">
          {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ background: c }} className={`h-6 w-6 rounded-full ring-2 ${color === c ? "ring-brand-navy" : "ring-slate-200"}`} />)}
        </span>
        <button onClick={() => { if (confirm("Clear this whole board?")) { setNotes([]); setStrokes([]); } }} className="rounded-lg bg-red-50 px-2.5 py-1.5 font-bold text-red-600 hover:bg-red-100">Clear</button>
        <span className="ml-auto flex items-center gap-2">
          <input value={pullQ} onChange={(e) => setPullQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pull()} placeholder="Pull a seller's parcels…" className="w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
          <button onClick={pull} disabled={pulling} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{pulling ? "…" : "🔗 Pull"}</button>
          <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-extrabold text-white">Σ ${Math.round(total).toLocaleString()}</span>
          <span className="w-16 text-[10px] text-slate-400">{saved}</span>
        </span>
      </div>
      {/* canvas */}
      <div ref={wrapRef} className="relative flex-1 overflow-auto bg-slate-800" style={{ cursor: tool === "pen" ? "crosshair" : tool === "text" ? "text" : "default" }}>
        <div className="relative" style={{ width: BOARD_W, height: BOARD_H, backgroundImage: "radial-gradient(circle, rgba(255,255,255,.08) 1px, transparent 1px)", backgroundSize: "28px 28px" }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
          <svg width={BOARD_W} height={BOARD_H} className="pointer-events-none absolute inset-0">
            {strokes.map((s, i) => <polyline key={i} points={flat(s.pts)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />)}
            {curStroke && <polyline points={flat(curStroke.pts)} fill="none" stroke={curStroke.color} strokeWidth={curStroke.width} strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          {notes.map((n) => (
            <div key={n.id} data-note id={`wrap-${n.id}`} onPointerDown={(e) => noteDown(e, n)}
              className="group/note absolute rounded-lg p-2 text-[13px] font-semibold leading-snug text-slate-900 shadow-lg"
              style={{ left: n.x, top: n.y, width: n.w ?? 190, background: n.color ?? "#fde047", cursor: tool === "select" ? "grab" : "default" }}>
              <div id={`note-${n.id}`} contentEditable suppressContentEditableWarning onBlur={(e) => editNote(n.id, e.currentTarget.innerText)}
                className="min-h-[18px] whitespace-pre-wrap break-words outline-none" style={{ cursor: "text" }}>{n.text}</div>
              <div className="absolute -top-2 right-1 hidden items-center gap-0.5 group-hover/note:flex">
                {COLORS.slice(0, 5).map((c) => <button key={c} onClick={() => colorNote(n.id, c)} style={{ background: c }} className="h-3 w-3 rounded-full ring-1 ring-black/20" />)}
                <button onClick={() => delNote(n.id)} className="ml-0.5 rounded bg-white px-1 text-[10px] font-bold text-red-600 ring-1 ring-slate-200">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function flat(pts: number[]): string { let s = ""; for (let i = 0; i < pts.length; i += 2) s += `${pts[i]},${pts[i + 1]} `; return s.trim(); }
function nearStroke(st: BoardStroke, p: { x: number; y: number }): boolean {
  for (let i = 0; i < st.pts.length; i += 2) { const dx = st.pts[i] - p.x, dy = st.pts[i + 1] - p.y; if (dx * dx + dy * dy < 240) return true; }
  return false;
}
