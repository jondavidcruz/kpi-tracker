"use client";

import Deck, { Navy, Light, Bullets, money, type Slide } from "@/components/Deck";
import type { MeetingDeck } from "@/lib/meeting";

export default function MeetingDeckView({ deck }: { deck: MeetingDeck }) {
  return <Deck slides={buildSlides(deck)} />;
}

// One position's KPI table, full width — positions stack top-to-bottom.
function RoleBlock({ rt }: { rt: MeetingDeck["lastWeek"]["roleTables"][number] }) {
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
      <div className="bg-brand-navy px-3 py-1 font-bold text-white" style={{ fontSize: "clamp(9px,1.3cqw,16px)" }}>{rt.emoji} {rt.label}</div>
      <table className="w-full" style={{ fontSize: "clamp(8px,1.15cqw,15px)" }}>
        <thead><tr className="bg-slate-50 text-slate-500">
          <th className="px-2 py-1 text-left">Rep</th>
          {rt.columns.map((c) => <th key={c.key} className="px-1.5 py-1 text-center">{c.name}</th>)}
        </tr></thead>
        <tbody>
          {rt.rows.map((r) => (
            <tr key={r.rep} className="border-t border-slate-100">
              <td className="px-2 py-1 font-semibold text-slate-700">{r.rep}</td>
              {r.cells.map((c, ci) => <td key={ci} className="px-1.5 py-1 text-center font-bold tabular-nums text-slate-800">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Shared KPI slide — glance tiles + per-position tables stacked vertically.
function KpiSlide({ title, glance, roleTables }: { title: string; glance: MeetingDeck["lastWeek"]["glance"]; roleTables: MeetingDeck["lastWeek"]["roleTables"] }) {
  return (
    <Light title={title}>
      {glance.length > 0 && (
        <div className="grid grid-cols-4 gap-[1.5%]">
          {glance.slice(0, 8).map((g) => (
            <div key={g.key} className="rounded-lg bg-slate-50 p-[2.5%] ring-1 ring-slate-200">
              <div className="text-slate-500" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{g.name}</div>
              <div className="font-extrabold tabular-nums text-slate-900" style={{ fontSize: "clamp(14px,2.4cqw,32px)" }}>{g.value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-[2.5%] space-y-[1.5%]">
        {roleTables.map((rt) => <RoleBlock key={rt.label} rt={rt} />)}
      </div>
    </Light>
  );
}

// Split a KPI section across slides so no position's table gets clipped: the first
// slide carries the glance tiles + the first position; remaining positions (incl.
// Dispositions) get their own roomy slide.
function pushKpiSlides(s: Slide[], title: string, section: MeetingDeck["lastWeek"]) {
  const tables = section.roleTables;
  s.push({ name: `${title} KPIs`, node: <KpiSlide title={`${title} — Team KPIs`} glance={section.glance} roleTables={tables.slice(0, 1)} /> });
  if (tables.length > 1) {
    s.push({ name: `${title} KPIs (cont.)`, node: <KpiSlide title={`${title} — Team KPIs (cont.)`} glance={[]} roleTables={tables.slice(1)} /> });
  }
}

// Slide 2 — "A small team. By design." Mirrors the public site's team section
// (freedom-offers.com), rebuilt natively so it stays crisp at any size. Headshots
// live in public/meeting/team/, pulled straight from the site.
const TEAM = [
  { slug: "jon", name: "Jon Cruz", title: "Founder & President" },
  { slug: "enrico", name: "Enrico C.", title: "Vice President" },
  { slug: "viktoriia", name: "Viktoriia C.", title: "Marketing Director" },
  { slug: "cortana", name: "Cortana C.", title: "Technology Director" },
  { slug: "marie", name: "Marie M.", title: "Operations Director" },
  { slug: "sharyn", name: "Sharyn M.", title: "Dispositions Director" },
  { slug: "michelle", name: "Michelle L.", title: "Acquisitions Officer" },
  { slug: "ethan", name: "Ethan", title: "Listing Agent" },
];
const SERIF = "Georgia, 'Times New Roman', serif";
function TeamSlide() {
  return (
    <div className="flex h-full w-full flex-col items-center overflow-hidden bg-[#f5ede4] px-[5cqw] py-[3.2cqw] text-center">
      <h2 style={{ fontFamily: SERIF, fontSize: "clamp(18px,4.4cqw,52px)", color: "#22404f" }}>
        A small team. <span className="italic" style={{ color: "#5f7a63" }}>By design.</span>
      </h2>
      <p className="mt-[0.6cqw] text-slate-600" style={{ fontSize: "clamp(9px,1.5cqw,20px)" }}>
        Eight people, working directly with you. No middlemen, no call centers, no scripts.
      </p>
      {/* Photos are height-driven (flex-1) inside a fixed 2-row grid so all 8 always
          fit the slide — never cut off, whatever the screen size. */}
      <div className="mt-[2cqw] grid min-h-0 w-full flex-1 grid-cols-4 grid-rows-2 gap-x-[2.5cqw] gap-y-[1.2cqw]">
        {TEAM.map((p) => (
          <div key={p.slug} className="flex min-h-0 flex-col">
            <div
              className="min-h-0 w-full flex-1 bg-slate-200 bg-cover bg-top"
              style={{ backgroundImage: `url(/meeting/team/${p.slug}.webp)` }}
            />
            <div className="mt-[0.5cqw] font-semibold leading-tight" style={{ fontFamily: SERIF, fontSize: "clamp(9px,1.5cqw,20px)", color: "#22404f" }}>{p.name}</div>
            <div className="font-semibold uppercase tracking-wider leading-tight" style={{ fontSize: "clamp(6px,0.9cqw,12px)", color: "#5f7a63" }}>{p.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildSlides(d: MeetingDeck): Slide[] {
  const s: Slide[] = [];

  // 1. Title — owner-uploaded hero if set, else the built-in Canva hero, with the live week overlaid
  s.push({ name: "Title", node: (
    <div className="relative h-full w-full bg-brand-navy bg-cover bg-center" style={{ backgroundImage: `url(${d.titleSlideUrl || "/meeting/title.png"})` }}>
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-[4%]">
        <div className="rounded-full bg-brand-navy/85 px-6 py-2 text-center text-white shadow-lg backdrop-blur-sm">
          <span className="font-bold" style={{ fontSize: "clamp(13px,2cqw,26px)" }}>Monday All-Call</span>
          <span className="mx-2 text-brand-gold">·</span>
          <span className="text-brand-gold-soft" style={{ fontSize: "clamp(12px,1.7cqw,22px)" }}>{d.thisWeekLabel}</span>
        </div>
      </div>
    </div>
  )});

  // 2. Meet the team — owner-uploaded image if set, else the native "A small team" grid
  s.push({ name: "Team", node: d.teamSlideUrl
    ? <div className="h-full w-full bg-[#f5ede4] bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${d.teamSlideUrl})` }} />
    : <TeamSlide /> });

  // 2b. Owner-added custom slides (uploaded photos / text), inserted right after the team.
  for (const cs of d.customSlides) {
    if (cs.kind === "image" && cs.imageUrl) {
      s.push({ name: cs.title || "Slide", node: (
        <div className="relative h-full w-full bg-brand-navy bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${cs.imageUrl})` }}>
          {(cs.title || cs.body) && (
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-[6%] pb-[3cqw] pt-[9cqw] text-center text-white">
              {cs.title && <div className="font-extrabold drop-shadow" style={{ fontSize: "clamp(20px,3.6cqw,48px)" }}>{cs.title}</div>}
              {cs.body && <div className="mt-[1cqw] whitespace-pre-line text-white/90 drop-shadow" style={{ fontSize: "clamp(12px,1.9cqw,24px)" }}>{cs.body}</div>}
            </div>
          )}
        </div>
      ) });
    } else if (cs.kind === "text") {
      s.push({ name: cs.title || "Slide", node: (
        <div className="flex h-full w-full flex-col items-center justify-center bg-brand-navy px-[8%] text-center text-white">
          {cs.title && <div className="font-extrabold" style={{ fontSize: "clamp(22px,4cqw,52px)" }}>{cs.title}</div>}
          {cs.body && <div className="mt-[2cqw] whitespace-pre-line text-white/85" style={{ fontSize: "clamp(13px,2cqw,26px)" }}>{cs.body}</div>}
        </div>
      ) });
    }
  }

  // 3. Announcements
  s.push({ name: "Announcements", node: (
    <Navy title="Team Announcements"><Bullets items={d.announcements} empty="Add this week's announcements below in Edit deck content." /></Navy>
  )});

  // 4. Coming soon
  s.push({ name: "Coming Soon", node: (
    <Navy title="Change / Coming Soon"><Bullets items={d.comingSoon} empty="Add upcoming changes below in Edit deck content." /></Navy>
  )});

  // 5. Last week KPIs — split so each position (incl. Dispositions) is fully visible
  pushKpiSlides(s, "Last Week", d.lastWeek);

  // 6. This month KPIs — same split, month-to-date
  pushKpiSlides(s, `This Month (${d.monthly.label})`, d.monthly);

  // 7. Pipeline — paginated so ALL deals show (a fixed slide only fits ~6 rows).
  const PIPE_PAGE = 6;
  const pipePages = Math.max(1, Math.ceil(d.pipeline.length / PIPE_PAGE));
  for (let pi = 0; pi < pipePages; pi++) {
    const rows = d.pipeline.slice(pi * PIPE_PAGE, pi * PIPE_PAGE + PIPE_PAGE);
    const first = pi === 0;
    s.push({ key: first ? "pipeline" : `pipeline-${pi + 1}`, name: first ? "Active Pipeline" : "Active Pipeline (cont.)", node: (
      <Light title={first ? "Active Deal Pipeline" : `Active Deal Pipeline (cont. ${pi + 1}/${pipePages})`}>
        {first && (
          <div className="mb-[2%] grid grid-cols-3 gap-[2%]">
            {[
              { l: "Active deals", v: String(d.pipeline.length) },
              { l: "Total est. profit", v: money(d.pipeline.reduce((s2, p) => s2 + (p.profit ?? 0), 0)) },
              { l: "Aging (30d+)", v: String(d.pipeline.filter((p) => p.days != null && p.days >= 30).length) },
            ].map((c) => (
              <div key={c.l} className="rounded-lg bg-slate-50 p-[2.5%] text-center ring-1 ring-slate-200">
                <div className="text-slate-500" style={{ fontSize: "clamp(8px,1cqw,13px)" }}>{c.l}</div>
                <div className="font-extrabold tabular-nums text-slate-900" style={{ fontSize: "clamp(14px,2.3cqw,30px)" }}>{c.v}</div>
              </div>
            ))}
          </div>
        )}
        <div className="overflow-hidden rounded-lg ring-1 ring-slate-200">
          <table className="w-full" style={{ fontSize: "clamp(7px,1.05cqw,14px)" }}>
            <thead><tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-2.5 py-1">Property</th><th className="px-1.5 py-1">Status</th><th className="px-1.5 py-1">Rep</th>
              <th className="px-1.5 py-1 text-center">Days</th><th className="px-1.5 py-1 text-right">Contract</th><th className="px-1.5 py-1 text-right">Marketing $</th><th className="px-1.5 py-1 text-right">Profit</th><th className="px-1.5 py-1">Next step</th>
            </tr></thead>
            <tbody>
              {rows.map((p, i) => {
                const ageCls = p.level === "stale" ? "bg-red-100 text-red-700" : p.level === "reduce" ? "bg-orange-100 text-orange-700" : p.level === "watch" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700";
                return (
                  <tr key={i} className="border-t border-slate-100 align-top">
                    <td className="px-2.5 py-1 font-semibold text-slate-800">{p.address}</td>
                    <td className="px-1.5 py-1"><span className="rounded-full bg-sky-100 px-1.5 py-0.5 font-semibold text-sky-800" style={{ fontSize: "clamp(6px,0.85cqw,11px)" }}>{p.status.replace(/_/g, " ")}</span></td>
                    <td className="px-1.5 py-1 text-slate-600">{p.rep}</td>
                    <td className="px-1.5 py-1 text-center">{p.days == null ? <span className="text-slate-400">—</span> : <span className={`rounded-full px-1.5 py-0.5 font-bold ${ageCls}`} style={{ fontSize: "clamp(6px,0.85cqw,11px)" }}>{p.days}d</span>}</td>
                    <td className="px-1.5 py-1 text-right tabular-nums text-slate-600">{p.contractPrice != null ? money(p.contractPrice) : "—"}</td>
                    <td className="px-1.5 py-1 text-right font-semibold tabular-nums text-sky-700">{p.askingPrice != null ? money(p.askingPrice) : "—"}</td>
                    <td className="px-1.5 py-1 text-right font-bold tabular-nums text-emerald-700">{p.profit != null ? money(p.profit) : "—"}</td>
                    <td className="px-1.5 py-1 text-slate-500">{p.nextSteps || "—"}</td>
                  </tr>
                );
              })}
              {!d.pipeline.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">No active deals.</td></tr>}
            </tbody>
          </table>
        </div>
      </Light>
    )});
  }

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
        {d.trainingTip ? d.trainingTip.text : "Add training tips below in Edit deck content."}
      </div>
    </div>
  )});

  // Closing — the all-call ends here. Leadership content is its own deck now.
  s.push({ name: "That's the all-call", node: (
    <div className="flex h-full w-full flex-col items-center justify-center bg-brand-navy text-center text-white">
      <div className="font-extrabold" style={{ fontSize: "clamp(22px,4cqw,56px)" }}>That&apos;s the all-call 🙌</div>
      <div className="mt-2 text-brand-gold-soft" style={{ fontSize: "clamp(12px,1.7cqw,22px)" }}>Let&apos;s have a great week.</div>
    </div>
  )});

  // Verse of the week — always close on this.
  s.push({ name: "Verse of the week", node: (
    <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-brand-navy-950 via-brand-navy to-amber-900 px-[10%] text-center text-white">
      <div className="text-brand-gold" style={{ fontSize: "clamp(10px,1.5cqw,18px)", letterSpacing: "0.25em" }}>VERSE OF THE WEEK</div>
      <div className="mt-[4%] max-w-[85%] font-bold italic leading-snug" style={{ fontSize: "clamp(16px,3cqw,42px)" }}>&ldquo;{d.verse.text}&rdquo;</div>
      <div className="mt-[3%] font-semibold text-brand-gold-soft" style={{ fontSize: "clamp(12px,1.8cqw,24px)" }}>— {d.verse.ref}</div>
    </div>
  )});

  return s;
}
