"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Presentation } from "lucide-react";

export type Slide = { name: string; node: React.ReactNode; key?: string };

/** Reusable full-screen present-mode shell (keyboard nav, dots, fullscreen). */
export default function Deck({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [fs, setFs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const go = useCallback((d: number) => setI((p) => Math.max(0, Math.min(slides.length - 1, p + d))), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const present = () => wrapRef.current?.requestFullscreen?.();

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
          <button aria-label="Previous" onClick={() => go(-1)} className="absolute left-0 top-0 h-full w-[12%] cursor-w-resize" />
          <button aria-label="Next" onClick={() => go(1)} className="absolute right-0 top-0 h-full w-[12%] cursor-e-resize" />
        </div>
      </div>

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
      <p className="mt-2 text-center text-xs text-slate-400">← → arrow keys to navigate · Present for full screen · Esc to exit</p>
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
