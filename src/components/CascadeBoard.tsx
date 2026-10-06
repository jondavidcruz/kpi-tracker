"use client";
// Buyer Cascade (vetted-buyers Phase 3) — type a deal, get the ranked call list.
// One search → geocode → every active buyer scored against the deal's location,
// price, acreage, and asset type, with WHY chips on every card.
import { useRef, useState, useTransition } from "react";
import { cascadeRank, logBuyerOutreach } from "@/app/actions";

type Chip = { ok: boolean | "warn"; label: string };
type Card = { id: string; name: string; company: string; type: string; phone: string; email: string; score: number; tier: 1 | 2 | 3; why: Chip[]; geoBasis: string };
type Geo = { lat: number; lng: number; formatted: string; county: string; city: string; state: string; zip: string };
type Excluded = { name: string; reason: string };

const TIER_LABEL: Record<1 | 2 | 3, { text: string; cls: string }> = {
  1: { text: "Send first", cls: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
  2: { text: "Near miss — worth a call", cls: "bg-amber-100 text-amber-800 ring-amber-200" },
  3: { text: "Long shot", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
};
const ASSET_TYPES = [
  ["", "Any asset type"], ["raw_land", "🌱 Raw land"], ["finished_lots", "📐 Finished lots"], ["entitled_land", "📋 Entitled land"],
  ["teardown", "🔨 Teardown"], ["sfr", "🏠 SFR"], ["multifamily", "🏢 Multifamily"], ["commercial", "🏬 Commercial"],
] as const;

function Ring({ score, tier }: { score: number; tier: 1 | 2 | 3 }) {
  const r = 24, c = 2 * Math.PI * r, off = c * (1 - score / 100);
  const clr = tier === 1 ? "#059669" : tier === 2 ? "#f59e0b" : "#94a3b8";
  return (
    <svg width="60" height="60" viewBox="0 0 60 60" className="shrink-0" aria-label={`fit score ${score}`}>
      <circle cx="30" cy="30" r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle cx="30" cy="30" r={r} fill="none" stroke={clr} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 30 30)" />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-800" style={{ fontSize: 16, fontWeight: 800 }}>{score}</text>
    </svg>
  );
}

export default function CascadeBoard() {
  const [pending, startTransition] = useTransition();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [nearest, setNearest] = useState<{ name: string; miles: number } | null>(null);
  const [excluded, setExcluded] = useState<Excluded[]>([]);
  const [showExcluded, setShowExcluded] = useState(false);
  const [error, setError] = useState("");
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const addr = useRef("");

  const run = (fd: FormData) => {
    addr.current = String(fd.get("address") ?? "");
    startTransition(async () => {
      setError("");
      const res = await cascadeRank(fd);
      if (!res.ok) { setError(res.error ?? "search failed"); return; }
      setCards(res.ranked ?? []);
      setGeo(res.geocode ?? null);
      setNearest(res.nearest ?? null);
      setExcluded(res.excluded ?? []);
    });
  };

  const copy = async (text: string, tag: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(""), 1500); } catch { /* ignore */ }
  };
  const rowText = (c: Card) => `${c.name}${c.company ? ` (${c.company})` : ""} — ${c.phone || "no phone"} · ${c.email || "no email"} · fit ${c.score}`;
  const topN = (n: number) => (cards ?? []).slice(0, n).map((c, i) => `${i + 1}. ${rowText(c)}`).join("\n");
  const csv = () => {
    const head = "rank,name,company,type,phone,email,score,tier,why";
    const lines = (cards ?? []).map((c, i) => [i + 1, c.name, c.company, c.type, c.phone, c.email, c.score, c.tier, c.why.map((w) => w.label).join(" | ")].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([head + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cascade_${(geo?.county || addr.current || "search").replace(/[^a-z0-9]+/gi, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const mailto = (c: Card) => {
    const subj = encodeURIComponent(`Off-market deal — ${geo?.formatted || addr.current}`);
    const body = encodeURIComponent(`Hi ${c.name.split(" ")[0]},\n\nWe just locked up a property at ${geo?.formatted || addr.current} that fits what you buy. Want the details?\n\n— Freedom Offers`);
    return `mailto:${c.email}?subject=${subj}&body=${body}`;
  };
  const logTouchFor = (id: string) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("note", `cascade: sent ${geo?.formatted || addr.current}`);
    startTransition(async () => { await logBuyerOutreach(fd); setTouched((t) => new Set(t).add(id)); });
  };

  return (
    <div className="space-y-4">
      <form ref={formRef} action={run} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-[1fr_130px_110px_170px_auto]">
          <input name="address" required placeholder="Address, area, or ZIP — e.g. 2118 Old Fort Pkwy Murfreesboro TN, or just 37129" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input name="price" type="number" min="0" placeholder="$ price" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <input name="acres" type="number" min="0" step="0.01" placeholder="Acres" className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
          <select name="assetType" className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm">
            {ASSET_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button disabled={pending} className="rounded-xl bg-brand-navy px-5 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {pending ? "Ranking…" : "🎯 Rank buyers"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">Every active buyer is scored on location (drawn area → radius → ZIP → city → county → region → state), price band, acreage, asset type, close speed, and touch recency.</p>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
      </form>

      {geo && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-brand-navy px-3 py-1 font-bold text-white">📍 {geo.formatted || addr.current}</span>
          {geo.county && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{geo.county.split(",")[0]} County</span>}
          {cards && cards.length > 0 && (
            <>
              <span className="text-slate-400">·</span>
              <span className="font-semibold text-slate-600">{cards.filter((c) => c.tier === 1).length} match · {cards.filter((c) => c.tier === 2).length} near-miss · {cards.filter((c) => c.tier === 3).length} long shot</span>
              <span className="ml-auto flex gap-2">
                <button onClick={() => copy(topN(5), "top")} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">{copied === "top" ? "✅ Copied" : "📋 Copy top 5"}</button>
                <button onClick={csv} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">⬇ Ranked CSV</button>
              </span>
            </>
          )}
        </div>
      )}

      {cards && cards.length === 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <b>No buyer covers {geo?.county ? geo.county.split(",")[0] + " County" : "this area"} yet.</b>
          {nearest ? <> Nearest buyer: <b>{nearest.name}</b> ({nearest.miles} mi away) — maybe worth the call anyway.</> : <> No nearby centroids either — this is new territory.</>}
          <span className="block mt-1 text-amber-700/70">Fastest fix: pull cash land buyers for this county and vet them into the list.</span>
        </div>
      )}

      <div className="space-y-2.5">
        {(cards ?? []).map((c, i) => (
          <div key={c.id} className={`rounded-2xl border bg-white p-3.5 shadow-sm ${c.tier === 1 ? "border-emerald-200" : c.tier === 2 ? "border-amber-200" : "border-slate-200"}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-800 text-[13px] font-extrabold text-white">{i + 1}</span>
              <Ring score={c.score} tier={c.tier} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-extrabold text-slate-800">{c.name}</span>
                  {c.company && <span className="text-sm text-slate-400">{c.company}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${TIER_LABEL[c.tier].cls}`}>{TIER_LABEL[c.tier].text}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {c.why.map((w, wi) => (
                    <span key={wi} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${w.ok === true ? "bg-emerald-50 text-emerald-700" : w.ok === "warn" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700"}`}>{w.label}</span>
                  ))}
                </div>
                <div className="mt-1 text-[12px] text-slate-500">{c.phone && <span className="font-semibold">{c.phone}</span>}{c.phone && c.email && " · "}{c.email}</div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                <button onClick={() => logTouchFor(c.id)} disabled={touched.has(c.id)} title="I called/texted this buyer — logs the touch to your KPIs and sets their next follow-up 3 days out" className="rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-700 ring-1 ring-sky-200 hover:bg-sky-100 disabled:opacity-60">{touched.has(c.id) ? "✅ Logged" : "📇 Log touch"}</button>
                {c.email && <a href={mailto(c)} title="Opens your email app with the offer message pre-written to this buyer" className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700 ring-1 ring-violet-200 hover:bg-violet-100">✉ Draft email</a>}
                <button onClick={() => copy(rowText(c), c.id)} title="Copy this buyer's name, phone & email — paste into a text message" className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100">{copied === c.id ? "✅ Copied" : "📋 Copy"}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cards && excluded.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
          <button onClick={() => setShowExcluded((v) => !v)} className="font-bold text-slate-600 hover:text-slate-800">
            ⛔ {excluded.length} blacklisted buyer{excluded.length === 1 ? "" : "s"} excluded {showExcluded ? "▴" : "▾"}
          </button>
          {showExcluded && (
            <ul className="mt-1.5 space-y-0.5">
              {excluded.map((e, i) => <li key={i}><b>{e.name}</b>{e.reason ? ` — ${e.reason}` : ""}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
