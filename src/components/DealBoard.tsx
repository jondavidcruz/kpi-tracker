"use client";
// 🗂 Deal Board — freeform dispositions whiteboard (Jon 2026-10-14). Draw with
// the pen, drop text anywhere and type with no limit, pull a seller's parcels
// in pre-filled, and watch the running total so you can price each parcel above
// what the seller wants and never lose money. Autosaves per board.
// Two views (Jon 2026-10-14): 🖊 Whiteboard (freeform) and 📊 Spreadsheet (an
// Excel-style grid of every parcel — seller, APN, what they want, our price,
// and the margin). Board background color is changeable (dark → light/white).
import { useCallback, useEffect, useRef, useState } from "react";
import { saveDealBoardAction, pullSellerParcelsAction, type DealBoard, type BoardNote, type BoardStroke } from "@/app/crm/dealboard/actions";

const COLORS = ["#fde047", "#34d399", "#60a5fa", "#f472b6", "#fb923c", "#ffffff", "#f87171"];
const BOARD_W = 2600, BOARD_H = 1700;
type Tool = "select" | "pen" | "text" | "erase";
type View = "board" | "sheet";

// Board background presets — dark ones keep white dots, light ones switch to
// faint dark dots so the grid + notes stay visible on a white/cream board.
const BGS: { id: string; name: string; bg: string; dot: string; dark: boolean }[] = [
  { id: "charcoal", name: "Charcoal", bg: "#1e293b", dot: "rgba(255,255,255,.08)", dark: true },
  { id: "slate", name: "Slate", bg: "#475569", dot: "rgba(255,255,255,.10)", dark: true },
  { id: "white", name: "White", bg: "#ffffff", dot: "rgba(0,0,0,.07)", dark: false },
  { id: "cream", name: "Cream", bg: "#faf7f0", dot: "rgba(0,0,0,.06)", dark: false },
  { id: "blue", name: "Soft blue", bg: "#eff6ff", dot: "rgba(0,0,0,.06)", dark: false },
  { id: "gray", name: "Light gray", bg: "#f1f5f9", dot: "rgba(0,0,0,.06)", dark: false },
];
const bgOf = (id?: string) => BGS.find((b) => b.id === id) ?? BGS[0];

export default function DealBoard({ board }: { board: DealBoard }) {
  const [notes, setNotes] = useState<BoardNote[]>(board.notes ?? []);
  const [strokes, setStrokes] = useState<BoardStroke[]>(board.strokes ?? []);
  const [bgId, setBgId] = useState(board.bg || "charcoal");
  const [tool, setTool] = useState<Tool>("select");
  const [view, setView] = useState<View>("board");
  const [color, setColor] = useState("#fde047");
  const [saved, setSaved] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<BoardStroke | null>(null);
  const dragId = useRef<string | null>(null);
  const dragOff = useRef({ x: 0, y: 0 });
  const [, force] = useState(0);
  const bg = bgOf(bgId);

  // debounced autosave
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSave = useCallback((nextNotes: BoardNote[], nextStrokes: BoardStroke[], nextBg: string) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaved("saving…");
    saveTimer.current = setTimeout(async () => {
      const fd = new FormData();
      fd.set("id", board.id);
      fd.set("payload", JSON.stringify({ name: board.name, notes: nextNotes, strokes: nextStrokes, bg: nextBg }));
      await saveDealBoardAction(fd);
      setSaved("✓ saved");
      setTimeout(() => setSaved(""), 1500);
    }, 900);
  }, [board.id, board.name]);

  useEffect(() => { queueSave(notes, strokes, bgId); }, [notes, strokes, bgId, queueSave]);

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

  // ── spreadsheet rows: walk notes in column order, inherit the seller from the
  // most recent 👤 header, and parse each parcel note into a grid row ──
  const rows = sheetRows(notes);
  const setOurPrice = (id: string, raw: string) => {
    const clean = raw.replace(/[^\d.]/g, "");
    setNotes((ns) => ns.map((n) => {
      if (n.id !== id) return n;
      const label = clean ? `$${Number(clean).toLocaleString()}` : "$";
      const text = /our price:/i.test(n.text)
        ? n.text.replace(/our price:\s*\$?[\d,]*(?:\.\d+)?/i, `our price: ${label}`)
        : `${n.text}\nour price: ${label}`;
      return { ...n, text };
    }));
  };
  const wantsTotal = rows.reduce((s, r) => s + (r.wants ?? 0), 0);
  const priceTotal = rows.reduce((s, r) => s + (r.price ?? 0), 0);
  const marginTotal = priceTotal - wantsTotal;

  const curStroke = drawing.current;
  return (
    <div className="flex h-[calc(100vh-130px)] flex-col overflow-hidden rounded-2xl ring-1 ring-slate-200">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 text-xs">
        {/* view switcher */}
        <span className="flex items-center overflow-hidden rounded-lg ring-1 ring-slate-200">
          {([["board", "🖊 Whiteboard"], ["sheet", "📊 Spreadsheet"]] as [View, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1.5 font-bold ${view === v ? "bg-brand-navy text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </span>
        {view === "board" && <>
          <span className="mx-0.5 h-5 w-px bg-slate-200" />
          {([["select", "🖱 Move"], ["pen", "✏️ Pen"], ["text", "🔤 Text"], ["erase", "🧽 Erase"]] as [Tool, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTool(t)} className={`rounded-lg px-2.5 py-1.5 font-bold ${tool === t ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{label}</button>
          ))}
          <span className="mx-1 flex items-center gap-1">
            {COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ background: c }} className={`h-6 w-6 rounded-full ring-2 ${color === c ? "ring-brand-navy" : "ring-slate-200"}`} />)}
          </span>
          {/* board background color */}
          <span className="ml-1 flex items-center gap-1 rounded-lg bg-slate-50 px-1.5 py-1 ring-1 ring-slate-200" title="Board background color">
            <span className="text-[10px] font-bold text-slate-500">🎨</span>
            {BGS.map((b) => <button key={b.id} onClick={() => setBgId(b.id)} title={b.name} style={{ background: b.bg }} className={`h-5 w-5 rounded ring-2 ${bgId === b.id ? "ring-brand-navy" : "ring-slate-300"}`} />)}
          </span>
          <button onClick={() => { if (confirm("Clear this whole board?")) { setNotes([]); setStrokes([]); } }} className="rounded-lg bg-red-50 px-2.5 py-1.5 font-bold text-red-600 hover:bg-red-100">Clear</button>
        </>}
        <span className="ml-auto flex items-center gap-2">
          <input value={pullQ} onChange={(e) => setPullQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pull()} placeholder="Pull a seller's parcels…" className="w-44 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
          <button onClick={pull} disabled={pulling} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{pulling ? "…" : "🔗 Pull"}</button>
          {view === "board"
            ? <span className="rounded-lg bg-slate-900 px-3 py-1.5 font-extrabold text-white" title="Rough tally of every $ on the board">Σ ${Math.round(total).toLocaleString()}</span>
            : <span className={`rounded-lg px-3 py-1.5 font-extrabold text-white ${marginTotal >= 0 ? "bg-emerald-600" : "bg-red-600"}`} title="Our price total − seller wants total">Margin ${Math.round(marginTotal).toLocaleString()}</span>}
          <span className="w-16 text-[10px] text-slate-400">{saved}</span>
        </span>
      </div>

      {view === "board" ? (
        /* ── whiteboard canvas ── */
        <div ref={wrapRef} className="relative flex-1 overflow-auto" style={{ background: bg.bg, cursor: tool === "pen" ? "crosshair" : tool === "text" ? "text" : "default" }}>
          <div className="relative" style={{ width: BOARD_W, height: BOARD_H, backgroundImage: `radial-gradient(circle, ${bg.dot} 1px, transparent 1px)`, backgroundSize: "28px 28px" }}
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
      ) : (
        /* ── spreadsheet view ── */
        <div className="flex-1 overflow-auto bg-white p-4">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">No parcels yet. Use <b>🔗 Pull</b> above to pull a seller&apos;s parcels, or add notes on the whiteboard shaped like <code className="rounded bg-slate-100 px-1">📍 address / wants: $ / our price: $</code> — they&apos;ll show up here as rows.</div>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-brand-navy text-left text-xs text-white">
                  <th className="rounded-l-lg px-3 py-2 font-bold">Seller</th>
                  <th className="px-3 py-2 font-bold">Parcel / Address</th>
                  <th className="px-3 py-2 font-bold">APN</th>
                  <th className="px-3 py-2 text-right font-bold">Seller wants</th>
                  <th className="px-3 py-2 text-right font-bold">Our price</th>
                  <th className="rounded-r-lg px-3 py-2 text-right font-bold">Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const margin = (r.price ?? 0) - (r.wants ?? 0);
                  const hasPrice = r.price != null;
                  return (
                    <tr key={r.id} className={i % 2 ? "bg-slate-50" : "bg-white"}>
                      <td className="border-b border-slate-100 px-3 py-2 font-semibold text-slate-700">{r.seller || "—"}</td>
                      <td className="border-b border-slate-100 px-3 py-2 text-slate-900">{r.parcel || "—"}</td>
                      <td className="border-b border-slate-100 px-3 py-2 font-mono text-[12px] text-slate-500">{r.apn || "—"}</td>
                      <td className="border-b border-slate-100 px-3 py-2 text-right tabular-nums text-slate-700">{r.wants != null ? `$${r.wants.toLocaleString()}` : "—"}</td>
                      <td className="border-b border-slate-100 px-2 py-1.5 text-right">
                        <span className="inline-flex items-center rounded-md ring-1 ring-slate-200 focus-within:ring-brand-navy">
                          <span className="pl-2 text-slate-400">$</span>
                          <input inputMode="decimal" defaultValue={r.price != null ? r.price.toLocaleString() : ""} onBlur={(e) => setOurPrice(r.id, e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                            className="w-28 bg-transparent px-1 py-1 text-right tabular-nums outline-none" placeholder="set" />
                        </span>
                      </td>
                      <td className={`border-b border-slate-100 px-3 py-2 text-right font-bold tabular-nums ${!hasPrice ? "text-slate-300" : margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {hasPrice ? `${margin >= 0 ? "+" : "−"}$${Math.abs(margin).toLocaleString()}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 text-sm font-extrabold">
                  <td className="px-3 py-2.5 text-slate-500" colSpan={3}>{rows.length} parcel{rows.length > 1 ? "s" : ""}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">${wantsTotal.toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">${priceTotal.toLocaleString()}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${marginTotal >= 0 ? "text-emerald-600" : "text-red-600"}`}>{marginTotal >= 0 ? "+" : "−"}${Math.abs(marginTotal).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          )}
          <p className="mt-3 text-[11px] text-slate-400">Edit <b>Our price</b> inline — it writes straight back to the matching note on the whiteboard, and the margin updates live. Keep every parcel&apos;s price above what the seller wants so no deal loses money.</p>
        </div>
      )}
    </div>
  );
}

type SheetRow = { id: string; seller: string; parcel: string; apn: string; wants: number | null; price: number | null };
// Walk notes in column order (x, then y). A 👤 note sets the current seller;
// every parcel note after it inherits that seller until the next header.
function sheetRows(notes: BoardNote[]): SheetRow[] {
  const sorted = [...notes].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const rows: SheetRow[] = [];
  let seller = "";
  for (const n of sorted) {
    const t = (n.text ?? "").trim();
    if (!t) continue;
    if (t.startsWith("👤")) { seller = t.replace(/^👤\s*/, "").split(/\s+—|\n/)[0].trim(); continue; }
    const isParcel = t.startsWith("📍") || /wants:/i.test(t) || /our price:/i.test(t) || /APN/i.test(t);
    if (!isParcel) continue;
    const lines = t.split("\n");
    const parcel = (lines[0] || "").replace(/^📍\s*/, "").trim();
    const apn = (t.match(/APN\s*[:#]?\s*(.+)/i)?.[1] ?? "").split("\n")[0].trim();
    rows.push({ id: n.id, seller, parcel, apn, wants: parseMoney(t, /wants:\s*\$?([\d,]+(?:\.\d+)?)/i), price: parseMoney(t, /our price:\s*\$?([\d,]+(?:\.\d+)?)/i) });
  }
  return rows;
}
function parseMoney(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const v = Number(m[1].replace(/[^\d.]/g, ""));
  return isNaN(v) ? null : v;
}

function flat(pts: number[]): string { let s = ""; for (let i = 0; i < pts.length; i += 2) s += `${pts[i]},${pts[i + 1]} `; return s.trim(); }
function nearStroke(st: BoardStroke, p: { x: number; y: number }): boolean {
  for (let i = 0; i < st.pts.length; i += 2) { const dx = st.pts[i] - p.x, dy = st.pts[i + 1] - p.y; if (dx * dx + dy * dy < 240) return true; }
  return false;
}
