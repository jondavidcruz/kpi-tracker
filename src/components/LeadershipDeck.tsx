"use client";

import Deck, { Navy, Light, Bullets, money, type Slide } from "@/components/Deck";
import type { LeadershipDeck } from "@/lib/meeting";

export default function LeadershipDeckView({ deck }: { deck: LeadershipDeck }) {
  return <Deck slides={buildSlides(deck)} />;
}

const FIN_COLOR: Record<string, string> = { indigo: "#818cf8", sky: "#38bdf8", amber: "#fbbf24", emerald: "#34d399", rose: "#fb7185" };

function buildSlides(d: LeadershipDeck): Slide[] {
  const s: Slide[] = [];

  // 1. Title
  s.push({ name: "Title", node: (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-brand-navy-950 via-brand-navy to-brand-navy-700 text-center text-white">
      <div className="text-brand-gold" style={{ fontSize: "clamp(10px,1.4cqw,16px)", letterSpacing: "0.4em" }}>FREEDOM OFFERS</div>
      <div className="mt-2 font-extrabold tracking-tight" style={{ fontSize: "clamp(28px,6cqw,84px)" }}>Leadership Meeting</div>
      <div className="mt-3 rounded-full bg-white/10 px-5 py-1.5 text-brand-gold-soft" style={{ fontSize: "clamp(12px,1.8cqw,22px)" }}>Leadership only · {d.generatedOn}</div>
    </div>
  )});

  // 2. Agenda
  s.push({ name: "Agenda", node: (
    <Navy title="Agenda"><Bullets items={d.agenda} empty="Add the agenda below in Edit deck content." /></Navy>
  )});

  // 3. Business snapshot
  const fin = d.finance;
  s.push({ name: "Business Snapshot", node: (
    <Navy title={fin ? `Financial Snapshot · ${fin.monthLabel}` : "Business Snapshot"}>
      {fin ? (
        <>
          {/* P&L headline */}
          <div className="grid grid-cols-4 gap-[1.6%]">
            {[
              { l: "Income", v: money(fin.income), c: "text-emerald-300" },
              { l: "Expenses", v: money(fin.spent), c: "text-rose-300" },
              { l: "Net profit", v: money(fin.profit), c: fin.profit >= 0 ? "text-brand-gold" : "text-red-400" },
              { l: "Margin", v: fin.margin != null ? `${Math.round(fin.margin)}%` : "—", c: "text-white" },
            ].map((c) => (
              <div key={c.l} className="rounded-lg bg-white/5 p-[3%] ring-1 ring-white/10">
                <div className="text-white/60" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{c.l}</div>
                <div className={`font-extrabold tabular-nums ${c.c}`} style={{ fontSize: "clamp(15px,2.6cqw,34px)" }}>{c.v}</div>
              </div>
            ))}
          </div>

          {/* Where the money goes */}
          {fin.spent > 0 && (
            <div className="mt-[3.5%]">
              <div className="text-white/50" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>Where the money goes</div>
              <div className="mt-1 flex h-3 overflow-hidden rounded-full">
                {fin.categories.map((c) => <div key={c.label} style={{ width: `${(c.total / fin.spent) * 100}%`, background: FIN_COLOR[c.color] ?? "#64748b" }} />)}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-[3%] gap-y-1">
                {fin.categories.map((c) => (
                  <span key={c.label} className="flex items-center gap-1 text-white/70" style={{ fontSize: "clamp(7px,0.95cqw,12px)" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: FIN_COLOR[c.color] ?? "#64748b" }} />{c.label} {money(c.total)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Leads dashboard */}
          <div className="mt-[3.5%] grid grid-cols-3 gap-[1.6%]">
            {[
              { l: "Leads this month", v: fin.leads.toLocaleString() },
              { l: "Cost / lead", v: fin.leads > 0 ? money(Math.round(fin.costPerLead)) : "—" },
              { l: "Active pipeline", v: String(d.pipelineCount) },
            ].map((c) => (
              <div key={c.l} className="rounded-lg bg-white/5 p-[3%] text-center ring-1 ring-white/10">
                <div className="text-white/60" style={{ fontSize: "clamp(8px,0.95cqw,12px)" }}>{c.l}</div>
                <div className="font-extrabold tabular-nums text-white" style={{ fontSize: "clamp(13px,2cqw,26px)" }}>{c.v}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center text-center text-white/60" style={{ fontSize: "clamp(11px,1.6cqw,20px)" }}>
          <div className="text-brand-gold-soft">Goal: {d.goal.homeownersDone}/{d.goal.homeownersGoal} homeowners · {money(d.goal.revenueClosed)} of {money(d.goal.revenueGoal)}</div>
          <div className="mt-2">Financials are visible to the C-suite only.</div>
        </div>
      )}
    </Navy>
  )});

  // 4. Talking points / discussion
  s.push({ name: "Discussion", node: (
    <Navy title="Discussion / Talking Points"><Bullets items={d.talkingPoints} empty="Add discussion points below in Edit deck content." /></Navy>
  )});

  // 5. Decisions & action items
  s.push({ name: "Action Items", node: (
    <Light title="✅ Decisions & Action Items"><Bullets items={d.actionItems} empty="Capture decisions and action items below in Edit deck content." dark={false} /></Light>
  )});

  return s;
}
