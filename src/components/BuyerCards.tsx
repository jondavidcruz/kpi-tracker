"use client";
// Buyer "trading cards" — the dispo-on-a-call view. One card per vetted buyer:
// score ring (10-point vetting scorecard), tier badge, 3–4 chips, last 3 touches,
// contact line. Filters by tier / county / text. Toggle with the spreadsheet.
import { useMemo, useState, useSyncExternalStore } from "react";
import type { Scorecard, Tier } from "@/lib/buyers/scorecard";

export type CardBuyer = Scorecard & {
  company?: string; type?: string; phone?: string; email?: string; igHandle?: string; bestContact?: string;
  mapUrl?: string; // Sharyn's hand-made area map (always wins)
  autoMapUrl?: string; // 🤖 generated from the buy box — blue counties, red city pins
};

const TIER_CLS: Record<Tier, string> = {
  A: "bg-emerald-600 text-white ring-emerald-700",
  B: "bg-amber-400 text-slate-900 ring-amber-500",
  C: "bg-slate-200 text-slate-600 ring-slate-300",
};
const RING_CLR: Record<Tier, string> = { A: "#059669", B: "#f59e0b", C: "#94a3b8" };

function Ring({ pct, tier, size = 56 }: { pct: number; tier: Tier; size?: number }) {
  const r = (size - 8) / 2, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-label={`${pct}% vetted`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_CLR[tier]} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-800" style={{ fontSize: size * 0.3, fontWeight: 800 }}>{pct / 10}</text>
    </svg>
  );
}

function readView(): "cards" | "list" { try { return localStorage.getItem("vb_view") === "list" ? "list" : "cards"; } catch { return "cards"; } }
function subscribeView(cb: () => void) { window.addEventListener("vb_view", cb); window.addEventListener("storage", cb); return () => { window.removeEventListener("vb_view", cb); window.removeEventListener("storage", cb); }; }

export function TierBadge({ tier, title }: { tier: Tier; title?: string }) {
  return <span title={title} className={`inline-grid h-6 w-6 place-items-center rounded-md text-[12px] font-black ring-1 ${TIER_CLS[tier]}`}>{tier}</span>;
}

export default function BuyerCards({ buyers, selectedCounty, onCountyClear }: { buyers: CardBuyer[]; selectedCounty?: string; onCountyClear?: () => void }) {
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<"" | Tier>("");
  const [open, setOpen] = useState<string | null>(null);
  // Per-viewer convenience only (localStorage); defaults to cards on the server.
  const view = useSyncExternalStore(subscribeView, readView, () => "cards" as const);
  const pick = (v: "cards" | "list") => { try { localStorage.setItem("vb_view", v); } catch {} ; window.dispatchEvent(new Event("vb_view")); };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return buyers
      .filter((b) => !tier || b.tier === tier)
      .filter((b) => !selectedCounty || b.counties.includes(selectedCounty))
      .filter((b) => !needle || [b.name, b.company, ...b.counties, ...b.cities, ...b.chips].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => a.tier.localeCompare(b.tier) || b.score - a.score || a.name.localeCompare(b.name));
  }, [buyers, q, tier, selectedCounty]);

  const counts = { A: buyers.filter((b) => b.tier === "A").length, B: buyers.filter((b) => b.tier === "B").length, C: buyers.filter((b) => b.tier === "C").length };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔎 name, company, county, chip…" className="w-64 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
        <div className="flex overflow-hidden rounded-lg ring-1 ring-slate-200">
          {(["", "A", "B", "C"] as const).map((t) => (
            <button key={t || "all"} onClick={() => setTier(t)} className={`px-2.5 py-1.5 text-xs font-bold ${tier === t ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
              {t ? `${t} · ${counts[t]}` : `All · ${buyers.length}`}
            </button>
          ))}
        </div>
        {selectedCounty && (
          <button onClick={onCountyClear} className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200">📍 {selectedCounty} ✕</button>
        )}
        <div className="ml-auto flex overflow-hidden rounded-lg ring-1 ring-slate-200">
          <button onClick={() => pick("cards")} className={`px-2.5 py-1.5 text-xs font-semibold ${view === "cards" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>🃏 Cards</button>
          <button onClick={() => pick("list")} className={`px-2.5 py-1.5 text-xs font-semibold ${view === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600"}`}>☰ Compact</button>
        </div>
      </div>

      {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No buyers match.</p>}

      {view === "cards" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((b) => {
            const reach = [b.phone, b.email, b.igHandle].filter(Boolean).join(" · ");
            const isOpen = open === b.id;
            return (
              <div key={b.id} className={`rounded-xl bg-white p-3 ring-1 transition ${b.tier === "A" ? "ring-emerald-200" : b.tier === "B" ? "ring-amber-200" : "ring-slate-200"} ${b.paused ? "opacity-70" : ""}`}>
                <div className="flex items-start gap-3">
                  <Ring pct={b.pct} tier={b.tier} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={b.tier} title={b.tierWhy} />
                      <div className="truncate text-sm font-bold text-slate-800">{b.name}</div>
                    </div>
                    {b.company && b.company !== b.name && <div className="truncate text-[11px] text-slate-500">{b.company}</div>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {b.chips.map((c, i) => <span key={i} className="rounded bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 ring-1 ring-slate-200">{c}</span>)}
                    </div>
                  </div>
                </div>
                {/* 10-box scorecard */}
                <div className="mt-2 grid grid-cols-10 gap-0.5" title={b.checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.label}: ${c.detail}`).join("\n")}>
                  {b.checks.map((c) => <div key={c.key} className={`h-1.5 rounded-sm ${c.ok ? "bg-emerald-500" : "bg-slate-200"}`} />)}
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{b.score}/10 vetted{b.checks.filter((c) => !c.ok).length ? ` · missing: ${b.checks.filter((c) => !c.ok).map((c) => c.label).slice(0, 3).join(", ")}` : " · complete"}</span>
                  <span className={b.daysSinceTouch === null ? "text-slate-400" : b.daysSinceTouch > 60 ? "font-bold text-red-600" : b.daysSinceTouch > 30 ? "font-bold text-amber-600" : "text-emerald-700"}>
                    {b.daysSinceTouch === null ? "🧊 never touched" : b.daysSinceTouch > 30 ? `🧊 ${b.daysSinceTouch}d` : `✓ ${b.daysSinceTouch}d ago`}
                  </span>
                </div>
                {reach && <div className="mt-1.5 truncate text-[11px] text-brand-navy" title={reach}>{reach}</div>}
                {/* Coverage map, right on the card (Jon: "physically see where they buy"). Sharyn's upload wins; 🤖 fills the rest. */}
                {(b.mapUrl || b.autoMapUrl) && (
                  <a href={b.mapUrl || b.autoMapUrl} target="_blank" rel="noreferrer" className="group mt-2 block" title={b.mapUrl ? "Sharyn's area map — click to open full size" : "Auto-generated from the buy box — blue = counties they buy, red pins = cities. Click to enlarge."}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.mapUrl || b.autoMapUrl} alt={`${b.name} coverage map`} loading="lazy" className="h-24 w-full rounded-lg object-cover ring-1 ring-slate-200 transition group-hover:ring-brand-navy" />
                    <span className="mt-0.5 block text-[10px] font-semibold text-slate-400">{b.mapUrl ? "🗺️ area map" : "🤖 auto coverage — where they buy"}</span>
                  </a>
                )}
                <button onClick={() => setOpen(isOpen ? null : b.id)} className="mt-1.5 text-[11px] font-semibold text-slate-400 hover:text-brand-navy">{isOpen ? "▴ less" : "▾ scorecard & last touches"}</button>
                {isOpen && (
                  <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                    <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
                      {b.checks.map((c) => <li key={c.key} className={c.ok ? "text-slate-700" : "text-slate-400"}><span className={c.ok ? "text-emerald-600" : "text-slate-300"}>{c.ok ? "✓" : "○"}</span> <b>{c.label}</b> <span className="text-slate-500">{c.detail}</span></li>)}
                    </ul>
                    {b.bestContact && <div className="text-[11px] text-slate-600">📇 {b.bestContact}</div>}
                    {b.lastTouches.length > 0 && (
                      <ul className="space-y-0.5 text-[11px] text-slate-600">
                        {b.lastTouches.map((t, i) => <li key={i}><span className="font-mono text-slate-400">{t.at}</span> {t.channel ? `${t.channel} · ` : ""}{t.outcome ? `${t.outcome} · ` : ""}{(t.note ?? "").slice(0, 80)}</li>)}
                      </ul>
                    )}
                    {b.mapUrl && <a href={b.mapUrl} target="_blank" rel="noreferrer" className="inline-block text-[11px] font-semibold text-indigo-600">🗺️ open area map</a>}

                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl bg-white ring-1 ring-slate-200">
          {rows.map((b) => (
            <div key={b.id} className={`flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs ${b.paused ? "opacity-70" : ""}`}>
              <TierBadge tier={b.tier} title={b.tierWhy} />
              <span className="w-44 truncate font-semibold text-slate-800">{b.name}</span>
              <div className="grid w-20 grid-cols-10 gap-0.5">{b.checks.map((c) => <div key={c.key} className={`h-1.5 rounded-sm ${c.ok ? "bg-emerald-500" : "bg-slate-200"}`} />)}</div>
              <span className="w-8 text-right font-bold tabular-nums text-slate-700">{b.score}</span>
              <span className="flex-1 truncate text-slate-600">{b.chips.join("  ·  ")}</span>
              <span className={`w-16 text-right ${b.daysSinceTouch === null ? "text-slate-400" : b.daysSinceTouch > 30 ? "font-bold text-amber-600" : "text-emerald-700"}`}>{b.daysSinceTouch === null ? "never" : `${b.daysSinceTouch}d`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
