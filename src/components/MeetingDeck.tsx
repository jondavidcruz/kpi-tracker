"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Presentation } from "lucide-react";
import type { MeetingDeck } from "@/lib/meeting";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function MeetingDeckView({ deck }: { deck: MeetingDeck }) {
  const slides = buildSlides(deck);
  const [i, setI] = useState(0);
  const [fs, setFs] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const go = useCallback((d: number) => setI((p) => Math.max(0, Math.min(slides.length - 1, p + d))), [slides.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

          {/* click zones */}
          <button aria-label="Previous" onClick={() => go(-1)} className="absolute left-0 top-0 h-full w-[12%] cursor-w-resize" />
          <button aria-label="Next" onClick={() => go(1)} className="absolute right-0 top-0 h-full w-[12%] cursor-e-resize" />
        </div>
      </div>

      {/* controls */}
      <div className="mt-3 flex items-center justify-center gap-4">
        <button onClick={() => go(-1)} disabled={i === 0} className="grid h-9 w-9 place-items-center rounded-lg ring-1 ring-slate-300 disabled:opacity-40 hover:bg-slate-100"><ChevronLeft size={18} /></button>
        <div className="flex gap-1.5">
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

// ---------- slide chrome ----------
function Navy({ title, accent = "text-brand-gold", children }: { title: string; accent?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-brand-navy px-[6%] py-[5%] text-white">
      <h2 className={`mb-[3%] text-center text-[3.2cqw] font-extrabold ${accent}`} style={{ fontSize: "clamp(20px,3.4cqw,46px)" }}>{title}</h2>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
function Light({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col bg-white px-[6%] py-[5%]">
      <h2 className="mb-[3%] text-center font-extrabold text-brand-navy" style={{ fontSize: "clamp(20px,3.4cqw,46px)" }}>{title}</h2>
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
function Bullets({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="mt-6 text-center text-white/50" style={{ fontSize: "clamp(13px,1.8cqw,22px)" }}>{empty}</p>;
  return (
    <ul className="mx-auto max-w-[85%] space-y-[1.6%]">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-white" style={{ fontSize: "clamp(13px,2.1cqw,28px)" }}>
          <span className="text-brand-gold">•</span><span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function buildSlides(d: MeetingDeck): { name: string; node: React.ReactNode }[] {
  const s: { name: string; node: React.ReactNode }[] = [];

  // 1. Title — the real Canva hero (team photo), with the live week overlaid
  s.push({ name: "Title", node: (
    <div className="relative h-full w-full bg-brand-navy bg-cover bg-center" style={{ backgroundImage: "url(/meeting/title.png)" }}>
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[4%]">
        <div className="rounded-full bg-brand-navy/85 px-6 py-2 text-center text-white shadow-lg backdrop-blur-sm">
          <span className="font-bold" style={{ fontSize: "clamp(13px,2cqw,26px)" }}>Monday All-Call</span>
          <span className="mx-2 text-brand-gold">·</span>
          <span className="text-brand-gold-soft" style={{ fontSize: "clamp(12px,1.7cqw,22px)" }}>{d.weekLabel}</span>
        </div>
      </div>
    </div>
  )});

  // 2. Meet the team — the exact Canva slide
  s.push({ name: "Team", node: (
    <div className="h-full w-full bg-white bg-contain bg-center bg-no-repeat" style={{ backgroundImage: "url(/meeting/team.png)" }} />
  )});

  // 3. Announcements
  s.push({ name: "Announcements", node: (
    <Navy title="Team Announcements"><Bullets items={d.announcements} empty="Add this week's announcements in Admin → Monday Meeting." /></Navy>
  )});

  // 4. Coming soon
  s.push({ name: "Coming Soon", node: (
    <Navy title="Change / Coming Soon"><Bullets items={d.comingSoon} empty="Add upcoming changes in Admin → Monday Meeting." /></Navy>
  )});

  // 5. Last week KPIs
  s.push({ name: "Last Week KPIs", node: (
    <Light title="Last Week's KPIs">
      <div className="grid grid-cols-4 gap-[1.5%]">
        {d.lastWeek.glance.slice(0, 8).map((g) => (
          <div key={g.key} className="rounded-lg bg-slate-50 p-[3%] ring-1 ring-slate-200">
            <div className="text-slate-500" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{g.name}</div>
            <div className="font-extrabold tabular-nums text-slate-900" style={{ fontSize: "clamp(15px,2.6cqw,34px)" }}>{g.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-[2%] grid gap-[2%]" style={{ gridTemplateColumns: `repeat(${Math.min(d.lastWeek.roleTables.length, 2)},1fr)` }}>
        {d.lastWeek.roleTables.map((rt) => (
          <div key={rt.label} className="overflow-hidden rounded-lg ring-1 ring-slate-200">
            <div className="bg-brand-navy px-3 py-1 font-bold text-white" style={{ fontSize: "clamp(9px,1.2cqw,15px)" }}>{rt.emoji} {rt.label}</div>
            <table className="w-full" style={{ fontSize: "clamp(7px,0.95cqw,12px)" }}>
              <thead><tr className="bg-slate-50 text-slate-500">
                <th className="px-1.5 py-0.5 text-left">Rep</th>
                {rt.columns.map((c) => <th key={c.key} className="px-1 py-0.5 text-center">{c.name}</th>)}
              </tr></thead>
              <tbody>
                {rt.rows.map((r) => (
                  <tr key={r.rep} className="border-t border-slate-100">
                    <td className="px-1.5 py-0.5 font-semibold text-slate-700">{r.rep}</td>
                    {r.cells.map((c, ci) => <td key={ci} className="px-1 py-0.5 text-center tabular-nums text-slate-700">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Light>
  )});

  // 6. Monthly dashboard
  s.push({ name: "Monthly Dashboard", node: (
    <Navy title="Month-to-Date Dashboard">
      <div className="grid grid-cols-3 gap-[1.6%]">
        {d.monthly.financials.map((g) => (
          <div key={g.key} className="rounded-lg bg-white/5 p-[3%] ring-1 ring-white/10">
            <div className="text-white/60" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{g.name}</div>
            <div className="font-extrabold tabular-nums text-white" style={{ fontSize: "clamp(15px,2.6cqw,34px)" }}>{g.value}</div>
          </div>
        ))}
        {!d.monthly.financials.length && <div className="col-span-3 text-center text-white/50" style={{ fontSize: "clamp(11px,1.6cqw,20px)" }}>No monthly KPIs entered yet this month.</div>}
      </div>
      <div className="mt-[3%] grid grid-cols-5 gap-[1.6%]">
        {[
          { l: "Revenue Closed (YTD)", v: money(d.monthly.revenueClosed), gold: true },
          { l: "Pending in Escrow", v: money(d.monthly.revenuePending) },
          { l: "In Escrow", v: String(d.monthly.inEscrow) },
          { l: "Closed Deals", v: String(d.monthly.closedCount) },
          { l: "Goal Remaining", v: money(d.monthly.goalRemaining), gold: true },
        ].map((c) => (
          <div key={c.l} className="rounded-lg bg-white/5 p-[3%] text-center ring-1 ring-white/10">
            <div className="text-white/60" style={{ fontSize: "clamp(8px,0.95cqw,12px)" }}>{c.l}</div>
            <div className={`font-extrabold tabular-nums ${c.gold ? "text-brand-gold" : "text-white"}`} style={{ fontSize: "clamp(13px,2cqw,26px)" }}>{c.v}</div>
          </div>
        ))}
      </div>
    </Navy>
  )});

  // 7. Pipeline
  s.push({ name: "Active Pipeline", node: (
    <Light title="Active Deal Pipeline">
      <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
        <table className="w-full" style={{ fontSize: "clamp(8px,1.15cqw,15px)" }}>
          <thead><tr className="bg-slate-50 text-left text-slate-500">
            <th className="px-3 py-1">Property</th><th className="px-2 py-1">Status</th><th className="px-2 py-1">Rep</th>
            <th className="px-2 py-1 text-center">Days</th><th className="px-2 py-1 text-right">Est. profit</th>
          </tr></thead>
          <tbody>
            {d.pipeline.map((p, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="px-3 py-1 font-semibold text-slate-800">{p.address}</td>
                <td className="px-2 py-1 text-slate-600">{p.status.replace(/_/g, " ")}</td>
                <td className="px-2 py-1 text-slate-600">{p.rep}</td>
                <td className="px-2 py-1 text-center tabular-nums text-slate-600">{p.days ?? "—"}</td>
                <td className="px-2 py-1 text-right tabular-nums text-slate-700">{p.profit != null ? money(p.profit) : "—"}</td>
              </tr>
            ))}
            {!d.pipeline.length && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">No active deals.</td></tr>}
          </tbody>
        </table>
      </div>
    </Light>
  )});

  // 8. Annual goal
  s.push({ name: "Annual Goal", node: (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-amber-900 via-brand-navy to-brand-navy-950 px-[8%] text-center text-white">
      <div className="font-extrabold text-brand-gold" style={{ fontSize: "clamp(20px,3.4cqw,46px)" }}>{new Date().getFullYear()} Sales Goal</div>
      <div className="mt-2 font-bold" style={{ fontSize: "clamp(16px,2.6cqw,34px)" }}>Help {d.goal.homeownersGoal} homeowners in need</div>
      <div className="mt-1 text-brand-gold-soft font-semibold" style={{ fontSize: "clamp(14px,2.2cqw,28px)" }}>{d.goal.homeownersDone} / {d.goal.homeownersGoal} complete</div>
      <div className="mt-[3%] h-3 w-[70%] overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-brand-gold" style={{ width: `${Math.round(d.goal.pct * 100)}%` }} />
      </div>
      <div className="mt-1 text-white/70" style={{ fontSize: "clamp(11px,1.5cqw,18px)" }}>{money(d.goal.revenueClosed)} of {money(d.goal.revenueGoal)} {d.goal.revenueGoal ? `(${Math.round(d.goal.pct * 100)}%)` : ""}</div>
      <div className="mt-[4%] space-y-1" style={{ fontSize: "clamp(11px,1.6cqw,20px)" }}>
        {d.goal.reward && <div><span className="font-bold text-brand-gold">{money(d.goal.revenueGoal)} goal</span> = {d.goal.reward}</div>}
        {d.goal.stretchGoal > 0 && d.goal.stretchReward && <div><span className="font-bold text-brand-gold">{money(d.goal.stretchGoal)} stretch</span> = {d.goal.stretchReward}</div>}
      </div>
    </div>
  )});

  // 9. Recognition
  s.push({ name: "Recognition", node: (
    <Light title="🏆 Last Week's Standouts">
      {d.recognition.length ? (
        <div className="flex h-full items-center justify-center gap-[4%]">
          {d.recognition.map((r) => (
            <div key={r.role} className="rounded-2xl bg-gradient-to-br from-amber-50 to-white p-[4%] text-center ring-2 ring-brand-gold/40" style={{ minWidth: "26%" }}>
              <div className="text-brand-gold" style={{ fontSize: "clamp(20px,3cqw,40px)" }}>★</div>
              <div className="font-extrabold text-slate-900" style={{ fontSize: "clamp(16px,2.4cqw,32px)" }}>{r.rep}</div>
              <div className="text-slate-500" style={{ fontSize: "clamp(10px,1.2cqw,15px)" }}>{r.role}</div>
              <div className="mt-2 font-bold text-brand-navy" style={{ fontSize: "clamp(12px,1.7cqw,22px)" }}>{r.value} · {r.kpi}</div>
            </div>
          ))}
        </div>
      ) : <p className="mt-6 text-center text-slate-400" style={{ fontSize: "clamp(13px,1.8cqw,22px)" }}>No standout numbers logged last week yet.</p>}
    </Light>
  )});

  // 10. Training tip
  s.push({ name: "Training Tip", node: (
    <div className="flex h-full w-full flex-col items-center justify-center bg-brand-navy px-[10%] text-center text-white">
      <div className="text-brand-gold" style={{ fontSize: "clamp(11px,1.6cqw,20px)", letterSpacing: "0.2em" }}>TRAINING TIP OF THE WEEK</div>
      {d.trainingTip?.targetKpi && <div className="mt-1 text-white/60" style={{ fontSize: "clamp(10px,1.3cqw,16px)" }}>Focus: {d.trainingTip.targetKpi}</div>}
      <div className="mt-[4%] max-w-[80%] font-bold leading-snug" style={{ fontSize: "clamp(16px,3cqw,40px)" }}>
        {d.trainingTip ? d.trainingTip.text : "Add training tips in Admin → Monday Meeting."}
      </div>
    </div>
  )});

  // 11. Leadership talking points
  s.push({ name: "Talking Points", node: (
    <Light title="Leadership Talking Points">
      {d.talkingPoints.length ? (
        <ul className="mx-auto max-w-[80%] space-y-[1.8%] pt-[2%]">
          {d.talkingPoints.map((t, i) => (
            <li key={i} className="flex gap-3 text-slate-700" style={{ fontSize: "clamp(13px,2.1cqw,28px)" }}><span className="text-brand-gold">•</span><span>{t}</span></li>
          ))}
        </ul>
      ) : <p className="mt-6 text-center text-slate-400" style={{ fontSize: "clamp(13px,1.8cqw,22px)" }}>Add talking points in Admin → Monday Meeting.</p>}
    </Light>
  )});

  return s;
}
