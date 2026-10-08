"use client";
// 🗺 Interactive architectural blueprint of the War Room (Jon 2026-10-08):
// the whole app drawn as a floor plan — wings = sections, rooms = pages.
// Click a room → the side panel explains it; "Follow a deal" numbers the
// path a deal takes through the building.
import { useMemo, useState } from "react";

export type BpRoom = { path: string; name: string; what: string; data: string };
export type BpSection = { title: string; emoji: string; pitch: string; rooms: BpRoom[] };

type Wing = { x: number; y: number; w: number; h: number; cols: number };
const WINGS: Record<string, Wing> = {
  "Command Center":     { x: 30,  y: 46,  w: 350, h: 290, cols: 2 },
  "Acquisitions":       { x: 396, y: 46,  w: 490, h: 290, cols: 4 },
  "Dispositions":       { x: 902, y: 46,  w: 308, h: 290, cols: 2 },
  "Business Heartbeat": { x: 30,  y: 352, w: 280, h: 252, cols: 2 },
  "Team OS":            { x: 326, y: 352, w: 440, h: 252, cols: 3 },
  "Owner's Suite":      { x: 782, y: 352, w: 428, h: 252, cols: 3 },
};

// the path a deal walks through the building
const FLOW: Array<{ path: string; step: string }> = [
  { path: "/crm", step: "Lead arrives" },
  { path: "— softphone", step: "Call the seller" },
  { path: "/underwriting", step: "Price it (MAO)" },
  { path: "/deals", step: "Under contract → dispo" },
  { path: "/marketing", step: "Cascade to buyers" },
  { path: "/closing", step: "Escrow → close" },
  { path: "/expenses", step: "Profit lands on the P&L" },
];

export default function BlueprintMap({ sections }: { sections: BpSection[] }) {
  const [sel, setSel] = useState<{ room: BpRoom; section: BpSection } | null>(null);
  const [flowMode, setFlowMode] = useState(false);
  const flowIdx = useMemo(() => new Map(FLOW.map((f, i) => [f.path, i + 1])), []);

  const layout = useMemo(() => {
    const out: Array<{ room: BpRoom; section: BpSection; x: number; y: number; w: number; h: number }> = [];
    for (const s of sections) {
      const wing = WINGS[s.title];
      if (!wing) continue;
      const pad = 10, titleH = 24;
      const rows = Math.ceil(s.rooms.length / wing.cols);
      const cw = (wing.w - pad * 2 - (wing.cols - 1) * 6) / wing.cols;
      const ch = (wing.h - titleH - pad * 2 - (rows - 1) * 6) / rows;
      s.rooms.forEach((r, i) => {
        const col = i % wing.cols, row = Math.floor(i / wing.cols);
        out.push({ room: r, section: s, x: wing.x + pad + col * (cw + 6), y: wing.y + titleH + pad + row * (ch + 6), w: cw, h: ch });
      });
    }
    return out;
  }, [sections]);

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="min-w-[320px] flex-1 overflow-hidden rounded-2xl shadow-xl" style={{ background: "linear-gradient(135deg,#0b4ba8,#0d5bc6 55%,#0b4ba8)" }}>
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-white/80">Freedom Offers — War Room · Floor Plan</span>
          <button onClick={() => { setFlowMode((v) => !v); setSel(null); }} className={`rounded-full px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider ring-1 ${flowMode ? "bg-white text-blue-800 ring-white" : "bg-white/10 text-white ring-white/40 hover:bg-white/20"}`}>
            {flowMode ? "✕ exit deal path" : "① follow a deal →"}
          </button>
        </div>
        <svg viewBox="0 0 1240 650" className="w-full select-none">
          <defs>
            <pattern id="bpgrid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
            </pattern>
            <pattern id="bpgrid2" width="100" height="100" patternUnits="userSpaceOnUse">
              <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1240" height="650" fill="url(#bpgrid)" />
          <rect x="0" y="0" width="1240" height="650" fill="url(#bpgrid2)" />

          {/* outer walls (double line like a real plan) */}
          <rect x="22" y="38" width="1196" height="574" fill="none" stroke="#fff" strokeWidth="5" opacity="0.95" />
          <rect x="28" y="44" width="1184" height="562" fill="none" stroke="#fff" strokeWidth="1.2" opacity="0.6" />

          {/* dimension decorations */}
          <g stroke="#fff" strokeWidth="1" opacity="0.5" fontFamily="monospace" fontSize="11" fill="#fff">
            <line x1="22" y1="20" x2="1218" y2="20" /><line x1="22" y1="14" x2="22" y2="26" /><line x1="1218" y1="14" x2="1218" y2="26" />
            <text x="610" y="16" textAnchor="middle" stroke="none">1196</text>
            <line x1="1232" y1="38" x2="1232" y2="612" /><line x1="1226" y1="38" x2="1238" y2="38" /><line x1="1226" y1="612" x2="1238" y2="612" />
            <text x="1236" y="330" stroke="none" transform="rotate(90 1236 330)" textAnchor="middle">574</text>
          </g>

          {/* wings */}
          {sections.map((s) => {
            const w = WINGS[s.title];
            if (!w) return null;
            const locked = s.title === "Owner's Suite";
            return (
              <g key={s.title}>
                <rect x={w.x} y={w.y} width={w.w} height={w.h} fill="rgba(255,255,255,0.03)" stroke="#fff" strokeWidth="2.5" opacity="0.9" strokeDasharray={locked ? "8 4" : undefined} />
                <text x={w.x + 8} y={w.y + 16} fill="#fff" fontFamily="monospace" fontSize="12" fontWeight="bold" letterSpacing="2" opacity="0.9">
                  {s.emoji} {s.title.toUpperCase()}{locked ? " · 🔒" : ""}
                </text>
                {/* door opening on the wing wall */}
                <path d={`M ${w.x + w.w - 42} ${w.y} a 30 30 0 0 1 30 30`} fill="none" stroke="#fff" strokeWidth="1" opacity="0.5" />
                <line x1={w.x + w.w - 42} y1={w.y} x2={w.x + w.w - 42} y2={w.y + 30} stroke="#fff" strokeWidth="1.5" opacity="0.6" />
              </g>
            );
          })}

          {/* rooms */}
          {layout.map(({ room, section, x, y, w, h }) => {
            const selected = sel?.room === room;
            const stepNo = flowMode ? flowIdx.get(room.path) : undefined;
            const dim = flowMode && !stepNo;
            return (
              <g key={section.title + room.name} onClick={() => setSel({ room, section })} style={{ cursor: "pointer" }} opacity={dim ? 0.3 : 1}>
                <rect x={x} y={y} width={w} height={h} rx="2"
                  fill={selected ? "rgba(255,255,255,0.22)" : stepNo ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.05)"}
                  stroke="#fff" strokeWidth={selected || stepNo ? 2 : 1.1} opacity="0.95"
                  className="transition-all hover:fill-[rgba(255,255,255,0.15)]" />
                <text x={x + w / 2} y={y + h / 2 - (stepNo ? 8 : 2)} textAnchor="middle" fill="#fff" fontFamily="monospace" fontSize={w < 110 ? 10 : 11.5} fontWeight="bold">
                  {room.name.length > 18 ? room.name.slice(0, 17) + "…" : room.name}
                </text>
                {stepNo ? (
                  <>
                    <circle cx={x + w / 2} cy={y + h / 2 + 14} r="11" fill="#fff" />
                    <text x={x + w / 2} y={y + h / 2 + 18} textAnchor="middle" fill="#0d5bc6" fontFamily="monospace" fontSize="12" fontWeight="bold">{stepNo}</text>
                  </>
                ) : (
                  <text x={x + w / 2} y={y + h / 2 + 13} textAnchor="middle" fill="#fff" fontFamily="monospace" fontSize="8.5" opacity="0.55">
                    {room.path.startsWith("/") ? room.path : "built-in"}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="px-4 pb-3 font-mono text-[10px] uppercase tracking-wider text-white/60">
          {flowMode ? "numbered rooms = the path one deal walks, lead → profit" : "click any room to see what it does · dashed walls = C-suite only"}
        </div>
      </div>

      {/* detail panel */}
      <div className="w-full max-w-sm shrink-0 lg:w-[340px]">
        {flowMode ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-sm font-extrabold text-slate-800">🔄 How the ecosystem works</div>
            <ol className="mt-2 space-y-1.5">
              {FLOW.map((f, i) => (
                <li key={f.path} className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-blue-600 font-mono text-[10px] font-bold text-white">{i + 1}</span>
                  {f.step}
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-slate-500">Every room feeds the next — KPIs track the whole walk automatically, and the P&L is where the building pays rent.</p>
          </div>
        ) : sel ? (
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{sel.section.emoji} {sel.section.title}</div>
            <div className="mt-0.5 text-lg font-extrabold text-slate-900">{sel.room.name}</div>
            <p className="mt-2 text-sm leading-relaxed text-slate-700">{sel.room.what}</p>
            <div className="mt-3 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-500 ring-1 ring-slate-100">⚙ Powered by: {sel.room.data}</div>
            <p className="mt-2 text-xs italic text-slate-500">{sel.section.pitch}</p>
            {sel.room.path.startsWith("/") && (
              <a href={sel.room.path} className="mt-3 inline-block rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700">🚪 Walk in → {sel.room.path}</a>
            )}
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">
            👋 <b className="text-slate-700">New here?</b> This is the whole War Room drawn as a building. Click any room on the plan to see what it does and walk in — or hit <b>“follow a deal”</b> to watch one deal travel from first call to profit.
          </div>
        )}
      </div>
    </div>
  );
}
