"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Presentation, Play, Pause, RotateCcw } from "lucide-react";

export type Slide = { name: string; node: React.ReactNode; key?: string };

/** Optional timed run-of-show: a meeting split into back-to-back parts, each with a
 *  minute budget. The current part is derived from which slide you're on (the last part
 *  whose startIndex ≤ the current slide). Powers the Monday-meeting "keep it to 30 min". */
export type DeckClock = {
  totalMin: number;
  parts: { label: string; min: number; startIndex: number; emoji?: string }[];
};

function mmss(sec: number) {
  const over = sec < 0;
  const s = Math.abs(Math.round(sec));
  return `${over ? "+" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Reusable full-screen present-mode shell (keyboard nav, dots, fullscreen, optional clock). */
export default function Deck({ slides, clock }: { slides: Slide[]; clock?: DeckClock }) {
  const [i, setI] = useState(0);
  const [fs, setFs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // ---- meeting clock (only when a `clock` config is passed) ----
  const [elapsed, setElapsed] = useState(0); // seconds since Start
  const [running, setRunning] = useState(false);
  const startRef = useRef(0);
  const partStarts = useRef<Record<number, number>>({});

  const go = useCallback((d: number) => setI((p) => Math.max(0, Math.min(slides.length - 1, p + d))), [slides.length]);
  const resetClock = useCallback(() => { setRunning(false); setElapsed(0); partStarts.current = {}; }, []);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - elapsed * 1000;
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // Current part = last part whose startIndex ≤ current slide.
  const partIdx = clock ? clock.parts.reduce((acc, p, idx) => (i >= p.startIndex ? idx : acc), 0) : 0;
  // Snapshot when each part is first entered while the clock runs, for true per-part elapsed.
  // Cached synchronously here (not in an effect) so the HUD reads the right start on the very
  // render the handoff happens — otherwise part 2 flashes "+15:00 over" for one tick.
  if (clock && running && partStarts.current[partIdx] == null) partStarts.current[partIdx] = elapsed;

  const part = clock?.parts[partIdx];
  const partElapsed = elapsed - (partStarts.current[partIdx] ?? 0);
  const partRemain = (part?.min ?? 0) * 60 - partElapsed;
  const totalRemain = clock ? clock.totalMin * 60 - elapsed : 0;
  const partPct = part ? Math.min(100, (partElapsed / (part.min * 60)) * 100) : 0;
  const tone = (sec: number) => (sec < 0 ? "text-red-300" : sec <= 120 ? "text-amber-300" : "text-emerald-300");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
      else if (clock && (e.key === "t" || e.key === "T")) { e.preventDefault(); setRunning((r) => !r); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, clock]);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const present = () => wrapRef.current?.requestFullscreen?.();

  // Floating timer HUD — shows over the slide (incl. fullscreen) once the clock exists.
  const hud = clock && (
    <div className="absolute right-[2.2%] top-[2.2%] z-10 flex items-center gap-2 rounded-xl bg-black/70 px-2.5 py-1.5 text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm">
      <div className="text-right leading-none">
        <div className={`font-extrabold tabular-nums ${tone(totalRemain)}`} style={{ fontSize: "clamp(14px,2.2cqw,26px)" }}>{mmss(totalRemain)}</div>
        <div className="text-white/50" style={{ fontSize: "clamp(6px,0.8cqw,10px)" }}>of {clock.totalMin}:00 left</div>
      </div>
      <div className="h-7 w-px bg-white/20" />
      <div className="leading-tight">
        <div className="font-bold" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{part?.emoji} {part?.label}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <div className="h-1 w-16 overflow-hidden rounded-full bg-white/20">
            <div className={`h-full rounded-full ${partRemain < 0 ? "bg-red-400" : partRemain <= 120 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${partPct}%` }} />
          </div>
          <span className={`font-semibold tabular-nums ${tone(partRemain)}`} style={{ fontSize: "clamp(7px,0.9cqw,11px)" }}>{partRemain < 0 ? `${mmss(partRemain)} over` : `${mmss(partRemain)} left`}</span>
        </div>
      </div>
      <button onClick={() => setRunning((r) => !r)} className="ml-0.5 grid h-6 w-6 place-items-center rounded-md bg-white/15 hover:bg-white/25" title={running ? "Pause (t)" : "Start (t)"}>
        {running ? <Pause size={12} /> : <Play size={12} />}
      </button>
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-slate-500">Slide {i + 1} / {slides.length} · {slides[i].name}</div>
        <button onClick={present} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-navy-700">
          <Presentation size={15} /> Present
        </button>
      </div>

      <div ref={wrapRef} className={fs ? "flex h-screen w-screen items-center justify-center bg-black" : ""}>
        <div style={{ containerType: "size" }} className={`relative aspect-video w-full overflow-hidden rounded-xl shadow-lg ring-1 ring-black/10 ${fs ? "h-full w-auto" : ""}`}>
          {slides[i].node}
          {hud}
          <button aria-label="Previous" onClick={() => go(-1)} className="absolute left-0 top-0 h-full w-[12%] cursor-w-resize" />
          <button aria-label="Next" onClick={() => go(1)} className="absolute right-0 top-0 h-full w-[12%] cursor-e-resize" />
        </div>
      </div>

      {clock && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button onClick={() => setRunning((r) => !r)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${running ? "bg-amber-600 hover:bg-amber-700" : "bg-emerald-600 hover:bg-emerald-700"}`}>
            {running ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {elapsed > 0 ? "Resume" : "Start 30-min clock"}</>}
          </button>
          <button onClick={resetClock} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100">
            <RotateCcw size={14} /> Reset
          </button>
          {clock.parts.map((p, idx) => {
            const active = idx === partIdx;
            return (
              <span key={idx} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${active ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-500"}`}>
                {p.emoji} {p.label} · {p.min}m
              </span>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-4">
        <button onClick={() => go(-1)} disabled={i === 0} className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-slate-300 disabled:opacity-40 hover:bg-slate-100"><ChevronLeft size={18} /></button>
        <div className="flex flex-wrap justify-center gap-1.5">
          {slides.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} className={`h-2 w-2 rounded-full ${idx === i ? "bg-brand-navy" : "bg-slate-300 hover:bg-slate-400"}`} />
          ))}
        </div>
        <button onClick={() => go(1)} disabled={i === slides.length - 1} className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-slate-300 disabled:opacity-40 hover:bg-slate-100"><ChevronRight size={18} /></button>
        <button onClick={present} className="ml-2 grid h-9 w-9 place-items-center rounded-lg ring-1 ring-slate-300 hover:bg-slate-100" title="Full screen"><Maximize2 size={16} /></button>
      </div>
      <p className="mt-2 text-center text-xs text-slate-400">← → arrow keys to navigate · Present for full screen · Esc to exit{clock ? " · press T to start/pause the clock" : ""}</p>
    </div>
  );
}

// ---------- shared slide chrome ----------
export const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function Navy({ title, accent = "text-brand-gold", children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-brand-navy px-[6%] py-[5%] text-white">
      <h2 className={`mb-[3%] text-center font-extrabold ${accent}`} style={{ fontSize: "clamp(20px,3.4cqw,46px)" }}>{title}</h2>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
export function Light({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-white px-[6%] py-[5%]">
      <h2 className="mb-[3%] text-center font-extrabold text-brand-navy" style={{ fontSize: "clamp(20px,3.4cqw,46px)" }}>{title}</h2>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
export function Bullets({ items, empty, dark = true }: { items: string[]; empty: string; dark?: boolean }) {
  const color = dark ? "text-white" : "text-slate-700";
  const emptyColor = dark ? "text-white/50" : "text-slate-400";
  if (!items.length) return <p className={`mt-6 text-center ${emptyColor}`} style={{ fontSize: "clamp(13px,1.8cqw,22px)" }}>{empty}</p>;
  return (
    <ul className="mx-auto max-w-[85%] space-y-[1.6%] pt-[2%]">
      {items.map((t, i) => (
        <li key={i} className={`flex gap-3 ${color}`} style={{ fontSize: "clamp(13px,2.1cqw,28px)" }}>
          <span className="text-brand-gold">•</span><span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
