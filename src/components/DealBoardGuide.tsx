"use client";
// 📖 Deal Board — visual how-to (Jon 2026-10-14: "make it visual as well").
// A collapsible guide that sits on top of the board: a 4-step flow with little
// sticky-note mockups so the team SEES how to lay out a buyer's parcels and
// price each one above the seller's ask. Open by default the first time, then
// remembered per device; reopen any time with the "How to use" button. The same
// SOP is also in Cortana (bottom-right orb) on this and every page.
import { useEffect, useState } from "react";

const KEY = "fo_dealboard_guide_open";

export default function DealBoardGuide() {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { const v = localStorage.getItem(KEY); if (v === "0") setOpen(false); } catch {} }, []);
  const toggle = (v: boolean) => { setOpen(v); try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {} };

  if (!open) {
    return (
      <button onClick={() => toggle(true)} className="flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">
        📖 How to use the Deal Board
      </button>
    );
  }

  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-brand-navy p-4 text-white shadow-lg ring-1 ring-black/10">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-extrabold">📖 How to use the Deal Board</div>
          <div className="mt-0.5 max-w-3xl text-[12px] leading-snug text-white/70">
            One buyer wants many parcels across many sellers. Lay them all out, see what each seller wants, and price every parcel <b className="text-white">above</b> their ask — so the bundle always makes money and you never lose on a single parcel.
          </div>
        </div>
        <button onClick={() => toggle(false)} className="shrink-0 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/20">Got it ✕</button>
      </div>

      {/* visual 4-step flow */}
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <Step n={1} title="Name the board" tone="bg-slate-700">
          <div className="rounded-md bg-white/10 px-2 py-1 text-[11px]">＋ New board → <b>“Acme Land Co.”</b></div>
          <div className="mt-1 text-[10px] text-white/60">Name it after the BUYER.</div>
        </Step>
        <Arrow />
        <Step n={2} title="Pull each seller" tone="bg-sky-700">
          <div className="rounded-md bg-sky-400/20 px-2 py-1 text-[11px] font-semibold ring-1 ring-sky-300/40">🔗 Pull “Jane Doe”</div>
          <div className="mt-1 text-[10px] text-white/60">Drops a seller header + a note per parcel (address, APN, their ask).</div>
        </Step>
        <Arrow />
        <Step n={3} title="Price each parcel" tone="bg-amber-600">
          <div className="rounded-md bg-amber-300 px-2 py-1 text-[11px] font-semibold text-slate-900 shadow">
            📍 12 Oak Rd<br />wants: $5,000<br />our price: <b>$8,000</b>
          </div>
          <div className="mt-1 text-[10px] text-white/60">Always set <b>our price</b> higher than they want.</div>
        </Step>
        <Arrow />
        <Step n={4} title="Check it in the sheet" tone="bg-emerald-700">
          <div className="flex items-center justify-between gap-2 rounded-md bg-white/10 px-2 py-1 text-[11px]">
            <span>📊 Spreadsheet</span><span className="rounded bg-emerald-400 px-1.5 font-bold text-slate-900">+$3,000</span>
          </div>
          <div className="mt-1 text-[10px] text-white/60">Keep every <b className="text-emerald-300">Margin green</b>. Edit prices inline.</div>
        </Step>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/70">
        <span>🖱 Move · ✏️ Pen · 🔤 Text (no limit) · 🧽 Erase</span>
        <span>🎨 Change board color if black is hard to read</span>
        <span>✓ Autosaves as you go</span>
        <span className="text-white/50">Need the SOP again? It&apos;s in Cortana (bottom-right) on every page.</span>
      </div>
    </div>
  );
}

function Step({ n, title, tone, children }: { n: number; title: string; tone: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 rounded-xl bg-white/5 p-2.5 ring-1 ring-white/10">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${tone} text-[11px] font-extrabold`}>{n}</span>
        <span className="text-[12px] font-bold">{title}</span>
      </div>
      {children}
    </div>
  );
}
function Arrow() { return <div className="hidden items-center justify-center text-white/30 lg:flex">→</div>; }
