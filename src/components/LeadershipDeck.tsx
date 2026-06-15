"use client";

import Deck, { Navy, Light, Bullets, money, type Slide } from "@/components/Deck";
import type { LeadershipDeck } from "@/lib/meeting";

export default function LeadershipDeckView({ deck }: { deck: LeadershipDeck }) {
  return <Deck slides={buildSlides(deck)} />;
}

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
  s.push({ name: "Business Snapshot", node: (
    <Navy title="Business Snapshot">
      <div className="mx-auto mb-[3%] max-w-[80%] text-center">
        <div className="font-bold text-brand-gold-soft" style={{ fontSize: "clamp(13px,2cqw,26px)" }}>
          Goal: {d.goal.homeownersDone}/{d.goal.homeownersGoal} homeowners · {money(d.goal.revenueClosed)} of {money(d.goal.revenueGoal)}
        </div>
        <div className="mx-auto mt-2 h-2.5 w-[70%] overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-brand-gold" style={{ width: `${Math.round(d.goal.pct * 100)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-[1.6%]">
        {d.monthly.financials.map((g) => (
          <div key={g.key} className="rounded-lg bg-white/5 p-[3%] ring-1 ring-white/10">
            <div className="text-white/60" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{g.name}</div>
            <div className="font-extrabold tabular-nums text-white" style={{ fontSize: "clamp(14px,2.4cqw,32px)" }}>{g.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-[3%] grid grid-cols-4 gap-[1.6%]">
        {[
          { l: "Revenue Closed (YTD)", v: money(d.monthly.revenueClosed), gold: true },
          { l: "Pending Escrow", v: money(d.monthly.revenuePending) },
          { l: "Active Pipeline", v: String(d.pipelineCount) },
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
