"use client";
// 🎭 DEMO showcase — a navigable, brand-styled mock of the War Room running on 100% fake data
// (src/lib/demo-data.ts). Imports NO real DB/auth. Safe to show anyone. Public at /demo.
import { useState } from "react";
import {
  DEMO_COMPANY, DEMO_NAV, DEMO_BUILT, DEMO_KPI_REPS, DEMO_TILES, DEMO_FUNNEL,
  DEMO_PIPELINE, DEMO_DEALS, DEMO_MARKETS, DEMO_TEAM,
} from "@/lib/demo-data";

const money = (n: number) => `$${Math.round(n).toLocaleString()}`;
const TONE: Record<string, string> = { good: "text-emerald-300", warn: "text-amber-300", neutral: "text-sky-300", gold: "text-amber-200" };
const HEAT: Record<string, string> = { hot: "bg-red-500/20 text-red-300 ring-red-500/40", warm: "bg-amber-500/20 text-amber-200 ring-amber-500/40", cold: "bg-slate-500/20 text-slate-300 ring-slate-500/40" };

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10 ${className}`}>{children}</div>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 text-lg font-bold text-white">{children}</h2>;
}

export default function DemoApp() {
  const [section, setSection] = useState("Dashboard");
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-navy text-slate-200" style={{ background: "linear-gradient(180deg,#0b1f3a,#07182e)" }}>
      {/* Top demo banner */}
      <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] backdrop-blur">
        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-black text-black">🎭 DEMO</span>
        <span className="font-semibold text-amber-100">Sample data only — nothing here is real. This is a walkthrough of what the War Room does.</span>
        <button onClick={() => setNavOpen((o) => !o)} className="ml-auto rounded bg-white/10 px-2 py-1 text-white ring-1 ring-white/20 md:hidden">☰ Menu</button>
      </div>

      <div className="mx-auto flex max-w-[1300px]">
        {/* Sidebar */}
        <aside className={`${navOpen ? "block" : "hidden"} w-60 shrink-0 border-r border-white/10 p-3 md:block`}>
          <div className="mb-4 px-1">
            <div className="text-lg font-black tracking-tight text-white">⚔️ War Room</div>
            <div className="text-[11px] font-semibold text-amber-300/80">{DEMO_COMPANY} · demo workspace</div>
          </div>
          <nav className="space-y-3">
            {DEMO_NAV.map((g) => (
              <div key={g.group}>
                <div className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">{g.group}</div>
                <div className="space-y-0.5">
                  {g.items.map((it) => {
                    const built = DEMO_BUILT.has(it);
                    const active = section === it;
                    return (
                      <button key={it} onClick={() => { setSection(it); setNavOpen(false); }}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[13px] transition ${active ? "bg-brand-gold text-black font-bold" : "text-slate-200 hover:bg-white/10"}`}>
                        <span>{it}</span>
                        {!built && <span className="text-[9px] text-slate-400">●</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 p-4 md:p-6">
          {section === "Dashboard" && <Dashboard />}
          {section === "Team Roster" && <Team />}
          {section === "Seller CRM" && <Crm />}
          {section === "Deals" && <Deals />}
          {section === "Target Markets" && <Markets />}
          {!DEMO_BUILT.has(section) && <ComingSoon name={section} />}
        </main>
      </div>
    </div>
  );
}

function Dashboard() {
  const maxFunnel = DEMO_FUNNEL[0].count;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-white">Today&apos;s Scoreboard</h1>
        <p className="text-[13px] text-slate-400">Live operating picture — KPIs, pipeline, and team pace at a glance.</p>
      </div>
      {/* Tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {DEMO_TILES.map((t) => (
          <Card key={t.label}>
            <div className="text-[11px] font-semibold text-slate-400">{t.label}</div>
            <div className={`mt-1 text-2xl font-black ${TONE[t.tone]}`}>{t.value}</div>
            <div className="text-[11px] text-slate-500">{t.sub}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Funnel */}
        <Card>
          <SectionTitle>This month&apos;s funnel</SectionTitle>
          <div className="space-y-2">
            {DEMO_FUNNEL.map((f) => (
              <div key={f.stage} className="flex items-center gap-3">
                <div className="w-28 shrink-0 text-[12px] text-slate-300">{f.stage}</div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
                  <div className="h-full rounded bg-gradient-to-r from-brand-gold to-amber-300" style={{ width: `${Math.max(3, (f.count / maxFunnel) * 100)}%` }} />
                </div>
                <div className="w-14 shrink-0 text-right text-[12px] font-bold text-white">{f.count.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </Card>
        {/* Rep pace */}
        <Card>
          <SectionTitle>Team pace — today</SectionTitle>
          <div className="space-y-2">
            {DEMO_KPI_REPS.map((r) => (
              <div key={r.name} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <div className="text-[12px] font-semibold text-white">{r.name}</div>
                  <div className="text-[10px] text-slate-500">{r.role}</div>
                </div>
                <div className="h-5 flex-1 overflow-hidden rounded bg-white/5">
                  <div className={`h-full rounded ${r.pace >= 85 ? "bg-emerald-400" : r.pace >= 65 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${r.pace}%` }} />
                </div>
                <div className="w-24 shrink-0 text-right text-[11px] text-slate-400">{r.dials} dials · {r.offers} off</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Crm() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-white">Seller CRM</h1>
        <p className="text-[13px] text-slate-400">Every seller lead on one board — drag through the pipeline, auto follow-ups, offer tracking.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {DEMO_PIPELINE.map((col) => (
          <div key={col.stage} className="rounded-xl bg-white/[0.02] p-2 ring-1 ring-white/10">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[12px] font-bold text-white" style={{ color: col.color }}>● {col.stage}</span>
              <span className="text-[11px] text-slate-500">{col.leads.length}</span>
            </div>
            <div className="space-y-2">
              {col.leads.map((l, i) => (
                <div key={i} className="rounded-lg bg-brand-navy-2 p-2.5 ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-white">{l.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1 ${HEAT[l.heat]}`}>{l.heat}</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{l.address}</div>
                  <div className="mt-1 text-[12px] font-bold text-emerald-300">{money(l.value)}</div>
                  <div className="mt-1 text-[11px] text-slate-400">{l.note}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Deals() {
  const totalFee = DEMO_DEALS.reduce((s, d) => s + d.fee, 0);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-white">Deals &amp; Revenue</h1>
        <p className="text-[13px] text-slate-400">Closed deals with assignment fees — the money, tracked.</p>
      </div>
      <Card className="flex flex-wrap items-center gap-x-8 gap-y-2">
        <div><div className="text-[11px] text-slate-400">Deals closed</div><div className="text-2xl font-black text-white">{DEMO_DEALS.length}</div></div>
        <div><div className="text-[11px] text-slate-400">Assignment fees</div><div className="text-2xl font-black text-emerald-300">{money(totalFee)}</div></div>
        <div><div className="text-[11px] text-slate-400">Avg per deal</div><div className="text-2xl font-black text-amber-200">{money(totalFee / DEMO_DEALS.length)}</div></div>
      </Card>
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-left text-[12px]">
          <thead className="border-b border-white/10 text-[11px] uppercase tracking-wide text-slate-400">
            <tr><th className="p-3">Property</th><th className="p-3">Buyer</th><th className="p-3">Type</th><th className="p-3 text-right">Sold</th><th className="p-3 text-right">Our fee</th><th className="p-3 text-right">Closed</th></tr>
          </thead>
          <tbody>
            {DEMO_DEALS.map((d, i) => (
              <tr key={i} className="border-b border-white/5">
                <td className="p-3 font-semibold text-white">{d.address}</td>
                <td className="p-3 text-slate-300">{d.buyer}</td>
                <td className="p-3 text-slate-400">{d.type}</td>
                <td className="p-3 text-right text-slate-300">{money(d.sold)}</td>
                <td className="p-3 text-right font-bold text-emerald-300">{money(d.fee)}</td>
                <td className="p-3 text-right text-slate-500">{d.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Markets() {
  const COV: Record<string, { label: string; cls: string }> = {
    clear: { label: "Clear to pull", cls: "text-emerald-300" },
    cooldown: { label: "In cooldown", cls: "text-amber-300" },
    never: { label: "Never pulled", cls: "text-slate-400" },
  };
  const TREND: Record<string, string> = { up: "📈", flat: "➡️", down: "📉" };
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-white">Target Markets</h1>
        <p className="text-[13px] text-slate-400">Where we hunt land — pull coverage, cooldown, and 30-60-180 momentum.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_MARKETS.map((m) => (
          <Card key={m.name}>
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-white">{m.name}</span>
              <span className="text-lg">{TREND[m.trend]}</span>
            </div>
            <div className={`mt-1 text-[12px] font-semibold ${COV[m.status].cls}`}>● {COV[m.status].label}</div>
            <div className="mt-2 flex gap-4 text-[12px] text-slate-300">
              <span>📥 <b className="text-white">{m.leads}</b> leads</span>
              <span>🏆 <b className="text-white">{m.deals}</b> deals</span>
            </div>
          </Card>
        ))}
      </div>
      <p className="text-[11px] text-slate-500">In the full app this is a live satellite map — pull a lead list and it plots every property, tracks cooldown, and ties Direct REI responses back to each campaign.</p>
    </div>
  );
}

function Team() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-white">Team Roster</h1>
        <p className="text-[13px] text-slate-400">Who&apos;s on, revenue per person, and today&apos;s status.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {DEMO_TEAM.map((t) => (
          <Card key={t.name} className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-gold/20 text-lg font-black text-amber-200">{t.name.split(" ").map((n) => n[0]).join("")}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[14px] font-bold text-white">{t.name}</span>
                <span className={`h-2 w-2 shrink-0 rounded-full ${t.status === "on" ? "bg-emerald-400" : "bg-slate-500"}`} title={t.status === "on" ? "Online" : "Offline"} />
              </div>
              <div className="text-[11px] text-slate-400">{t.role}</div>
              {t.revenue > 0 && <div className="text-[12px] font-bold text-emerald-300">{money(t.revenue)} <span className="font-normal text-slate-500">revenue</span></div>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="text-5xl">🧩</div>
      <h1 className="mt-3 text-2xl font-black text-white">{name}</h1>
      <p className="mt-2 max-w-md text-[13px] text-slate-400">
        This is one of 60+ tools in the full War Room. In this demo we&apos;ve built out the headline
        screens — open <b className="text-amber-200">Dashboard</b>, <b className="text-amber-200">Seller CRM</b>,
        <b className="text-amber-200"> Deals</b>, <b className="text-amber-200">Target Markets</b> or
        <b className="text-amber-200"> Team Roster</b> to see the real thing in action.
      </p>
    </div>
  );
}
