"use client";

import { useState, useEffect, useRef, createContext, useContext } from "react";

// Ordered LAND-first for the land pivot, then the home strategies. `group` drives
// the grouped tab bar so the sheet leads with what the team uses most now.
const TABS = [
  { key: "cash_land", group: "Land", label: "Cash (Land)", emoji: "🌵", blurb: "Cash offer on vacant land. Comp recent LAND sales in the area, average them, and offer ~33% of that average. MAO = avg land sale × 33%. Anchor opens below MAO." },
  { key: "developer", group: "Land", label: "Developer", emoji: "🏗️", blurb: "Land-for-luxury-builds cash offer (Lux Blueprint). Value the LOT from 3 comp methods → dispo price, then MAO = dispo − a $100–150k spread. No repairs — the developer tears down. Aim for a six-figure fee." },
  { key: "assignment", group: "Homes", label: "Cash (Homes)", emoji: "🏠", blurb: "Cash offer on a house. MAO = (ARV × market %) − repairs − your fee. The market % already covers the flipper's carry + profit. Anchor opens below MAO." },
  { key: "novation", group: "Homes", label: "Novation", emoji: "📋", blurb: "List at current similar-condition value, cover the seller's closing + commission (no holding — retail buyer). Find the max seller payout." },
  { key: "creative", group: "Homes", label: "Creative", emoji: "🔑", blurb: "Seller-finance or Subject-to. We assign the terms to an end buyer and collect an assignment fee." },
  { key: "listing", group: "Homes", label: "Listing", emoji: "🏷️", blurb: "Traditional listing with our agent. We collect a referral / marketing fee." },
  { key: "flip", group: "Homes", label: "Flip / Wholetail", emoji: "🔨", blurb: "Full buyer's-lens analysis: Max Offer = ARV + purchase credit − min profit − (property costs + money costs)." },
  { key: "rental", group: "Homes", label: "Buy & Hold / Wrap", emoji: "🏘️", blurb: "Landlord / BRRRR buyer's lens: cap rate, the 1% rule, the max offer at their target cap — AND the wrap check: the max monthly terms we can lock up and still assign to a cash-flowing end buyer." },
] as const;

// Wholesale (Assignment) vs Novation — quick decision guide (from the team's sheet).
const EXIT_COMPARE: [string, string, string][] = [
  ["Speed of exit", "30–45 days (faster with a deeper discount)", "3–6 months (retail MLS timeline)"],
  ["Buyer type", "Cash buyer or flipper", "Retail buyer using financing (loan + appraisal)"],
  ["Access needed", "Limited — 1–2 walkthroughs", "Full access (photos, showings, appraisal, inspection)"],
  ["Complexity", "Lower — assignment or double close", "Higher — MLS listing, agent coordination, disclosures"],
  ["Ideal property", "Distressed / needs repairs, seller wants a quick sale", "Good or light-cosmetic condition, seller wants top dollar"],
  ["Price to seller", "Lower offer — trade-off for speed & certainty", "Higher net — but seller waits and cooperates with the listing"],
];

// Hard-money lender presets from the team's sheet → [rate%, points%, service fee$]
const LENDERS: Record<string, { rate: string; points: string; svc: string }> = {
  "Kiavi (Novice)": { rate: "9.45", points: "2.5", svc: "1500" },
  "Iron Bridge": { rate: "9", points: "2", svc: "0" },
  "Zinc Financial": { rate: "11.5", points: "1.75", svc: "0" },
};

const MARKET_TIERS: [string, string][] = [
  ["85", "Prime Coastal / Ultra-Desirable — 85%"],
  ["80", "Highly Competitive Urban — 80%"],
  ["75", "Strong Suburban / Metro — 75%"],
  ["70", "Mid-Tier Cities — 70%"],
  ["65", "Rural Markets — 65%"],
  ["60", "Extremely Rural — 60%"],
];
const MARKET_GUIDE: [string, string, string][] = [
  ["Prime Coastal / Ultra-Desirable (85%+)", "Beachfront, water-adjacent or trophy neighborhoods — relentless demand, instant resale, deep developer/cash-buyer pool. Offer aggressively to win; the exit is safe. Push to 88–90% on oceanfront/trophy.", "La Jolla, Del Mar, Coronado, Laguna, Newport Coast"],
  ["Highly Competitive Urban (80%)", "Dense, fast-moving metros with high investor demand and strong retail-buyer interest. Competitive offers needed to win.", "Downtown SD, central LA/OC core"],
  ["Strong Suburban / Metro (75%)", "Established, predictable markets with good resale activity and investor appetite.", "Most SD/OC suburbs"],
  ["Mid-Tier Cities (70%)", "Secondary markets — steady demand but fewer buyers/flippers, so margin matters more.", "Inland secondary cities"],
  ["Rural Markets (65%)", "Limited buyer pool, longer dispo times — more conservative offers required.", "Outlying / small towns"],
  ["Extremely Rural (60% or lower)", "Low velocity, few cash buyers, very limited retail exit — large discount required.", "Remote areas"],
];
// [$/sf, label, what this scope typically covers]
const REHAB_LEVELS: [string, string, string][] = [
  ["", "— pick condition —", ""],
  ["17", "Cleanup (~$17/sf)", "Trash-out, deep clean, paint touch-ups, minor fixes. Essentially rent-ready cosmetic."],
  ["22", "Lipstick (~$22/sf)", "Paint, flooring, light fixtures, landscaping. No kitchen/bath gut."],
  ["30", "Interior (~$30/sf)", "Full interior refresh — kitchen/bath refresh, flooring, paint throughout."],
  ["35", "Full (~$35/sf)", "Kitchen + baths redone, flooring, paint, plus some systems (a typical flip)."],
  ["45", "Full + 2 big items (~$45/sf)", "Full interior plus 2 majors (e.g. roof, HVAC, or windows)."],
  ["55", "Full + 4 big items (~$55/sf)", "Full interior plus ~4 majors. Heavy rehab."],
  ["65", "Full + 6 big items (~$65/sf)", "Full interior plus most systems replaced. Near-gut."],
  ["75", "Full gut (~$75/sf)", "Down to the studs — everything new."],
];
function rehabDesc(sf: string): string {
  return REHAB_LEVELS.find(([val]) => val === sf)?.[2] ?? "";
}

// Big-ticket repair items → [field key, label, typical cost]. Checking one adds
// its cost to the rehab estimate (cost is editable).
const MAJOR: [string, string, number][] = [
  ["hvac", "HVAC", 7000],
  ["water_heater", "Water heater", 1800],
  ["roof", "Roof", 12000],
  ["windows", "Windows", 8000],
  ["foundation", "Foundation", 15000],
];

function num(v: string): number {
  const n = Number((v || "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
const money = (n: number) => (Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "—");
const esc = (s: string) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-200";

// Field/Res live at MODULE scope (not inside the component) so they keep a stable
// identity across renders. Defining them inside the component made React remount
// every input on each keystroke, which stole focus after a single character.
type FieldApi = { v: (k: string) => string; set: (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void };
const FieldCtx = createContext<FieldApi>({ v: () => "", set: () => () => {} });

function Field({ k, label, prefix, suffix, placeholder, span, req }: { k: string; label: string; prefix?: string; suffix?: string; placeholder?: string; span?: number; req?: "need" | "opt" | "good" }) {
  const { v, set } = useContext(FieldCtx);
  const labelCls = req === "need" ? "text-red-600" : req === "opt" ? "text-amber-600" : req === "good" ? "text-emerald-600" : "text-slate-500";
  const ring = req === "need" ? "border-red-300 focus:ring-red-200" : req === "opt" ? "border-amber-200" : req === "good" ? "border-emerald-300 focus:ring-emerald-200" : "";
  return (
    <label className={span === 2 ? "sm:col-span-2" : span === 3 ? "sm:col-span-3" : ""}>
      <span className={`mb-0.5 block text-[11px] font-semibold ${labelCls}`}>{label}</span>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{prefix}</span>}
        <input inputMode={suffix || prefix ? "decimal" : "text"} value={v(k)} onChange={set(k)} placeholder={placeholder} className={`${inputCls} ${ring} ${prefix ? "pl-6" : ""} ${suffix ? "pr-8" : ""}`} />
        {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Res({ label, value, tone = "navy", big }: { label: string; value: string; tone?: "navy" | "good" | "warn" | "bad" | "muted"; big?: boolean }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-500" : tone === "bad" ? "text-red-600" : tone === "muted" ? "text-slate-500" : "text-brand-navy";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-extrabold tabular-nums ${big ? "text-2xl" : "text-base"} ${cls}`}>{value}</span>
    </div>
  );
}

// 3-rung offer ladder (course-style 95/85/65% of max) — gives the rep an opening,
// a target, and a floor instead of a single number.
// "Show me the math" receipt — the dummy-proof view. Numbered plain-English steps
// with the rep's ACTUAL numbers filled in, ending in one big unmissable total.
// No formulas to interpret: read top to bottom like a grocery receipt.
function MathReceipt({ title, rows, totalLabel, total, coach }: {
  title: string;
  rows: { text: string; amount: string; minus?: boolean }[];
  totalLabel: string;
  total: string;
  coach?: string;
}) {
  return (
    <div className="mb-3 rounded-xl bg-white p-3 ring-2 ring-brand-navy/20 sm:col-span-2">
      <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-brand-navy">🧾 {title} — step by step</div>
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-[13px]">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">{i + 1}</span>
            <span className="flex-1 text-slate-600">{r.text}</span>
            <span className={`shrink-0 font-bold tabular-nums ${r.minus ? "text-red-500" : "text-slate-800"}`}>{r.minus ? "− " : ""}{r.amount}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center justify-between border-t-2 border-dashed border-slate-200 pt-2">
        <span className="text-sm font-extrabold text-brand-navy">= {totalLabel}</span>
        <span className="text-xl font-extrabold tabular-nums text-brand-navy">{total}</span>
      </div>
      {coach && <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[12px] font-medium text-emerald-800">💡 {coach}</p>}
    </div>
  );
}

function OfferLadder({ rungs }: { rungs: { label: string; v: number }[] }) {
  if (!rungs.length) return null;
  return (
    <div className="mt-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">📊 Offer ladder — open low, work up</div>
      <div className="grid grid-cols-3 gap-1.5">
        {rungs.map((r) => (
          <div key={r.label} className="rounded bg-white px-2 py-1 text-center ring-1 ring-slate-200">
            <div className="text-[10px] text-slate-400">{r.label}</div>
            <div className="text-sm font-bold text-brand-navy tabular-nums">{money(r.v)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Minimum fee we plan for, tiered by ARV — bigger deals carry a bigger spread, so we
// shouldn't leave money on the table on a $700k house by defaulting to a $15k fee.
const FEE_TIERS: [number, number][] = [
  [200000, 10000],   // under $200k → $10k
  [350000, 15000],   // $200k–350k → $15k
  [500000, 20000],   // $350k–500k → $20k
  [750000, 25000],   // $500k–750k → $25k
  [1000000, 30000],  // $750k–1M → $30k
];
function feeForArv(arv: number): number {
  if (arv <= 0) return 0;
  for (const [cap, fee] of FEE_TIERS) if (arv < cap) return fee;
  return 40000; // $1M+ → $40k
}
// Display ladder for the on-screen reference table (matches feeForArv).
const FEE_TIER_ROWS: [string, number][] = [
  ["Under $200k", 10000],
  ["$200k–350k", 15000],
  ["$350k–500k", 20000],
  ["$500k–750k", 25000],
  ["$750k–1M", 30000],
  ["$1M+", 40000],
];
function tierLabel(arv: number): string {
  if (arv <= 0) return "";
  if (arv < 200000) return "under $200k";
  if (arv < 350000) return "$200k–350k";
  if (arv < 500000) return "$350k–500k";
  if (arv < 750000) return "$500k–750k";
  if (arv < 1000000) return "$750k–1M";
  return "$1M+";
}

// A plain manual calculator pinned to the right of the sheet, on every tab — for quick side
// math while comping. Self-contained; does not touch the underwriting fields.
function SideCalc() {
  const [open, setOpen] = useState(true);
  const [cur, setCur] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [fresh, setFresh] = useState(true);   // next digit starts a new number
  const [hist, setHist] = useState("");

  // Draggable: remember where the user drops it (persisted per device).
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    try {
      const s = localStorage.getItem("uwCalcPos");
      if (s) { setPos(JSON.parse(s)); return; }
    } catch {}
    setPos({ x: Math.max(8, window.innerWidth - 236), y: 88 }); // default: top-right
  }, []);
  useEffect(() => { if (pos) { try { localStorage.setItem("uwCalcPos", JSON.stringify(pos)); } catch {} } }, [pos]);
  const onDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const panel = e.currentTarget.parentElement as HTMLElement;
    const r = panel.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const x = Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - 44);
    const y = Math.min(Math.max(0, e.clientY - dragRef.current.dy), window.innerHeight - 44);
    setPos({ x, y });
  };
  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => { dragRef.current = null; e.currentTarget.releasePointerCapture?.(e.pointerId); };

  const fmt = (n: number) => (!isFinite(n) ? "Error" : String(Math.round(n * 1e10) / 1e10));
  const apply = (a: number, o: string, b: number) => (o === "+" ? a + b : o === "−" ? a - b : o === "×" ? a * b : o === "÷" ? a / b : b);
  const digit = (d: string) => { setCur((c) => (fresh || c === "0" ? d : c.length < 14 ? c + d : c)); setFresh(false); };
  const dot = () => { setCur((c) => (fresh ? "0." : c.includes(".") ? c : c + ".")); setFresh(false); };
  const clearAll = () => { setCur("0"); setAcc(null); setOp(null); setFresh(true); setHist(""); };
  const back = () => setCur((c) => (fresh ? c : c.length <= 1 || (c.length === 2 && c.startsWith("-")) ? "0" : c.slice(0, -1)));
  const pct = () => { setCur((c) => fmt(Number(c) / 100)); setFresh(true); };
  const neg = () => setCur((c) => (c === "0" ? c : c.startsWith("-") ? c.slice(1) : "-" + c));
  const chooseOp = (o: string) => {
    const b = Number(cur);
    if (op != null && acc != null && !fresh) { const r = apply(acc, op, b); setAcc(r); setCur(fmt(r)); }
    else setAcc(b);
    setHist(`${fmt(op != null && acc != null && !fresh ? apply(acc, op, b) : b)} ${o}`);
    setOp(o); setFresh(true);
  };
  const equals = () => {
    if (op == null || acc == null) return;
    const b = Number(cur), r = apply(acc, op, b);
    setHist(`${fmt(acc)} ${op} ${fmt(b)} =`);
    setCur(fmt(r)); setAcc(null); setOp(null); setFresh(true);
  };

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} title="Open calculator"
        className="fixed bottom-5 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-brand-navy text-xl text-white shadow-lg hover:bg-brand-navy-700">🧮</button>
    );
  }

  const Key = ({ label, onClick, cls = "" }: { label: string; onClick: () => void; cls?: string }) => (
    <button type="button" onClick={onClick} className={`h-11 rounded-lg text-sm font-bold transition active:scale-95 ${cls || "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>{label}</button>
  );

  return (
    <div className="fixed z-40 w-52 touch-none rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-200 sm:w-56"
      style={pos ? { left: pos.x, top: pos.y } : { right: 12, top: 88 }}>
      <div onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd}
        className="mb-1 flex cursor-move items-center justify-between rounded-lg px-1 py-0.5 hover:bg-slate-50 active:cursor-grabbing"
        title="Drag to move">
        <span className="select-none text-[11px] font-bold uppercase tracking-wide text-slate-400">⠿ 🧮 Calculator</span>
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setOpen(false)} title="Hide" className="rounded px-1.5 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600">✕</button>
      </div>
      <div className="mb-2 rounded-lg bg-slate-900 px-3 py-2 text-right">
        <div className="h-3 truncate text-[10px] text-slate-400">{hist}</div>
        <div className="truncate font-mono text-2xl font-bold text-white">{cur}</div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        <Key label="C" onClick={clearAll} cls="bg-red-100 text-red-700 hover:bg-red-200" />
        <Key label="⌫" onClick={back} cls="bg-slate-200 text-slate-700 hover:bg-slate-300" />
        <Key label="%" onClick={pct} cls="bg-slate-200 text-slate-700 hover:bg-slate-300" />
        <Key label="÷" onClick={() => chooseOp("÷")} cls="bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20" />
        <Key label="7" onClick={() => digit("7")} />
        <Key label="8" onClick={() => digit("8")} />
        <Key label="9" onClick={() => digit("9")} />
        <Key label="×" onClick={() => chooseOp("×")} cls="bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20" />
        <Key label="4" onClick={() => digit("4")} />
        <Key label="5" onClick={() => digit("5")} />
        <Key label="6" onClick={() => digit("6")} />
        <Key label="−" onClick={() => chooseOp("−")} cls="bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20" />
        <Key label="1" onClick={() => digit("1")} />
        <Key label="2" onClick={() => digit("2")} />
        <Key label="3" onClick={() => digit("3")} />
        <Key label="+" onClick={() => chooseOp("+")} cls="bg-brand-navy/10 text-brand-navy hover:bg-brand-navy/20" />
        <Key label="±" onClick={neg} />
        <Key label="0" onClick={() => digit("0")} />
        <Key label="." onClick={dot} />
        <Key label="=" onClick={equals} cls="bg-brand-gold text-brand-navy hover:opacity-90" />
      </div>
    </div>
  );
}

export default function UnderwritingCalculator() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("cash_land");
  const [f, setF] = useState<Record<string, string>>({});
  const v = (k: string) => f[k] ?? "";
  const n = (k: string) => num(v(k));
  // ── Comp timer (dispo): every underwrite is timed. It auto-starts the moment she edits any
  // field and only stops when she exports the offer — nobody can skip timing a comp. ──
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStart, setTimerStart] = useState<number | null>(null);
  const [timerNow, setTimerNow] = useState(0);
  const [timerFinal, setTimerFinal] = useState<number | null>(null); // frozen seconds after export
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);
  const startTimer = () => { const t = Date.now(); setTimerStart(t); setTimerNow(t); setTimerFinal(null); setTimerRunning(true); };
  // First edit of a fresh comp auto-starts the clock — nothing to press. Won't re-fire once a
  // comp has been exported/finalized; "Time another" resets it for the next one.
  const autoStartTimer = () => { if (!timerRunning && timerStart == null && timerFinal == null) startTimer(); };
  const stopTimer = () => setTimerRunning((run) => { if (run && timerStart != null) setTimerFinal(Math.max(0, Math.round((Date.now() - timerStart) / 1000))); return false; });
  const resetTimer = () => { setTimerRunning(false); setTimerStart(null); setTimerFinal(null); };
  const timerElapsed = timerRunning && timerStart != null ? Math.max(0, Math.round((timerNow - timerStart) / 1000)) : (timerFinal ?? 0);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const setV = (k: string, val: string) => { setF((p) => ({ ...p, [k]: val })); autoStartTimer(); };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV(k, e.target.value);

  // Additional-cost rows (cash-for-keys, eviction, liens…) — 1 by default, "+ add" for more.
  const [aExtraN, setAExtraN] = useState(1);
  const [nExtraN, setNExtraN] = useState(1);
  const extraSum = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => n(`${prefix}${i}`)).reduce((s, x) => s + x, 0);
  const extraItems = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => ({ amt: n(`${prefix}${i}`), note: v(`${prefix}Note${i}`) })).filter((x) => x.amt > 0);


  // Major / big-ticket repair items — checked items add their cost to the rehab.
  const majorTotal = MAJOR.reduce((s, [key]) => s + n(`maj_${key}`), 0);

  // ---- Assignment ----
  const marketPct = v("marketPct") || "75"; // default to SD/OC (75%), our home market — not the more conservative 70%
  const arv = n("arv");
  const suggestedFee = feeForArv(arv); // tiered minimum we plan for, by ARV
  const aFee = f.aFee != null && f.aFee !== "" ? n("aFee") : suggestedFee;
  const sqft = n("sqft"), rehabSf = num(v("rehabSf"));
  const repairsCalc = sqft * rehabSf;
  // Repairs = sqft × $/sf + checked major systems. (Per Jon: no manual override
  // and no contingency knob — one clear path so anyone gets the same number.)
  const repairs = repairsCalc + majorTotal;
  // The market tier % ALREADY builds in the flipper's profit AND their carry / money
  // costs — so we don't make the team estimate the flipper's holding (they rarely know
  // it). We only subtract KNOWN, deal-specific costs: HOA/special dues + extras
  // (cash-for-keys, eviction, liens). Detailed money-cost math lives on the Flip tab.
  const aHoa = n("aHoa");
  const aExtra = extraSum("aExtra", aExtraN);
  const flipperTarget = arv * (num(marketPct) / 100);
  const cashMao = flipperTarget - repairs - aHoa - aExtra - aFee;
  const aAnchorPct = v("aAnchorPct") || "10";
  const aAnchor = cashMao * (1 - num(aAnchorPct) / 100);

  // ---- Cash (Land) ---- vacant land: comp recent LAND sales, offer ~33% of the average.
  const clComps = [n("clC1"), n("clC2"), n("clC3")].filter((x) => x > 0);
  const clLandAvg = clComps.length ? Math.round(clComps.reduce((s, x) => s + x, 0) / clComps.length) : 0;
  const clPct = num(v("clPct") || "33");             // team target: ~33% of area land sales
  const clMao = clLandAvg > 0 ? Math.round(clLandAvg * (clPct / 100)) : 0;
  const clAnchorPct = v("clAnchorPct") || "8";
  const clAnchor = clMao * (1 - num(clAnchorPct) / 100);
  const clAsk = n("clAsk");
  const clOverAsk = clAsk > 0 && clMao > 0 ? clAsk - clMao : 0;
  const clSaneTone: "good" | "warn" | "bad" = clMao <= 0 ? "bad" : clPct > 45 ? "warn" : "good";
  const clSaneWord = clMao <= 0 ? "🚫 enter land comps" : clPct > 45 ? `⚠️ ${clPct}% is high for land` : `✅ ${clPct}% of area land value`;

  // ---- Double close (Cash tabs) ---- when the seller won't let us assign, we do TWO separate,
  // simultaneous closings (A→B buy, B→C sell) — closing costs are paid twice (escrow usually
  // gives a small simultaneous-close discount). This is our cost, so it eats the fee / MAO.
  // Total = closing costs on BOTH escrows (× the simultaneous-close discount) + the transactional
  // / gap-funding fee to fund the A→B leg for the few minutes we hold title.
  // ONE BUTTON (per Jon): on A→B we cover the SELLER's closing costs; on B→C we
  // cover only OUR seller-side closing — the end buyer pays their own. Seller-side
  // closing ≈ 1.5% per escrow, so total extra cost = 1.5% × (A→B price + B→C price).
  const DBL_PCT = 1.5;
  const dblCost = (on: boolean, buy: number, sell: number) => on ? Math.round((buy + sell) * (DBL_PCT / 100)) : 0;
  // Cash (Homes)
  const aDblOn = v("aDblClose") === "1";
  const aDblBuy = cashMao;                 // A→B: our purchase from the seller
  const aDblSell = cashMao + aFee;         // B→C: our resale to the end buyer
  const aDblCost = dblCost(aDblOn, aDblBuy, aDblSell);
  const aDblMao = Math.max(0, cashMao - aDblCost);
  // Cash (Land)
  const clDblOn = v("clDblClose") === "1";
  const clDblBuy = clMao;
  const clDblSell = clMao;
  const clDblCost = dblCost(clDblOn, clDblBuy, clDblSell);
  const clDblMao = Math.max(0, clMao - clDblCost);

  // ---- Novation ----
  const novCompPrices = [n("nComp1p"), n("nComp2p"), n("nComp3p")].filter((x) => x > 0);
  const suggestedList = novCompPrices.length ? Math.min(...novCompPrices) : 0; // conservative → sells fastest
  const nList = n("nList"), nComm = num(v("nComm") || "5"), nRepairCredit = n("nRepairCredit");
  // Novation is valued on SIMILAR-CONDITION value (or EMV for land), NOT after-repair value,
  // so the fee tier keys off the list price (fallback to ARV if that's all that's entered).
  const novFeeBasis = nList > 0 ? nList : arv;
  const novSuggestedFee = feeForArv(novFeeBasis);
  const nMinFee = f.nMinFee != null && f.nMinFee !== "" ? n("nMinFee") : novSuggestedFee;
  // HARD-CODED (per Jon — not per-deal knobs): a listing realistically nets ~95%
  // of list (price drops + concessions), and we cover ONLY the seller-side closing
  // (~1.5%); the buyer's closing costs are never our problem.
  const nRealismPct = 95;
  const nExpectedSale = nList * (nRealismPct / 100);
  const nSellerClosePct = 1.5;
  const nSellerClose = nExpectedSale * (nSellerClosePct / 100);
  const nHoldMonths = n("nHoldMonths") || 2;        // months on market before it sells
  const nHoaCost = n("nHoa") * nHoldMonths;          // HOA dues while listed
  const nExtra = extraSum("nExtra", nExtraN);        // manual override: cash-for-keys, eviction, etc.
  const nReserve = n("nReserve");                    // reserve: misc out-of-pocket + lender-required repairs
  const nNet = nExpectedSale - nRepairCredit - nExpectedSale * (nComm / 100) - nSellerClose - nHoaCost - nExtra - nReserve;
  const novMao = nNet - nMinFee;
  const nAnchorPct = v("nAnchorPct") || "7";
  const novAnchor = novMao * (1 - num(nAnchorPct) / 100);
  const feeAtAnchor = nNet - novAnchor;
  // Sanity check: novation should usually let us offer the seller MORE than cash (no
  // flipper margin / holding baked in). If cash MAO ends up higher, something's off.
  const maoConflict = cashMao > 0 && novMao > 0 && cashMao > novMao;

  // Deal-sanity traffic light — a quick green/yellow/red gut-check on the headline MAO,
  // by how much margin the deal leaves. Thresholds are tunable (say the word to adjust).
  //  Assignment: cash MAO as a share of ARV — the LOWER the better (more spread for us).
  const aSanePct = arv > 0 ? cashMao / arv : 0;
  const aSaneTone: "good" | "warn" | "bad" = cashMao <= 0 || aSanePct > 0.8 ? "bad" : aSanePct > 0.72 ? "warn" : "good";
  const aSaneWord = cashMao <= 0 ? "🚫 no room" : aSanePct > 0.8 ? "🚫 too thin — likely doesn't pencil" : aSanePct > 0.72 ? "⚠️ tight" : "✅ makes sense";
  //  Novation: seller payout as a share of list — lower is better; cash beating it = off.
  const nSanePct = nList > 0 ? novMao / nList : 0;
  const nSaneTone: "good" | "warn" | "bad" = novMao <= 0 || maoConflict || nSanePct > 0.95 ? "bad" : nSanePct > 0.9 ? "warn" : "good";
  const nSaneWord = novMao <= 0 ? "🚫 no room" : maoConflict ? "🚫 cash beats it — do cash instead" : nSanePct > 0.95 ? "🚫 too thin" : nSanePct > 0.9 ? "⚠️ tight" : "✅ makes sense";

  // ---- Developer / Land (Lux Blueprint: land for luxury new builds) ----
  // Value the LOT (dispo price) from land comps, then take a spread — that spread IS our
  // fee. No repairs / ARV%: the developer tears down and builds. MAO = dispo − spread.
  const devLux = (v("devLux") || "1") === "1"; // area has $2M+ luxury new builds? (default yes)
  const devWater = v("devWater") === "1";   // waterfront lot (compare only to waterfront)?
  const devView = v("devView") === "1";     // view lot — hilltop / ocean / city view (compare only to same-view lots)
  // Lot-size → acres converter (1 acre = 43,560 sq ft), used for the subject + every comp.
  const ACRE_SF = 43560;
  const toAcres = (val: number, unit: string) => (unit === "sqft" ? val / ACRE_SF : val);
  const acresLabel = (val: number, unit: string) => !(val > 0) ? "" : unit === "sqft"
    ? `${val.toLocaleString()} sq ft  =  ${(val / ACRE_SF).toFixed(2)} acres`
    : `${val} acres  =  ${Math.round(val * ACRE_SF).toLocaleString()} sq ft`;
  const devSubjAcres = toAcres(n("devLotSize"), v("devLotUnit") || "acres");
  // Comps: for each, what the DEVELOPER paid for the raw lot ÷ that lot's size = $/acre. We use
  // the developer's PURCHASE price (from the lot's sale history), NOT the current/sold price.
  const devComp = (i: number) => {
    const price = n(`devC${i}Price`);
    const acres = toAcres(n(`devC${i}Lot`), v(`devC${i}Unit`) || "acres");
    return { price, acres, perAcre: acres > 0 && price > 0 ? Math.round(price / acres) : 0 };
  };
  const devCompRows = [devComp(1), devComp(2), devComp(3)];
  const devPerAcres = devCompRows.map((c) => c.perAcre).filter((x) => x > 0);
  const devAvgPerAcre = devPerAcres.length ? Math.round(devPerAcres.reduce((s, x) => s + x, 0) / devPerAcres.length) : 0;
  const devDispo = devAvgPerAcre > 0 && devSubjAcres > 0 ? Math.round(devAvgPerAcre * devSubjAcres) : 0;
  const devSpread = n("devSpread") || 100000; // Lux Blueprint target spread: $100k–$150k
  const devMao = devDispo > 0 ? Math.max(0, devDispo - devSpread) : 0;
  // Developer double close (seller won't assign → two escrows; same one-button model).
  const devDblOn = v("devDblClose") === "1";
  const devDblBuy = devMao;      // A→B: our purchase from the seller
  const devDblSell = devDispo;   // B→C: our resale to the developer (dispo price)
  const devDblCost = dblCost(devDblOn, devDblBuy, devDblSell);
  const devDblMao = Math.max(0, devMao - devDblCost);
  const devAnchorPct = v("devAnchorPct") || "8";
  const devAnchor = devMao * (1 - num(devAnchorPct) / 100);
  const devFeeAtMao = devDispo > 0 ? devDispo - devMao : 0;       // = the spread
  const devFeeAtAnchor = devDispo > 0 ? devDispo - devAnchor : 0; // bigger if they take the open
  const devAsk = n("devAsk");
  const devOverAsk = devAsk > 0 && devMao > 0 ? devAsk - devMao : 0;
  // Fee sanity — Lux Blueprint wants a six-figure fee. Green ≥100k, yellow 50–100k, red <50k.
  const devSaneTone: "good" | "warn" | "bad" = devMao <= 0 || devFeeAtMao < 50000 ? "bad" : devFeeAtMao < 100000 ? "warn" : "good";
  const devSaneWord = devMao <= 0 ? "🚫 no room" : devFeeAtMao < 50000 ? "🚫 fee too thin — aim $100k+" : devFeeAtMao < 100000 ? "⚠️ under the $100k target" : "✅ six-figure fee";

  // "On-market equivalent" — a seller talking point (NO input; fixed assumption). Our cash /
  // land offer is a NET to the seller; to net the same on the open market they'd have to SELL
  // for more, losing ~8–10% to agent commission + closing. Sale price = offer ÷ (1 − cost%).
  const onMarketEquiv = (net: number): [number, number] => net > 0 ? [Math.round(net / 0.92), Math.round(net / 0.9)] : [0, 0];
  const [onMktEqLo, onMktEqHi] = onMarketEquiv(cashMao); // cash (assignment) offer
  const [devMktEqLo, devMktEqHi] = onMarketEquiv(devMao); // developer / land offer

  // ---- Creative / Listing ----
  // We don't buy on these terms — we ASSIGN them to an end buyer and make money two
  // ways: our assignment fee + marking up the down payment (charge the end buyer a
  // bigger down than we owe the seller, and keep the spread).
  const cFee = n("cFee");
  const cDown = n("cDown"); // down we owe the seller (often $0 on subject-to)
  const cBuyerDown = n("cBuyerDown"); // down we collect from the end buyer
  const cDownMarkup = Math.max(0, cBuyerDown - cDown);
  const cMargin = cFee + cDownMarkup; // total we make on the creative deal
  const lList = n("lList"), lComm = num(v("lComm") || "2.5"), lRef = num(v("lRef") || "25"), lFlat = n("lFlat");
  const mktFee = lFlat > 0 ? lFlat : lList * (lComm / 100) * (lRef / 100);

  // ---- Flip / Wholetail (from MAO.xlsx) ----
  const fMinProfit = f.fMinProfit != null && f.fMinProfit !== "" ? n("fMinProfit") : 30000;
  const fHold = n("fHold") || 6; // months — flippers average 4–6 depending on scope/market/season
  const fRehab = (n("fRehab") || n("sqft") * num(v("rehabSf"))) + majorTotal;
  const fComm = arv * (num(v("fComm") || "3") / 100);
  const fClosing = arv * (num(v("fClosing") || "2") / 100);
  // Carry (utilities/taxes/insurance) is ANNUAL and scales with hold time — a 12-month
  // hold costs twice a 6-month one. Default 2%/yr × the 6-mo default = the old 1% flat.
  const fCarry = arv * (num(v("fCarry") || "2") / 100) * (fHold / 12);
  const fHoaCost = n("fHoa") * fHold;
  const fPropertyCosts = fRehab + fComm + fClosing + fCarry + fHoaCost + n("fPm");
  // Money costs — flippers are almost never true cash buyers (Jon), so if no loan is
  // entered we AUTO-ASSUME hard money at 85% of the purchase + 100% of the rehab and
  // solve the MAO exactly (the loan depends on the purchase, so it's a small equation:
  // MAO = (A − k·rehab) / (1 + 0.85k), where k = points + rate/12 × hold months).
  const fRate = num(v("fRate") || "10") / 100, fPoints = num(v("fPoints") || "1") / 100, fSvc = n("fSvc");
  const fGap = n("fGap"), fGapRate = num(v("fGapRate") || "15") / 100;
  const fGapCost = (fGap * fGapRate / 12) * fHold;
  const kMoney = fPoints + (fRate / 12) * fHold; // money cost per borrowed dollar over the hold
  const fLoanIn = n("fLoan");
  let fMao: number, fLoan: number;
  if (fLoanIn > 0) {
    fLoan = fLoanIn;
    fMao = arv + n("fPurchCredit") - fMinProfit - fPropertyCosts - (fLoan * kMoney + fSvc + fGapCost);
  } else {
    const A = arv + n("fPurchCredit") - fMinProfit - fPropertyCosts - fSvc - fGapCost;
    fMao = (A - kMoney * fRehab) / (1 + 0.85 * kMoney);
    fLoan = Math.max(0, 0.85 * Math.max(0, fMao) + fRehab);
  }
  const fLoanAuto = fLoanIn <= 0;
  const fMoneyCost = fLoan * kMoney + fSvc + fGapCost;
  const fTotalCosts = fPropertyCosts + fMoneyCost;
  const fProfit = arv - fTotalCosts - n("fPurchase");

  // ---- Buy & Hold / Rental (landlord + BRRRR lens) ----
  const rPrice = n("rPrice") || arv;                 // purchase price (defaults to ARV)
  const rRent = n("rRent");                           // monthly rent
  const rTax = n("rTax"), rIns = n("rIns"), rHoaMo = n("rHoa");
  const rVacPct = num(v("rVac") || "5"), rMgmtPct = num(v("rMgmt") || "8"), rMaintPct = num(v("rMaint") || "8");
  const rTargetCap = num(v("rTargetCap") || "7");     // target cap rate %
  const rGrossYr = rRent * 12;
  const rOpEx = rTax + rIns + rHoaMo * 12 + rGrossYr * ((rVacPct + rMgmtPct + rMaintPct) / 100);
  const rNoi = rGrossYr - rOpEx;
  const rCapRate = rPrice > 0 ? (rNoi / rPrice) * 100 : 0;
  const rGrossYield = rPrice > 0 ? (rGrossYr / rPrice) * 100 : 0;
  const rOnePct = rPrice > 0 ? (rRent / rPrice) * 100 : 0;             // the "1% rule"
  const rMaxOffer = rTargetCap > 0 ? rNoi / (rTargetCap / 100) : 0;    // price that hits the target cap
  // Wrap & assign (per Jon): what TERMS can we lock up with the seller and wrap
  // to an end buyer who still cash-flows? End buyer's max all-in monthly payment
  // = monthly NOI − the cashflow they need to see. Our locked-up payment to the
  // seller must sit BELOW that — the gap is our monthly spread on the wrap.
  const rWrapCF = n("rWrapCF") || 300;                     // end buyer's target cashflow/mo
  const rSellerPmt = n("rSellerPmt");                       // our monthly payment on the locked terms
  // This is a PRINCIPAL + INTEREST ceiling — taxes/insurance/HOA/vacancy/management
  // are already subtracted inside NOI, so don't double-count them here.
  const rMaxWrapPmt = Math.max(0, rNoi / 12 - rWrapCF);     // max monthly P&I the end buyer can pay us
  const rWrapSpread = rSellerPmt > 0 ? rMaxWrapPmt - rSellerPmt : 0; // our monthly cashflow on the wrap
  // BRRRR check: real BRRRR buyers exit by refinancing at ~75% of ARV — the deal only
  // works if their ALL-IN (price + rehab) fits under that, or their cash stays stuck.
  const rArv = n("rArv") || arv;
  const rRehabCost = n("rRehab");
  const rAllIn = rPrice + rRehabCost;
  const rRefiLimit = rArv * 0.75;
  const rBrrrOk = rArv > 0 && rPrice > 0 ? rAllIn <= rRefiLimit : null;

  // 3-rung offer ladder consistent with our open-low-work-up model: Open (the anchor) →
  // Target (midpoint) → Max (the MAO). All ascending, never above the MAO.
  const ladder = (lo: number, hi: number): { label: string; v: number }[] =>
    hi > 0 ? [{ label: "Open", v: lo }, { label: "Target", v: (lo + hi) / 2 }, { label: "Max", v: hi }] : [];
  // The headline offer's size relative to ARV — a quick sanity gut-check.
  const pctOfArv = (x: number) => (arv > 0 ? `${Math.round((x / arv) * 100)}% of ARV` : "");

  // ---- Deal outcome (shared across every exit): the seller's asking price and
  // the price they actually accepted, so we can see the TRUE margin at the end. ----
  const asking = n("askPrice");
  const accepted = n("acceptedPrice");
  let dealMax = 0, profitAtAccepted = 0, marginLabel = "Your profit", showAsking = true;
  if (tab === "assignment") { dealMax = cashMao; profitAtAccepted = (flipperTarget - repairs - aHoa - aExtra) - accepted; marginLabel = "Your assignment fee"; }
  else if (tab === "cash_land") { dealMax = clMao; profitAtAccepted = clLandAvg - accepted; marginLabel = "Your spread vs land value"; showAsking = true; }
  else if (tab === "developer") { dealMax = devMao; profitAtAccepted = devDispo - accepted; marginLabel = "Your assignment fee"; showAsking = true; }
  else if (tab === "novation") { dealMax = novMao; profitAtAccepted = nNet - accepted; marginLabel = "Your fee"; }
  else if (tab === "flip") { dealMax = fMao; profitAtAccepted = arv - fTotalCosts - accepted; marginLabel = "Your profit"; }
  else if (tab === "creative") { dealMax = n("cPrice"); profitAtAccepted = cMargin; marginLabel = "Your total margin"; showAsking = false; }
  else if (tab === "rental") { dealMax = rMaxOffer; profitAtAccepted = rNoi; marginLabel = "Annual NOI"; showAsking = true; }
  else { dealMax = lList; profitAtAccepted = lFlat > 0 ? lFlat : accepted * (lComm / 100) * (lRef / 100); marginLabel = "Your marketing fee"; showAsking = false; }
  // ROI on the deal: (list/sale price − the price we get it under contract for) ÷ contract.
  // Sale price defaults to ARV (cash/flip) or the list price (novation/listing); editable.
  const saleDefault = tab === "novation" ? nList : tab === "listing" ? lList : tab === "creative" ? n("cPrice") : arv;
  const salePrice = n("salePrice") || saleDefault;
  const roi = accepted > 0 && salePrice > 0 ? ((salePrice - accepted) / accepted) * 100 : null;
  const overAsk = asking - dealMax; // > 0 means the seller is asking above our max offer
  const buyExit = tab === "assignment" || tab === "novation" || tab === "flip";

  function buildReport(): { title: string; rows: [string, string][]; comps?: string; note?: string } {
    const addr = v("subject") || "—";
    if (tab === "assignment") {
      const comps = [1, 2, 3].map((i) => { const a = v(`comp${i}`); const p = v(`comp${i}p`); const d = v(`comp${i}d`); return a ? `${esc(a)}${p ? ` — $${esc(p)}` : ""}${d ? `, ${esc(d)} DOM` : ""}` : ""; }).filter(Boolean).join("<br>");
      return {
        title: "Assignment (Cash) Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}${comps ? `<br><strong>ARV comps (price · days on market):</strong><br>${comps}` : ""}`,
        rows: [["ARV", money(arv)], [`Market tier (${marketPct}% of ARV)`, money(flipperTarget)], ["Repairs", money(repairs)], ...(aHoa > 0 ? ([["HOA / special dues", money(aHoa)]] as [string, string][]) : []), ...extraItems("aExtra", aExtraN).map((x) => [x.note || "Additional cost", money(x.amt)] as [string, string]), ["Assignment fee", money(aFee)], ["🎯 Cash MAO (max offer to seller)", money(cashMao)], [`Anchor / opening offer (${aAnchorPct}% below MAO)`, money(aAnchor)], ["Negotiation range", `${money(aAnchor)} → ${money(cashMao)}`], ...(aDblOn ? ([["🔁 Double-close closing cost (seller side ×2)", money(aDblCost)], ["🎯 Double-close MAO (offer this instead)", money(aDblMao)]] as [string, string][]) : [])],
        note: aDblOn
          ? "DOUBLE CLOSE — the seller won't let us assign, so we do two separate simultaneous closings (A→B buy, B→C sell). Closing costs are paid on BOTH escrows (escrow usually gives a small simultaneous-close discount). That extra cost is ours, so offer the seller the Double-close MAO to keep the same fee — or hold the MAO and the fee shrinks by that amount."
          : "Open at the anchor, negotiate up to the cash MAO. Holding accounts for the flipper's carry. On assignment the end buyer covers BOTH the seller's and the buyer's closing costs, so no closing is deducted here. If the seller won't meet MAO, pivot to Novation.",
      };
    }
    if (tab === "cash_land") {
      const comps = [1, 2, 3].map((i) => v(`clC${i}`) ? `$${esc(v(`clC${i}`))}` : "").filter(Boolean).join(" · ");
      return {
        title: "Cash (Land) Analysis",
        comps: `<strong>Subject:</strong> ${esc(addr)}${v("clLot") ? `<br><strong>Lot:</strong> ${esc(v("clLot"))}` : ""}${comps ? `<br><strong>Comparable land sales:</strong> ${comps}` : ""}`,
        rows: [
          ["Avg area land sale (comps)", money(clLandAvg)],
          [`Offer target (${clPct}% of land value)`, `${clPct}%`],
          ["🎯 Cash (Land) MAO — max offer to seller", money(clMao)],
          [`Anchor / opening (${clAnchorPct}% below MAO)`, money(clAnchor)],
          ["Negotiation range", `${money(clAnchor)} → ${money(clMao)}`],
          ...(clDblOn ? ([["🔁 Double-close closing cost (seller side ×2)", money(clDblCost)], ["🎯 Double-close MAO (offer this instead)", money(clDblMao)]] as [string, string][]) : []),
        ],
        note: (clDblOn ? "DOUBLE CLOSE — two separate simultaneous closings (seller won't assign), so closing costs are paid on BOTH escrows; offer the seller the Double-close MAO to keep the same margin. " : "") + "Vacant land. Pull recent comparable LAND sales in the area, average them, and offer about 33% of that average — that discount is our room for a fee plus the buyer's margin. Open at the anchor and negotiate up to the MAO, never past it.",
      };
    }
    if (tab === "developer") {
      return {
        title: "Developer Analysis",
        comps: `<strong>Subject:</strong> ${esc(addr)}${devSubjAcres > 0 ? `<br><strong>Lot:</strong> ${devSubjAcres.toFixed(2)} acres` : ""}${v("devBuild") ? ` · buildable ${esc(v("devBuild"))}` : ""}${devWater ? " · waterfront" : ""}${devView ? " · view/hilltop" : ""}`,
        rows: [
          ...devCompRows
            .map((c, idx) => (c.perAcre > 0 ? ([`Comp ${idx + 1} — ${(v(`devC${idx + 1}Status`) || "sold") === "forsale" ? "for sale" : "sold"} · developer $/acre`, `${money(c.perAcre)}/acre`] as [string, string]) : null))
            .filter((r): r is [string, string] => r !== null),
          ["Avg developer $/acre", devAvgPerAcre > 0 ? `${money(devAvgPerAcre)}/acre` : "—"],
          ["Subject lot", devSubjAcres > 0 ? `${devSubjAcres.toFixed(2)} acres` : "—"],
          ["🎯 Dispo price (land value = $/acre × lot)", money(devDispo)],
          ["− Spread (your fee target)", money(devSpread)],
          ["🎯 Developer MAO (max offer to seller)", money(devMao)],
          [`Anchor / opening (${devAnchorPct}% below MAO)`, money(devAnchor)],
          ["Negotiation range", `${money(devAnchor)} → ${money(devMao)}`],
          ["Your fee at the MAO", money(devFeeAtMao)],
          ...(devDblOn ? ([["🔁 Double-close cost (seller side ×2)", money(devDblCost)], ["🎯 Double-close MAO (offer this instead)", money(devDblMao)]] as [string, string][]) : []),
        ],
        note: (devDblOn ? "DOUBLE CLOSE — the seller won't assign, so two separate simultaneous escrows; closing costs are paid twice plus transactional funding. Offer the seller the Double-close MAO to keep the same spread. (Developers pay cash, so there's no lender-seasoning issue.) " : "") + "Land for luxury new builds. Comp for-sale + sold lots nearby by LOT SIZE, using what the DEVELOPER paid for each raw lot (from its sale history — NOT the current sold price, which includes the build). Average $/acre × the subject's acreage = the land value; subtract a $100–150k spread for your fee. No repairs: the buyer tears down. Waterfront lots use waterfront comps only. Open at the anchor, negotiate up to the MAO — never past it.",
      };
    }
    if (tab === "novation") {
      const comps = [1, 2, 3].map((i) => { const a = v(`nComp${i}`); const p = v(`nComp${i}p`); const d = v(`nComp${i}d`); return a ? `${esc(a)} — ${p ? "$" + esc(p) : "?"}${d ? `, ${esc(d)} DOM` : ""}` : ""; }).filter(Boolean).join("<br>");
      return {
        title: "Novation Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}${comps ? `<br><strong>As-is comps (price · days on market):</strong><br>${comps}` : ""}`,
        rows: [["List price (current similar-condition)", money(nList)], ["Buyer repair credit", money(nRepairCredit)], [`Agent commission (${nComm}%)`, money(nList * (nComm / 100))], [`Seller closing ${nSellerClosePct}% (we cover seller side only)`, money(nSellerClose)], ...(nHoaCost > 0 ? ([[`HOA dues (${nHoldMonths} mo)`, money(nHoaCost)]] as [string, string][]) : []), ...extraItems("nExtra", nExtraN).map((x) => [x.note || "Additional cost", money(x.amt)] as [string, string]), ["Net after costs", money(nNet)], ["Our minimum fee", money(nMinFee)], ["🎯 Novation MAO (max seller payout)", money(novMao)], [`Anchor / opening payout (${nAnchorPct}% below MAO)`, money(novAnchor)], ["Negotiation range (seller payout)", `${money(novAnchor)} → ${money(novMao)}`], ["Our fee at anchor", money(feeAtAnchor)]],
        note: "No holding costs (retail buyer). On novation we cover the SELLER's closing only (% of list) — the buyer pays their own. List conservatively to sell under 90 days; disclose we market higher to make it work.",
      };
    }
    if (tab === "creative") {
      const type = v("cType") || "Seller finance";
      // (rows assembled below; margin rows appended after the terms)
      const rows: [string, string][] = [["Structure", type]];
      if (type === "Subject-to") { rows.push(["Loan balance assumed", money(n("cLoan"))], ["Monthly payment (PITI)", money(n("cPmt"))]); }
      else { rows.push(["Agreed price", money(n("cPrice"))], ["Down to seller", money(n("cDown"))], ["Monthly to seller", money(n("cPmt"))], ["Term", v("cTerm") || "—"]); }
      rows.push(["Down we charge the end buyer", money(cBuyerDown)], ["Down markup we keep", money(cDownMarkup)], ["Our assignment fee", money(cFee)], ["🎯 Total margin (fee + down markup)", money(cMargin)]);
      return { title: "Creative (Seller-finance / Subject-to) Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}`, rows, note: "We DON'T buy on these terms — we assign them to an end buyer who wants them. We make our assignment fee PLUS the markup on the down payment (charge the end buyer a higher down than we owe the seller and keep the spread). They assume the exact terms agreed with the seller." };
    }
    if (tab === "listing") {
      return {
        title: "Listing Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}`,
        rows: [["List price", money(lList)], [`Listing commission (${lComm}%)`, money(lList * (lComm / 100))], lFlat > 0 ? ["Flat marketing fee", money(lFlat)] : [`Referral / marketing fee (${lRef}% of commission)`, money(mktFee)], ["Our marketing fee", money(mktFee)]],
        note: "Standard agent-to-agent referral is 25% of the listing-side commission. A flat $2,500–$5,000 is also common — set whichever you use.",
      };
    }
    if (tab === "rental") {
      return {
        title: "Buy & Hold / Rental Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}`,
        rows: [["Purchase price", money(rPrice)], ["Monthly rent", money(rRent)], ["Gross annual rent", money(rGrossYr)], ["Operating expenses", money(rOpEx)], ["Net operating income (NOI)", money(rNoi)], ["Cap rate", `${rCapRate.toFixed(1)}%`], ["Gross yield", `${rGrossYield.toFixed(1)}%`], ["1% rule (rent ÷ price)", `${rOnePct.toFixed(2)}%`], [`🎯 Max offer at ${rTargetCap}% cap`, money(rMaxOffer)]],
        note: "Landlord / BRRRR lens. Cap rate = NOI ÷ price. The 1% rule (monthly rent ≥ 1% of price) is a quick screen. Max offer = NOI ÷ target cap rate.",
      };
    }
    {
      const comps = [1, 2, 3].map((i) => { const a = v(`comp${i}`); const p = v(`comp${i}p`); const d = v(`comp${i}d`); return a ? `${esc(a)}${p ? ` — $${esc(p)}` : ""}${d ? `, ${esc(d)} DOM` : ""}` : ""; }).filter(Boolean).join("<br>");
      return {
      title: "Flip / Wholetail Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}${comps ? `<br><strong>ARV comps (price · days on market):</strong><br>${comps}` : ""}`,
      rows: [["ARV", money(arv)], ["Rehab", money(fRehab)], ["Commission + closing + carrying + HOA + PM", money(fComm + fClosing + fCarry + fHoaCost + n("fPm"))], ["Total property costs", money(fPropertyCosts)], ["Money cost (points + interest + fees)", money(fMoneyCost)], ["Total costs", money(fTotalCosts)], ["Minimum profit", money(fMinProfit)], ["🎯 Max Offer", money(fMao)], ["Profit at your purchase price", money(fProfit)]],
      note: "Buyer's-lens flip math. Max Offer = ARV + purchase credit − min profit − total costs. Wholetail = same math with a lighter rehab.",
    };
    }
  }

  function exportPdf() {
    // Capture the comp time NOW (state from stopTimer won't have flushed yet this tick).
    const compSeconds = timerRunning && timerStart != null ? Math.max(0, Math.round((Date.now() - timerStart) / 1000)) : timerFinal;
    const stamp = new Date();
    const compDate = stamp.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const compTime = stamp.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    stopTimer(); // exporting = done comping → freeze the timer
    const r = buildReport();
    const w = window.open("", "_blank", "width=860,height=940");
    if (!w) return;

    const isAssign = tab === "assignment", isLand = tab === "cash_land", isDev = tab === "developer", isNov = tab === "novation", isFlip = tab === "flip", isCreative = tab === "creative", isRental = tab === "rental";
    // The single headline number (MAO / max offer) — biggest thing on the page.
    const heroVal = isAssign ? cashMao : isLand ? clMao : isDev ? devMao : isNov ? novMao : isFlip ? fMao : isCreative ? cMargin : isRental ? rMaxOffer : mktFee;
    const heroLabel = isAssign ? "Cash (Homes) MAO · the most we offer the seller" : isLand ? "Cash (Land) MAO · max offer to seller" : isDev ? "Developer MAO · max offer to seller" : isNov ? "Novation MAO · max seller payout" : isFlip ? "Max Offer · flip MAO" : isCreative ? "Total margin to us" : isRental ? `Max offer at ${rTargetCap}% cap rate` : "Our marketing fee";
    const rLo = isAssign ? aAnchor : isLand ? clAnchor : isDev ? devAnchor : isNov ? novAnchor : 0;
    const rHi = isAssign ? cashMao : isLand ? clMao : isDev ? devMao : isNov ? novMao : 0;
    const feeAnchor = isAssign ? (flipperTarget - repairs - aHoa - aExtra - aAnchor) : isDev ? devFeeAtAnchor : isNov ? feeAtAnchor : 0;
    const feeMao = isAssign ? aFee : isDev ? devFeeAtMao : isNov ? nMinFee : 0;
    const valLabel = (isAssign || isFlip) ? "ARV (after-repair value)" : isLand ? "Avg area land sale" : isDev ? "Dispo price (land value)" : isNov ? "List price (similar-condition · EMV)" : "";
    const valVal = (isAssign || isFlip) ? arv : isLand ? clLandAvg : isDev ? devDispo : isNov ? nList : 0;

    // A colored decision box.
    type Tone = "navy" | "amber" | "green" | "slate" | "red";
    const TONES: Record<Tone, { bg: string; bd: string; lc: string; vc: string }> = {
      navy: { bg: "#eef2ff", bd: "#c7d2fe", lc: "#4338ca", vc: "#1e3a8a" },
      amber: { bg: "#fffbeb", bd: "#fde68a", lc: "#b45309", vc: "#b45309" },
      green: { bg: "#ecfdf5", bd: "#a7f3d0", lc: "#047857", vc: "#047857" },
      slate: { bg: "#f8fafc", bd: "#e2e8f0", lc: "#64748b", vc: "#0f172a" },
      red: { bg: "#fef2f2", bd: "#fecaca", lc: "#b91c1c", vc: "#b91c1c" },
    };
    const card = (label: string, value: string, tone: Tone, sub?: string) => {
      const t = TONES[tone];
      return `<div style="flex:1 1 160px;background:${t.bg};border:1px solid ${t.bd};border-radius:10px;padding:11px 14px">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:${t.lc}">${esc(label)}</div>
        <div style="font-size:19px;font-weight:800;color:${t.vc};margin-top:2px">${esc(value)}</div>
        ${sub ? `<div style="font-size:10px;color:#94a3b8;margin-top:1px">${esc(sub)}</div>` : ""}
      </div>`;
    };

    let boxes: string[] = [];
    if (isAssign || isNov || isDev) {
      boxes = [
        // Range now leads the hero above — cards show the fee at each end + the anchor value.
        card("Your fee at the opening (anchor)", money(feeAnchor), "amber", "if they take your first number"),
        card("Your fee at the MAO", money(feeMao), "green", isDev ? "your spread at the top of the range" : "your minimum at the top of the range"),
        card(valLabel, money(valVal), "slate"),
      ];
    } else if (isLand) {
      boxes = [
        card("Avg area land sale", money(clLandAvg), "slate"),
        card("Offer target", `${clPct}% of land value`, "amber"),
        card("Cash (Land) MAO", money(clMao), "green", "max offer to the seller"),
      ];
    } else if (isFlip) {
      boxes = [
        card("Min profit kept", money(fMinProfit), "green"),
        card("ARV (after-repair value)", money(arv), "slate"),
        ...(n("fPurchase") > 0 ? [card("Profit at your purchase price", money(fProfit), fProfit > 0 ? "green" : "red")] : []),
      ];
    } else if (isCreative) {
      boxes = [card("Our assignment fee", money(cFee), "green"), card("Down markup we keep", money(cDownMarkup), "amber")];
    }
    const boxesHtml = boxes.length ? `<div style="display:flex;flex-wrap:wrap;gap:10px;margin:0 0 14px">${boxes.join("")}</div>` : "";

    // Seller's asking vs our max — a clear green/red callout.
    const askHtml = (showAsking && asking > 0 && dealMax > 0)
      ? `<div style="margin:0 0 12px;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;${overAsk > 0 ? "background:#fef2f2;border:1px solid #fecaca;color:#b91c1c" : "background:#ecfdf5;border:1px solid #a7f3d0;color:#047857"}">Seller's asking: ${money(asking)} ${overAsk > 0 ? `— over your max by ${money(overAsk)} ⚠️` : `— within your max ✅`}</div>`
      : "";
    const acceptedHtml = (accepted > 0)
      ? `<div style="margin:0 0 12px;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534">If they accept ${money(accepted)} → ${esc(marginLabel.toLowerCase())}: ${money(profitAtAccepted)}</div>`
      : "";
    // Seller talking point (cash offer): what they'd have to SELL for on-market to net the same.
    const onMktHtml = (isAssign && cashMao > 0)
      ? `<div style="margin:0 0 12px;padding:11px 14px;border-radius:10px;background:#f0f9ff;border:1px solid #bae6fd;color:#075985;font-size:12.5px;line-height:1.5">
           <div style="font-weight:800;font-size:13px">🏷️ Same net on the open market: ${esc(money(onMktEqLo))} – ${esc(money(onMktEqHi))}</div>
           To actually walk away with this <b>${esc(money(cashMao))}</b> cash offer, you'd have to <b>sell for ${esc(money(onMktEqLo))}–${esc(money(onMktEqHi))}</b> on-market — the extra <b>${esc(money(onMktEqLo - cashMao))}–${esc(money(onMktEqHi - cashMao))}</b> goes to agent commission + closing (~8–10%), before months of showings, repairs, and no guarantee it sells. This cash offer nets the same — clean, fast, certain.
         </div>`
      : "";
    // Same seller talking point for the Developer / Land cash offer.
    const devMktHtml = (isDev && devMao > 0)
      ? `<div style="margin:0 0 12px;padding:11px 14px;border-radius:10px;background:#f0f9ff;border:1px solid #bae6fd;color:#075985;font-size:12.5px;line-height:1.5">
           <div style="font-weight:800;font-size:13px">🏷️ Same net on the open market: ${esc(money(devMktEqLo))} – ${esc(money(devMktEqHi))}</div>
           To actually net this <b>${esc(money(devMao))}</b> cash offer for the lot, you'd have to <b>sell for ${esc(money(devMktEqLo))}–${esc(money(devMktEqHi))}</b> with an agent — the extra <b>${esc(money(devMktEqLo - devMao))}–${esc(money(devMktEqHi - devMao))}</b> goes to commission + closing (~8–10%), before months on market. This cash offer nets the same — clean, fast, certain.
         </div>`
      : "";
    const roiHtml = (roi != null)
      ? `<div style="margin:0 0 12px;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;${roi > 0 ? "background:#f0fdf4;border:1px solid #bbf7d0;color:#166534" : "background:#fef2f2;border:1px solid #fecaca;color:#b91c1c"}">📈 ROI: ${roi >= 0 ? "+" : ""}${roi.toFixed(0)}% — ${money(salePrice)} sale vs ${money(accepted)} under contract</div>`
      : "";

    const conflict = maoConflict ? `<div style="margin:0 0 14px;padding:10px 14px;border-radius:10px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:12px;font-weight:600">⚠️ Cash MAO (${esc(money(cashMao))}) is higher than the Novation MAO (${esc(money(novMao))}) — novation should usually allow a higher offer. Re-check the novation inputs.</div>` : "";

    // Full cost breakdown — minus the headline numbers already shown in boxes above.
    const detail = r.rows.filter(([l]) => !/🎯|anchor|negotiat/i.test(l));
    const rowsHtml = detail.map(([l, val], i) => `<tr style="background:${i % 2 ? "#f8fafc" : "#fff"}"><td style="padding:7px 12px;color:#475569">${esc(l)}</td><td style="padding:7px 12px;text-align:right;font-weight:700;color:#0f172a">${esc(val)}</td></tr>`).join("");

    // Repairs & condition — itemized justification for the offer, from what the underwriter
    // inputted. Heavy/major systems (roof, HVAC, water heater, foundation, windows) are
    // flagged so the seller sees exactly why the price is where it is.
    const majorItems = MAJOR.filter(([key]) => n(`maj_${key}`) > 0).map(([key, label]) => ({ label, cost: n(`maj_${key}`) }));
    const rehabBaseOnly = repairsCalc;
    const repairLine = (label: string, val: string, major = false) =>
      `<tr style="background:${major ? "#fff7ed" : "#fff"}"><td style="padding:7px 12px;color:${major ? "#9a3412" : "#475569"};font-weight:${major ? 700 : 400}">${major ? "🔨 " : ""}${esc(label)}${major ? ' <span style="font-size:9px;background:#fed7aa;color:#9a3412;padding:1px 5px;border-radius:6px;font-weight:700;text-transform:uppercase">major</span>' : ""}</td><td style="padding:7px 12px;text-align:right;font-weight:700;color:#0f172a">${esc(val)}</td></tr>`;
    const repairRows: string[] = [];
    for (const m of majorItems) repairRows.push(repairLine(m.label, money(m.cost), true));
    if (rehabBaseOnly > 0) repairRows.push(repairLine(`General / interior rehab${rehabDesc(v("rehabSf")) ? ` — ${rehabDesc(v("rehabSf"))}` : ""}`, money(rehabBaseOnly)));
    const repairsHtml = repairRows.length
      ? `<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#9a3412;margin:16px 0 4px">🔧 Repairs &amp; condition — justification for the price (per underwriter)</div>
         <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #fed7aa;border-radius:8px;overflow:hidden">
           ${repairRows.join("")}
           <tr style="background:#fff7ed;border-top:2px solid #fdba74"><td style="padding:8px 12px;font-weight:800;color:#9a3412">Total estimated repairs</td><td style="padding:8px 12px;text-align:right;font-weight:800;color:#9a3412">${esc(money(repairs))}</td></tr>
         </table>
         ${majorItems.length ? `<div style="font-size:11px;color:#9a3412;margin-top:5px">⚠️ Heavy/major systems needing work: <b>${majorItems.map((m) => esc(m.label)).join(", ")}</b>.</div>` : ""}`
      : "";

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title></head>
      <body style="font-family:system-ui,Arial,sans-serif;color:#0f172a;max-width:760px;margin:24px auto;padding:0 18px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <div style="border-bottom:3px solid #0b1f3a;padding-bottom:8px;margin-bottom:6px">
          <div style="font-weight:800;font-size:18px;color:#0b1f3a">Freedom Offers — War Room</div>
          <div style="color:#64748b;font-size:13px">${esc(r.title)} · ${new Date().toLocaleDateString()}</div>
        </div>
        ${r.comps ? `<div style="margin:10px 0 12px;color:#334155;line-height:1.5;font-size:13px">${r.comps}</div>` : ""}
        <div style="background:#fff5f5;border:2px solid #fecaca;border-radius:14px;padding:18px 22px;margin:0 0 14px;text-align:center;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          ${(rLo && rHi) ? `
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#b91c1c">🎯 Negotiation range — open low, work up</div>
          <div style="font-size:40px;font-weight:800;line-height:1.1;margin-top:4px;color:#dc2626">${esc(money(rLo))} <span style="color:#f87171">→</span> ${esc(money(rHi))}</div>
          <div style="font-size:12px;color:#991b1b;margin-top:5px">Open at ${esc(money(rLo))} · never go past ${esc(money(rHi))}</div>
          <div style="margin-top:11px;padding-top:9px;border-top:1px solid #fecaca;font-size:13px;color:#334155">${esc(heroLabel)}: <b style="font-size:17px;color:#dc2626">${esc(money(heroVal))}</b> <span style="color:#b91c1c">— your ceiling, never past it</span></div>
          ` : `
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#b91c1c">🎯 ${esc(heroLabel)}</div>
          <div style="font-size:42px;font-weight:800;line-height:1.1;margin-top:3px;color:#dc2626">${esc(money(heroVal))}</div>
          `}
        </div>
        ${conflict}
        ${boxesHtml}
        ${askHtml}
        ${onMktHtml}
        ${devMktHtml}
        ${acceptedHtml}
        ${roiHtml}
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#94a3b8;margin:4px 0 4px">How the number breaks down</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">${rowsHtml}</table>
        ${repairsHtml}
        ${r.note ? `<p style="margin-top:14px;color:#64748b;font-size:12px;font-style:italic">${esc(r.note)}</p>` : ""}
        <div style="margin-top:22px;padding-top:8px;border-top:1px solid #e2e8f0;text-align:center;color:#94a3b8;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact">
          🗓️ Comped on <b style="color:#475569">${esc(compDate)}</b> at ${esc(compTime)}${compSeconds != null ? ` &nbsp;·&nbsp; ⏱ Underwrite time: <b style="color:#475569">${esc(mmss(compSeconds))}</b>` : ""}<br>
          <span style="color:#cbd5e1">Re-comp every ~30 days — values move as new sales hit the market.</span>
        </div>
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  const reqDiv = "sm:col-span-2 mt-1 border-t border-red-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-red-500";
  const optDiv = "sm:col-span-2 mt-1 border-t border-amber-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-amber-500";
  const goodDiv = "sm:col-span-2 mt-1 border-t border-emerald-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-emerald-600";
  // Numbered step header — fields flow top-to-bottom in the same order as the math,
  // so someone bad at math can just fill the form downward and read the receipt.
  const stepDiv = (num: number, title: string, hint?: string) => (
    <div className="sm:col-span-2 mt-2 border-t border-slate-200 pt-2.5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-navy text-[12px] font-extrabold text-white">{num}</span>
        <span className="text-[13px] font-extrabold text-brand-navy">{title}</span>
      </div>
      {hint && <p className="mt-0.5 pl-8 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
  // Reused under both comps sections — explains why comps are GREEN (hard facts).
  const compsNote = "🟢 Green = hard facts — real, recent closed sales in the area, not speculation or hopeful pricing. Pull them, then verify each on the MLS / county records before recording all 3. Never send an offer that isn't backed by comps.";
  const legend = (
    <div className="sm:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-1.5 text-[11px] font-semibold ring-1 ring-slate-200">
      <span className="text-red-600">🔴 Required to give an MAO</span>
      <span className="text-amber-600">🟡 Optional — refines the number</span>
      <span className="text-emerald-600">🟢 Hard facts — actual closed sales, not speculation</span>
    </div>
  );

  // Fee-floor reference: the minimum assignment / novation fee to aim for at each ARV
  // band, with the band matching the current ARV highlighted. Same fee applies to both
  // exits. Keeps reps from under-charging on a pricey house or over-charging (and
  // lowballing the seller) on a cheap one.
  const feeTierTable = (basis: number, basisLabel: string) => {
    const fee = feeForArv(basis);
    return (
      <div className="sm:col-span-2 rounded-lg bg-amber-50/60 px-3 py-2 ring-1 ring-amber-200">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">📐 Minimum fee to aim for, by {basisLabel}{basis > 0 ? ` — yours: ${tierLabel(basis)} → ${money(fee)}` : ""}</div>
        <div className="grid grid-cols-3 gap-1 text-[11px] sm:grid-cols-6">
          {FEE_TIER_ROWS.map(([band, f]) => {
            const active = basis > 0 && fee === f;
            return (
              <div key={band} className={`flex flex-col rounded px-1.5 py-1 text-center ${active ? "bg-emerald-600 font-bold text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>
                <span className="text-[10px]">{band}</span>
                <span className="font-bold">{money(f)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-1 text-[10px] italic text-amber-700/80">The floor scales with the property value — don&apos;t leave money on a high-value deal, and don&apos;t force a lowball offer chasing an oversized fee on a cheap one.</p>
      </div>
    );
  };

  // Repeatable additional-cost rows — 1 by default, "+ add another" for more line items.
  const additionalCosts = (prefix: string, count: number, setCount: (n: number) => void) => (
    <>
      <div className={optDiv}>Additional costs (cash-for-keys, eviction, liens…)</div>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field k={`${prefix}${i}`} label={count > 1 ? `Extra cost ${i + 1} ($)` : "Extra cost ($)"} prefix="$" placeholder="0" req="opt" />
          <Field k={`${prefix}Note${i}`} label="What is it?" placeholder="e.g. cash for keys" req="opt" />
        </div>
      ))}
      <div className="sm:col-span-2 flex items-center gap-3">
        <button type="button" onClick={() => setCount(count + 1)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-200">+ Add another cost</button>
        {count > 1 && <button type="button" onClick={() => setCount(count - 1)} className="text-[11px] font-semibold text-slate-400 hover:text-red-500">− Remove last</button>}
      </div>
    </>
  );

  // Big-ticket repair checklist — check what's needed; the cost folds into rehab.
  const majorRepairs = () => (
    <div className="sm:col-span-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">Major / big-ticket repairs — check what&apos;s needed (cost adjustable)</div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {MAJOR.map(([key, label, def]) => {
          const fk = `maj_${key}`;
          const on = v(fk) !== "";
          return (
            <div key={key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={on} onChange={() => setV(fk, on ? "" : String(def))} className="h-4 w-4" />
              <span className="flex-1 text-slate-600">{label}</span>
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                <input inputMode="decimal" value={v(fk)} onChange={set(fk)} placeholder={String(def)} className={`${inputCls} py-1 pl-5 text-xs`} />
              </div>
            </div>
          );
        })}
      </div>
      {majorTotal > 0 && <div className="mt-1 text-right text-[11px] font-semibold text-emerald-600">+ {money(majorTotal)} added to the rehab</div>}
    </div>
  );

  return (
    <FieldCtx.Provider value={{ v, set }}>
    <SideCalc />
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">📍 Subject property address</span>
        <input value={v("subject")} onChange={set("subject")} placeholder="123 Main St, San Diego, CA 92101" className={`${inputCls} w-full`} />
      </div>

      {/* Comp timer — auto-starts on the first field edit; only stops when the offer is exported */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-slate-900 p-4 text-white">
        <span className="text-sm font-semibold">⏱️ Comp timer</span>
        <span className={`rounded-lg px-3 py-1 font-mono text-2xl font-bold tabular-nums ${timerRunning || timerFinal != null ? "bg-emerald-500/25 text-emerald-200" : "bg-white/10 text-white"}`}>{mmss(timerElapsed)}</span>
        {!timerRunning && timerFinal == null && (
          <span className="text-xs text-slate-300">Starts automatically the moment you enter your first field. It runs until you <b>Export to CRM</b>.</span>
        )}
        {timerRunning && (
          <span className="text-xs font-semibold text-emerald-300">● Timing… stops when you Export to CRM</span>
        )}
        {!timerRunning && timerFinal != null && (
          <>
            <span className="text-sm font-semibold text-emerald-300">✓ Comped in {mmss(timerFinal)}</span>
            <button type="button" onClick={resetTimer} className="ml-auto rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold hover:bg-emerald-600">▶ Time another comp</button>
          </>
        )}
        <span className="w-full text-[11px] text-slate-400">Every underwrite is timed automatically — it starts when you begin entering fields and stops when you export the offer. The time + comp date print at the bottom of the PDF.</span>
      </div>

      <div className="space-y-2">
        {(["Land", "Homes"] as const).map((g) => (
          <div key={g} className="flex flex-wrap items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-400">{g === "Land" ? "🌱 Land" : "🏠 Homes"}</span>
            {TABS.filter((t) => t.group === g).map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t.emoji} {t.label}</button>
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">{TABS.find((t) => t.key === tab)!.blurb}</p>

      {(tab === "assignment" || tab === "novation") && (
        <details className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-xs font-bold text-slate-600 hover:text-brand-navy">⚖️ Wholesale vs Novation — which exit fits this deal?</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead><tr className="text-left text-slate-400">
                <th className="py-1 pr-3"> </th><th className="px-2">🤝 Wholesale (Assignment)</th><th className="px-2">📋 Novation</th>
              </tr></thead>
              <tbody>
                {EXIT_COMPARE.map(([f, w, n]) => (
                  <tr key={f} className="border-t border-slate-100 align-top">
                    <td className="py-1.5 pr-3 font-semibold text-slate-600">{f}</td>
                    <td className="px-2 text-slate-600">{w}</td>
                    <td className="px-2 text-slate-600">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Inputs */}
        <div className="grid grid-cols-1 gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200 sm:grid-cols-2">
          {tab === "assignment" && (
            <>
              {legend}
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Market tier (% of ARV the end buyer supports)</span>
                <select value={marketPct} onChange={set("marketPct")} className={`${inputCls} border-red-300`}>{MARKET_TIERS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
              </label>
              <details className="sm:col-span-2 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
                <summary className="cursor-pointer text-[11px] font-bold text-slate-600 hover:text-brand-navy">📍 Which market tier should I pick?</summary>
                <div className="mt-2 space-y-2">
                  {MARKET_GUIDE.map(([name, desc, ex]) => (
                    <div key={name} className="text-[11px] leading-snug">
                      <div className="font-bold text-slate-700">{name}</div>
                      <div className="text-slate-500">{desc}</div>
                      <div className="text-slate-400"><span className="font-semibold">e.g.</span> {ex}</div>
                    </div>
                  ))}
                  <p className="text-[10px] italic text-slate-400">Higher tier = more desirable market = offer a higher % of ARV (the flipper accepts a thinner margin because the resale is fast and certain).</p>
                  <div className="rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-snug text-emerald-800 ring-1 ring-emerald-200">
                    <b>🏗️ Selling to a developer / tear-down buyer?</b> Go higher — <b>80–88%</b>. Developers pay MORE than flippers because they&apos;re buying the LOT (they&apos;re not backing out a rehab-and-resell margin). Using a flipper tier (70–75%) on a developer deal underprices the offer and gets a &quot;no&quot; from the seller. If the cash number still can&apos;t win the seller, pivot to <b>Novation</b> — it lets you offer them the most.
                  </div>
                </div>
              </details>
              <Field k="arv" label="ARV" prefix="$" placeholder="350,000" req="need" />
              <div className="flex items-end gap-2">
                <div className="flex-1"><Field k="aFee" label="Assignment fee" prefix="$" placeholder={suggestedFee ? suggestedFee.toLocaleString() : "15,000"} req="need" /></div>
                {suggestedFee > 0 && <button type="button" onClick={() => setV("aFee", String(suggestedFee))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-2.5 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200" title={`Tiered minimum for ${tierLabel(arv)} ARV`}>Use {money(suggestedFee)}</button>}
              </div>
              {feeTierTable(arv, "ARV")}
              <div className={reqDiv}>Repairs (required) — square feet × condition</div>
              <Field k="sqft" label="Square feet" req="need" />
              <label><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Condition ($/sf)</span>
                <select value={v("rehabSf")} onChange={set("rehabSf")} className={`${inputCls} border-red-300`}>{REHAB_LEVELS.map(([val, l]) => <option key={val || "x"} value={val}>{l}</option>)}</select>
              </label>
              {rehabDesc(v("rehabSf")) && <p className="sm:col-span-2 -mt-1 text-[11px] italic text-slate-500">📋 {rehabDesc(v("rehabSf"))}</p>}
              {majorRepairs()}
              <div className={optDiv}>Optional — refine the offer</div>
              <Field k="aAnchorPct" label="Anchor below MAO" suffix="%" placeholder="10" req="opt" />
              <Field k="aHoa" label="HOA / special dues ($)" prefix="$" placeholder="0" req="opt" />
              <p className="sm:col-span-2 -mt-1 text-[10px] italic text-slate-400">💡 No need to enter the flipper&apos;s holding or money costs — the market tier % already builds in their carry and profit. Detailed money-cost math lives on the Flip / Wholetail tab.</p>

              <button type="button" onClick={() => setV("aDblClose", aDblOn ? "" : "1")} className={`sm:col-span-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold ring-1 transition ${aDblOn ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-amber-50"}`}>
                🔁 Double close? {aDblOn ? "ON — closing costs added below" : "Tap if the seller won't let us assign"}
                <span className="mt-0.5 block text-[11px] font-normal">{aDblOn ? `We cover the seller's closing on A→B + our seller-side on B→C (1.5% each) = ${money(aDblCost)} extra cost.` : "One tap recalculates the max offer with both closings we'd cover."}</span>
              </button>
              {additionalCosts("aExtra", aExtraN, setAExtraN)}
              <div className={goodDiv}>🟢 ARV comps (required · addr · sold $ · days on market)</div>
              <p className="sm:col-span-2 -mt-1 text-[11px] text-emerald-600">{compsNote}</p>
              {[1, 2, 3].map((i) => (
                <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field k={`comp${i}`} label={`Comp ${i} address`} span={2} req="good" />
                  <Field k={`comp${i}p`} label="Sold $" prefix="$" req="good" />
                  <Field k={`comp${i}d`} label="DOM" req="good" />
                </div>
              ))}
            </>
          )}
          {tab === "developer" && (
            <>
              {legend}
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Area has luxury new builds selling $2M+?</span>
                <select value={v("devLux") || "1"} onChange={set("devLux")} className={`${inputCls} border-red-300`}>
                  <option value="1">Yes — developers are building here</option>
                  <option value="">No — no developer demand (kill it)</option>
                </select>
              </label>
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Waterfront lot?</span>
                <select value={v("devWater")} onChange={set("devWater")} className={inputCls}>
                  <option value="">No</option>
                  <option value="1">Yes — use ONLY waterfront comps</option>
                </select>
              </label>
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">View lot? (hilltop / ocean / city view)</span>
                <select value={v("devView")} onChange={set("devView")} className={inputCls}>
                  <option value="">No — standard lot</option>
                  <option value="1">Yes — use ONLY comps with the same view / hilltop</option>
                </select>
              </label>
              {devView && <p className="sm:col-span-2 -mt-1 text-[10px] italic text-slate-400">👀 A view/hilltop drives a big price premium — every comp above must be the same style AND the same view (a flat lot won&apos;t compare).</p>}
              <Field k="devAsk" label="Seller's asking price ($)" prefix="$" placeholder="1,250,000" req="opt" />
              {/* Subject lot size + auto acres ↔ sq ft converter */}
              <div className="sm:col-span-2 grid grid-cols-3 gap-2">
                <Field k="devLotSize" label="Subject lot size" placeholder="0.42" req="good" span={2} />
                <label><span className="mb-0.5 block text-[11px] font-semibold text-emerald-600">Unit</span>
                  <select value={v("devLotUnit") || "acres"} onChange={set("devLotUnit")} className={`${inputCls} border-emerald-300`}>
                    <option value="acres">acres</option><option value="sqft">sq ft</option>
                  </select>
                </label>
              </div>
              {n("devLotSize") > 0 && <p className="sm:col-span-2 -mt-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">📐 {acresLabel(n("devLotSize"), v("devLotUnit") || "acres")}</p>}
              <Field k="devBuild" label="Buildable area after setbacks / cul-de-sac — optional" span={2} req="opt" />
              <p className="sm:col-span-2 -mt-1 text-[10px] italic text-slate-400">💡 Value the <b>buildable</b> land, not the paper lot. On a main road (3+ lanes / yellow center lines)? It&apos;s worth less.</p>

              <div className={goodDiv}>🟢 Comps — what the DEVELOPER bought each lot for, by lot size</div>
              <p className="sm:col-span-2 -mt-1 text-[11px] text-emerald-600">Pull for-sale + sold comps near the subject. For each, open its <b>sale history</b> and use what the developer <b>PAID for the raw lot</b> before they built — <b>not</b> the current/sold price (that includes the build). Enter that price + the lot size; we turn it into $/acre and apply it to the subject lot. Year built isn&apos;t used in the math — it&apos;s just a double-check.</p>
              {[1, 2, 3].map((i) => {
                const c = devComp(i);
                return (
                  <div key={i} className="sm:col-span-2 rounded-lg border border-emerald-100 bg-emerald-50/30 p-2">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-bold text-emerald-700">Comp {i}</span>
                      <select value={v(`devC${i}Status`) || "sold"} onChange={set(`devC${i}Status`)} className="rounded border border-emerald-200 bg-white px-1.5 py-0.5 text-[11px]">
                        <option value="sold">Sold</option><option value="forsale">For sale</option>
                      </select>
                      {c.perAcre > 0 && <span className="ml-auto rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">{money(c.perAcre)}/acre</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                      <label className="col-span-2"><span className="mb-0.5 block text-[10px] font-semibold text-emerald-600">Developer bought lot for ($)</span><input inputMode="decimal" value={v(`devC${i}Price`)} onChange={set(`devC${i}Price`)} placeholder="raw-lot purchase $" className={inputCls} /></label>
                      <label><span className="mb-0.5 block text-[10px] font-semibold text-emerald-600">Lot size</span><input inputMode="decimal" value={v(`devC${i}Lot`)} onChange={set(`devC${i}Lot`)} placeholder="0.40" className={inputCls} /></label>
                      <label><span className="mb-0.5 block text-[10px] font-semibold text-emerald-600">Unit</span><select value={v(`devC${i}Unit`) || "acres"} onChange={set(`devC${i}Unit`)} className={inputCls}><option value="acres">acres</option><option value="sqft">sq ft</option></select></label>
                      <label className="col-span-2"><span className="mb-0.5 block text-[10px] font-semibold text-slate-400">Year built (double-check only)</span><input value={v(`devC${i}Yr`)} onChange={set(`devC${i}Yr`)} placeholder="optional" className={inputCls} /></label>
                    </div>
                  </div>
                );
              })}

              <div className={optDiv}>Set your fee spread + opening</div>
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-amber-600">Spread below dispo = your fee (Lux Blueprint target $100k–150k)</span>
                <select value={v("devSpread") || "100000"} onChange={set("devSpread")} className={`${inputCls} border-amber-200`}>
                  <option value="150000">$150,000 — safest, biggest fee</option>
                  <option value="100000">$100,000 — target</option>
                  <option value="50000">$50,000 — most aggressive (least we take)</option>
                </select>
              </label>
              <Field k="devAnchorPct" label="Anchor below MAO" suffix="%" placeholder="8" req="opt" />

              <button type="button" onClick={() => setV("devDblClose", devDblOn ? "" : "1")} className={`sm:col-span-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold ring-1 transition ${devDblOn ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-amber-50"}`}>
                🔁 Double close? {devDblOn ? "ON — closing costs added below" : "Tap if the seller won't let us assign"}
                <span className="mt-0.5 block text-[11px] font-normal">{devDblOn ? `We cover the seller's closing on A→B + our seller-side on B→C (1.5% each) = ${money(devDblCost)} extra cost.` : "One tap recalculates the max offer with both closings we'd cover."}</span>
              </button>
            </>
          )}
          {tab === "cash_land" && (
            <>
              {legend}
              <Field k="clAsk" label="Seller's asking price ($)" prefix="$" placeholder="120,000" req="opt" />
              <Field k="clLot" label="Lot size (e.g. 0.25 ac / 10,000 sf)" span={2} req="opt" />

              <div className={goodDiv}>🟢 Comparable LAND sales in the area (recent sold prices)</div>
              <p className="sm:col-span-2 -mt-1 text-[11px] text-emerald-600">Pull 2–3 recently SOLD vacant-land parcels near the subject, similar size. Enter each sold price — we average them into the area land value.</p>
              <Field k="clC1" label="① Land sale — sold $" prefix="$" span={2} req="good" />
              <Field k="clC2" label="② Land sale — sold $" prefix="$" span={2} req="good" />
              <Field k="clC3" label="③ Land sale — sold $" prefix="$" span={2} req="good" />

              <div className={optDiv}>Offer target + opening</div>
              <Field k="clPct" label="Offer as % of avg land value" suffix="%" placeholder="33" req="opt" />
              <Field k="clAnchorPct" label="Anchor below MAO" suffix="%" placeholder="8" req="opt" />
              <p className="sm:col-span-2 -mt-1 text-[10px] italic text-slate-400">💡 We aim for ~33% of the average area land sale. That deep discount on raw land is our room for a fee plus the end buyer&apos;s margin.</p>

              <button type="button" onClick={() => setV("clDblClose", clDblOn ? "" : "1")} className={`sm:col-span-2 rounded-xl px-4 py-2.5 text-left text-sm font-semibold ring-1 transition ${clDblOn ? "bg-amber-100 text-amber-900 ring-amber-300" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-amber-50"}`}>
                🔁 Double close? {clDblOn ? "ON — closing costs added below" : "Tap if the seller won't let us assign"}
                <span className="mt-0.5 block text-[11px] font-normal">{clDblOn ? `We cover the seller's closing on A→B + our seller-side on B→C (1.5% each) = ${money(clDblCost)} extra cost.` : "One tap recalculates the max offer with both closings we'd cover."}</span>
              </button>
            </>
          )}
          {tab === "novation" && (
            <>
              {legend}
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1"><Field k="nList" label="List price (similar-condition value · EMV for land)" prefix="$" placeholder="420,000" req="need" /></div>
                {suggestedList > 0 && (
                  <button type="button" onClick={() => setV("nList", String(suggestedList))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-200" title="Lowest comp — most conservative to sell under 90 days">Use {money(suggestedList)}</button>
                )}
              </div>
              {suggestedList > 0 && (
                <div className="sm:col-span-2 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-emerald-200">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">🏷️ Recommended MLS list price</div>
                  <div className="text-lg font-extrabold text-emerald-700">{money(suggestedList)}</div>
                  <div className="text-[11px] text-emerald-600">Your lowest as-is comp — list here to sell in under 90 days. Enter it as the list price above (or adjust).</div>
                </div>
              )}
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1"><Field k="nMinFee" label="Our minimum fee" prefix="$" placeholder={novSuggestedFee ? novSuggestedFee.toLocaleString() : "15,000"} req="need" /></div>
                {novSuggestedFee > 0 && <button type="button" onClick={() => setV("nMinFee", String(novSuggestedFee))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-2.5 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200" title={`Tiered minimum for ${tierLabel(novFeeBasis)} value`}>Use {money(novSuggestedFee)}</button>}
              </div>
              {feeTierTable(novFeeBasis, "similar-condition value (EMV for land)")}
              <Field k="nComm" label="Agent commission" suffix="%" placeholder="5" req="opt" />
              <p className="sm:col-span-2 -mt-1 text-[10px] italic text-slate-400">📌 Baked in automatically: sale nets 95% of list (price drops + concessions) and we cover the seller-side closing (1.5%) — never the buyer&apos;s.</p>
              <Field k="nReserve" label="Reserve — misc + lender repairs ($)" prefix="$" placeholder="0" req="opt" />
              <Field k="nRepairCredit" label="Buyer repair credit" prefix="$" req="opt" />
              <Field k="nHoa" label="Monthly HOA ($)" prefix="$" placeholder="0" req="opt" />
              <Field k="nHoldMonths" label="Months on market" placeholder="2" req="opt" />
              <Field k="nAnchorPct" label="Anchor below MAO" suffix="%" placeholder="7" req="opt" />
              {additionalCosts("nExtra", nExtraN, setNExtraN)}
              <div className={goodDiv}>🟢 As-is comparables (required · addr · sold $ · days on market)</div>
              <p className="sm:col-span-2 -mt-1 text-[11px] text-emerald-600">{compsNote}</p>
              {[1, 2, 3].map((i) => (
                <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field k={`nComp${i}`} label={`Comp ${i} address`} span={2} req="good" />
                  <Field k={`nComp${i}p`} label="Sold $" prefix="$" req="good" />
                  <Field k={`nComp${i}d`} label="DOM" req="good" />
                </div>
              ))}
            </>
          )}
          {tab === "creative" && (
            <>
              {legend}
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Structure</span>
                <select value={v("cType") || "Seller finance"} onChange={set("cType")} className={inputCls}><option>Seller finance</option><option>Subject-to</option></select>
              </label>
              <div className={reqDiv}>Terms agreed with the seller (we assign these — the end buyer assumes them)</div>
              {(v("cType") || "Seller finance") === "Subject-to" ? (
                <>
                  <Field k="cLoan" label="Loan balance assumed" prefix="$" req="need" />
                  <Field k="cPmt" label="Monthly payment (PITI)" prefix="$" req="need" />
                  <Field k="cDown" label="Down to seller (if any)" prefix="$" req="opt" />
                  <Field k="cTerm" label="Notes / term" req="opt" />
                </>
              ) : (
                <>
                  <Field k="cPrice" label="Agreed price" prefix="$" req="need" />
                  <Field k="cDown" label="Down to seller (if any)" prefix="$" req="need" />
                  <Field k="cPmt" label="Monthly to seller" prefix="$" req="need" />
                  <Field k="cTerm" label="Term (e.g. 60 mo / balloon 5yr)" req="need" />
                </>
              )}
              <div className={reqDiv}>Our money — assignment fee + down-payment markup</div>
              <p className="sm:col-span-2 -mt-1 text-[11px] text-slate-500">We collect a bigger down from the end buyer than we owe the seller and keep the spread (e.g. seller down $5k → tell the end buyer $10–15k), plus our assignment fee.</p>
              <Field k="cFee" label="Our assignment fee (to end buyer)" prefix="$" placeholder="15,000" req="need" />
              <Field k="cBuyerDown" label="Down we charge the end buyer" prefix="$" placeholder="15,000" req="need" />
            </>
          )}
          {tab === "listing" && (
            <>
              {legend}
              <Field k="lList" label="List price" prefix="$" span={2} req="need" />
              <Field k="lComm" label="Listing-side commission" suffix="%" placeholder="2.5" req="opt" />
              <Field k="lRef" label="Referral fee (% of commission)" suffix="%" placeholder="25" req="opt" />
              <Field k="lFlat" label="…or flat marketing fee (overrides)" prefix="$" span={2} placeholder="2,500" req="opt" />
            </>
          )}
          {tab === "flip" && (
            <>
              {legend}
              {stepDiv(1, "What's it worth fixed up?", "The ARV — what it sells for AFTER the flip. Back it with 3 real sold comps.")}
              <Field k="arv" label="ARV — fixed-up value" prefix="$" placeholder="350,000" span={2} req="need" />
              <p className="sm:col-span-2 -mt-1 text-[11px] text-emerald-600">{compsNote}</p>
              {[1, 2, 3].map((i) => (
                <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field k={`comp${i}`} label={`Comp ${i} address`} span={2} req="good" />
                  <Field k={`comp${i}p`} label="Sold $" prefix="$" req="good" />
                  <Field k={`comp${i}d`} label="DOM" req="good" />
                </div>
              ))}
              {stepDiv(2, "What will the repairs cost?", "Type a bid if you have one; otherwise sqft × condition estimates it. Tap the big-ticket items that apply.")}
              <Field k="fRehab" label="Contractor bid / known rehab cost ($ — optional)" prefix="$" span={2} req="need" />
              <Field k="sqft" label="Square feet" req="need" />
              <label><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Condition ($/sf)</span>
                <select value={v("rehabSf")} onChange={set("rehabSf")} className={`${inputCls} border-red-300`}>{REHAB_LEVELS.map(([val, l]) => <option key={val || "x"} value={val}>{l}</option>)}</select>
              </label>
              {rehabDesc(v("rehabSf")) && <p className="sm:col-span-2 -mt-1 text-[11px] italic text-slate-500">📋 {rehabDesc(v("rehabSf"))}</p>}
              {majorRepairs()}
              {stepDiv(3, "What does it cost to hold & sell?", "Flippers average 4–6 months depending on the work, crew speed, market & listing season. Carry costs scale with the months you set.")}
              <Field k="fHold" label="Months they'll hold it (avg 4–6)" placeholder="6" req="opt" />
              <Field k="fComm" label="Realtor commission (% of ARV)" suffix="%" placeholder="3" req="opt" />
              <Field k="fClosing" label="Closing costs (% of ARV)" suffix="%" placeholder="2" req="opt" />
              <Field k="fCarry" label="Utilities / taxes / insurance (% of ARV per YEAR)" suffix="%" placeholder="2" req="opt" />
              <Field k="fHoa" label="Monthly HOA ($)" prefix="$" req="opt" />
              <Field k="fPm" label="Project manager / misc ($)" prefix="$" req="opt" />
              {stepDiv(4, "What does their money cost?", "Flippers almost never pay true cash — they use hard/private money. Leave the loan blank and we auto-assume 85% of the purchase + all of the rehab. Pick a lender preset to fill the rate, points & fee.")}
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Lender preset (fills rate / points / fee)</span>
                <select value={v("fLender")} onChange={(e) => { const L = LENDERS[e.target.value]; setF((p) => ({ ...p, fLender: e.target.value, ...(L ? { fRate: L.rate, fPoints: L.points, fSvc: L.svc } : {}) })); }} className={inputCls}>
                  <option value="">— custom —</option>
                  {Object.keys(LENDERS).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <Field k="fLoan" label="Loan amount (blank = auto-estimate)" prefix="$" req="opt" />
              <Field k="fRate" label="Interest rate" suffix="%" placeholder="10" req="opt" />
              <Field k="fPoints" label="Points" suffix="%" placeholder="1" req="opt" />
              <Field k="fSvc" label="Service fee ($)" prefix="$" req="opt" />
              <Field k="fGap" label="Gap loan amount ($)" prefix="$" req="opt" />
              <Field k="fGapRate" label="Gap interest rate" suffix="%" placeholder="15" req="opt" />
              {stepDiv(5, "What does the flipper need to make?", "Their minimum profit to say yes — plus any commission credit they get back at purchase.")}
              <Field k="fMinProfit" label="Flipper's minimum profit" prefix="$" placeholder="30,000" req="opt" />
              <Field k="fPurchCredit" label="Purchase commission credit ($)" prefix="$" req="opt" />
              <div className={optDiv}>Profit check (optional)</div>
              <Field k="fPurchase" label="Your purchase price ($)" prefix="$" span={2} req="opt" />
            </>
          )}
          {tab === "rental" && (
            <>
              {legend}
              {stepDiv(1, "The property", "What it costs and what it rents for. That's most of the math.")}
              <Field k="rPrice" label="Purchase price (defaults to ARV)" prefix="$" placeholder={arv ? arv.toLocaleString() : "350,000"} req="need" />
              <Field k="rRent" label="Expected monthly rent" prefix="$" placeholder="2,400" req="need" />
              {stepDiv(2, "What the landlord pays each year", "Taxes + insurance + HOA, plus the standard set-asides (defaults are industry-normal — leave them unless you know better).")}
              <Field k="rTax" label="Annual property tax ($)" prefix="$" req="opt" />
              <Field k="rIns" label="Annual insurance ($)" prefix="$" req="opt" />
              <Field k="rHoa" label="Monthly HOA ($)" prefix="$" placeholder="0" req="opt" />
              <Field k="rVac" label="Vacancy set-aside" suffix="%" placeholder="5" req="opt" />
              <Field k="rMgmt" label="Property management" suffix="%" placeholder="8" req="opt" />
              <Field k="rMaint" label="Maintenance / capex" suffix="%" placeholder="8" req="opt" />
              {stepDiv(3, "What return does the buyer want?", "Their target cap rate. The max offer is the price where this deal still hits it.")}
              <Field k="rTargetCap" label="Target cap rate" suffix="%" placeholder="7" span={2} req="opt" />
              {stepDiv(4, "🎁 Wrap & assign — the terms we can lock up", "Lock seller-finance / sub-to terms, wrap them, assign to a cash-flowing end buyer. Our payment to the seller must sit BELOW their max — the gap is our monthly spread.")}
              <Field k="rWrapCF" label="End buyer's cashflow target ($/mo)" prefix="$" placeholder="300" req="opt" />
              <Field k="rSellerPmt" label="Our monthly payment on locked terms ($)" prefix="$" placeholder="0" req="opt" />
              {stepDiv(5, "🏦 BRRRR check — can they refi out?", "BRRRR buyers refinance at ~75% of ARV to pull their cash back. Price + rehab must fit under that or their money stays stuck in the deal.")}
              <Field k="rArv" label="ARV — fixed-up value ($)" prefix="$" placeholder={arv ? arv.toLocaleString() : "400,000"} req="opt" />
              <Field k="rRehab" label="Rehab cost ($)" prefix="$" placeholder="0" req="opt" />
            </>
          )}
        </div>

        {/* Results */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-50 to-white p-4 ring-1 ring-slate-200">
          {(tab === "assignment" || tab === "novation") && maoConflict && (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-300">
              ⚠️ Cash MAO ({money(cashMao)}) is HIGHER than your Novation MAO ({money(novMao)}). Novation should usually let you offer the seller <em>more</em> than cash (no flipper margin or holding). Re-check the novation list price, commission, or fees — something&apos;s off.
            </div>
          )}
          {tab === "assignment" && (
            <>
              <MathReceipt
                title="Cash offer"
                rows={[
                  { text: `Fixed-up value (ARV) is ${money(arv)}. A flipper pays ${marketPct}% of that`, amount: money(flipperTarget) },
                  { text: "Take away the repair cost", amount: money(repairs), minus: true },
                  ...(aHoa + aExtra > 0 ? [{ text: "Take away HOA dues + extras (keys, liens…)", amount: money(aHoa + aExtra), minus: true }] : []),
                  { text: "Take away our assignment fee (what we earn)", amount: money(aFee), minus: true },
                ]}
                totalLabel="MAX OFFER to the seller"
                total={money(cashMao)}
                coach={cashMao > 0 ? `Never offer above ${money(cashMao)}. Open the conversation at ${money(aAnchor)} and work up.` : "Fill in ARV and repairs above to get your number."}
              />
              <Res label={`Flipper resale target (${marketPct}% of ARV)`} value={money(flipperTarget)} tone="muted" />
              <Res label="− Repairs" value={money(repairs)} tone="muted" />
              {aHoa > 0 && <Res label="− HOA / special dues" value={money(aHoa)} tone="muted" />}
              {extraItems("aExtra", aExtraN).map((x, i) => <Res key={i} label={`− ${x.note || "Additional cost"}`} value={money(x.amt)} tone="muted" />)}
              <Res label="− Assignment fee" value={money(aFee)} tone="muted" />
              <Res label="🎯 Cash MAO (max offer to seller)" value={money(cashMao)} tone={cashMao > 0 ? "navy" : "bad"} big />
              {aDblOn && (
                <div className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                  <div className="text-[12px] font-bold text-amber-800">🔁 Double close — closing paid on BOTH escrows</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-amber-700">Seller&apos;s closing on A→B ({money(aDblBuy)}) + our seller-side on B→C ({money(aDblSell)}) at 1.5% each = <b>{money(aDblCost)}</b> (vs $0 on an assignment). The end buyer pays their own closing. Offer the seller <b>{money(aDblMao)}</b> to keep the same fee — or hold the MAO and your fee drops by {money(aDblCost)}.</div>
                </div>
              )}
              {aDblOn && <Res label="🎯 Double-close MAO (offer this instead)" value={money(aDblMao)} tone={aDblMao > 0 ? "navy" : "bad"} big />}
              {cashMao > 0 && <Res label="Sanity check" value={`${pctOfArv(cashMao)} · ${aSaneWord}`} tone={aSaneTone} />}
              {cashMao > 0 && (
                <div className="sm:col-span-2 rounded-lg bg-sky-50 px-3 py-2 ring-1 ring-sky-200">
                  <div className="text-[12px] font-bold text-sky-800">🏷️ Same net on the open market: {money(onMktEqLo)} – {money(onMktEqHi)}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-sky-700">To actually walk away with your <b>{money(cashMao)}</b> cash offer, they&apos;d have to <b>sell for {money(onMktEqLo)}–{money(onMktEqHi)}</b> on-market — the extra {money(onMktEqLo - cashMao)}–{money(onMktEqHi - cashMao)} is lost to agent commission + closing (~8–10%). And that&apos;s before months of showings, repairs, and no guarantee it sells. Your cash offer nets the same — clean, fast, certain.</div>
                </div>
              )}
              <Res label="⚓ Anchor (open here)" value={money(aAnchor)} tone="good" />
              <Res label="Negotiate" value={`${money(aAnchor)} → ${money(cashMao)}`} tone="muted" />
              {cashMao > 0 && <OfferLadder rungs={ladder(aAnchor, cashMao)} />}
            </>
          )}
          {tab === "developer" && (
            <>
              {!devLux && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 ring-1 ring-red-300">🚫 No $2M+ luxury new builds here → no developer demand. Mark this deal dead.</div>}
              <Res label="Subject lot" value={devSubjAcres > 0 ? `${devSubjAcres.toFixed(2)} acres` : "—"} tone="muted" />
              {[1, 2, 3].map((i) => { const c = devComp(i); return c.perAcre > 0 ? <Res key={i} label={`Comp ${i} — ${(v(`devC${i}Status`) || "sold") === "forsale" ? "for sale" : "sold"} (developer $/acre)`} value={`${money(c.perAcre)}/acre`} tone="muted" /> : null; })}
              <Res label="Avg developer $/acre" value={devAvgPerAcre > 0 ? `${money(devAvgPerAcre)}/acre` : "—"} tone={devAvgPerAcre > 0 ? "navy" : "bad"} />
              <Res label="🎯 Dispo price (land value = $/acre × lot)" value={money(devDispo)} tone={devDispo > 0 ? "navy" : "bad"} big />
              <Res label="− Spread (your fee)" value={money(devSpread)} tone="muted" />
              <Res label="🎯 Developer MAO (max offer to seller)" value={money(devMao)} tone={devMao > 0 ? "navy" : "bad"} big />
              {devDblOn && (
                <div className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                  <div className="text-[12px] font-bold text-amber-800">🔁 Double close — closing paid on BOTH escrows</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-amber-700">Seller&apos;s closing on A→B ({money(devDblBuy)}) + our seller-side on B→C ({money(devDblSell)}) at 1.5% each = <b>{money(devDblCost)}</b>. The developer pays their own closing. Offer the seller <b>{money(devDblMao)}</b> to keep the same spread.</div>
                </div>
              )}
              {devDblOn && <Res label="🎯 Double-close MAO (offer this instead)" value={money(devDblMao)} tone={devDblMao > 0 ? "navy" : "bad"} big />}
              {devDispo > 0 && <Res label="Sanity check" value={`fee ${money(devFeeAtMao)} · ${devSaneWord}`} tone={devSaneTone} />}
              {devMao > 0 && (
                <div className="sm:col-span-2 rounded-lg bg-sky-50 px-3 py-2 ring-1 ring-sky-200">
                  <div className="text-[12px] font-bold text-sky-800">🏷️ Same net on the open market: {money(devMktEqLo)} – {money(devMktEqHi)}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-sky-700">To net your <b>{money(devMao)}</b> cash offer for the lot, they&apos;d have to <b>sell for {money(devMktEqLo)}–{money(devMktEqHi)}</b> with an agent — the extra {money(devMktEqLo - devMao)}–{money(devMktEqHi - devMao)} is lost to commission + closing (~8–10%), before months on market. Your cash offer nets the same — clean, fast, certain.</div>
                </div>
              )}
              <Res label="⚓ Anchor (open here)" value={money(devAnchor)} tone="good" />
              <Res label="Your fee at anchor" value={money(devFeeAtAnchor)} tone="good" />
              <Res label="Negotiate (offer to seller)" value={`${money(devAnchor)} → ${money(devMao)}`} tone="muted" />
              {devMao > 0 && <OfferLadder rungs={ladder(devAnchor, devMao)} />}
              {devOverAsk > 0 && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Seller asking {money(devAsk)} — {money(devOverAsk)} over your max. If they won&apos;t come down, it&apos;s likely dead.</div>}
              {devWater && <div className="sm:col-span-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-700 ring-1 ring-sky-200">🌊 Waterfront — make sure every comp above is also waterfront, or the number will be too high.</div>}
              {devView && <div className="sm:col-span-2 rounded-lg bg-sky-50 px-3 py-2 text-[11px] text-sky-700 ring-1 ring-sky-200">👀 View / hilltop — make sure every comp is the same style AND the same view (hilltop/ocean/city). A flat or no-view lot will pull the number off.</div>}
            </>
          )}
          {tab === "cash_land" && (
            <>
              <Res label="① Land sale (sold)" value={money(n("clC1"))} tone="muted" />
              <Res label="② Land sale (sold)" value={money(n("clC2"))} tone="muted" />
              <Res label="③ Land sale (sold)" value={money(n("clC3"))} tone="muted" />
              <Res label="🎯 Avg area land value" value={money(clLandAvg)} tone={clLandAvg > 0 ? "navy" : "bad"} big />
              <Res label={`× Offer target (${clPct}%)`} value={`${clPct}%`} tone="muted" />
              <Res label="🎯 Cash (Land) MAO — max offer" value={money(clMao)} tone={clMao > 0 ? "navy" : "bad"} big />
              {clDblOn && (
                <div className="sm:col-span-2 rounded-lg bg-amber-50 px-3 py-2 ring-1 ring-amber-200">
                  <div className="text-[12px] font-bold text-amber-800">🔁 Double close — closing paid on BOTH escrows</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-amber-700">Seller&apos;s closing on A→B ({money(clDblBuy)}) + our seller-side on B→C ({money(clDblSell)}) at 1.5% each = <b>{money(clDblCost)}</b>. The end buyer pays their own closing. Offer the seller <b>{money(clDblMao)}</b> to keep the same margin.</div>
                </div>
              )}
              {clDblOn && <Res label="🎯 Double-close MAO (offer this instead)" value={money(clDblMao)} tone={clDblMao > 0 ? "navy" : "bad"} big />}
              {clLandAvg > 0 && <Res label="Sanity check" value={clSaneWord} tone={clSaneTone} />}
              <Res label="⚓ Anchor (open here)" value={money(clAnchor)} tone="good" />
              <Res label="Negotiate (offer to seller)" value={`${money(clAnchor)} → ${money(clMao)}`} tone="muted" />
              {clMao > 0 && <OfferLadder rungs={ladder(clAnchor, clMao)} />}
              {clOverAsk > 0 && <div className="sm:col-span-2 rounded-lg bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700 ring-1 ring-red-200">Seller asking {money(clAsk)} — {money(clOverAsk)} over your max. If they won&apos;t come down, likely dead.</div>}
            </>
          )}
          {tab === "novation" && (
            <>
              <MathReceipt
                title="Novation offer"
                rows={[
                  { text: `List it at ${money(nList)} — realistically it sells for ${nRealismPct}% of that`, amount: money(nExpectedSale) },
                  { text: `Take away the agent's commission (${nComm}%)`, amount: money(nExpectedSale * (nComm / 100)), minus: true },
                  { text: `Take away seller closing costs (${nSellerClosePct}%)`, amount: money(nSellerClose), minus: true },
                  ...(nRepairCredit + nHoaCost + nExtra + nReserve > 0 ? [{ text: "Take away repair credit + HOA + extras + reserve", amount: money(nRepairCredit + nHoaCost + nExtra + nReserve), minus: true }] : []),
                  { text: "Take away our fee (what we earn)", amount: money(nMinFee), minus: true },
                ]}
                totalLabel="MAX we can pay the seller"
                total={money(novMao)}
                coach={novMao > 0 ? `The seller can walk away with up to ${money(novMao)}. Open at ${money(novAnchor)} — every dollar below max is extra fee for us.` : "Enter the list price and fee above to get your number."}
              />
              {suggestedList > 0 && <Res label="🏷️ Recommended list price" value={money(suggestedList)} tone="good" />}
              {nList > 0 && <Res label={`Expected sale at ${nRealismPct}% of list`} value={money(nExpectedSale)} tone="muted" />}
              {nReserve > 0 && <Res label="− Reserve (misc + lender repairs)" value={money(nReserve)} tone="muted" />}
              {nHoaCost > 0 && <Res label={`− HOA dues (${nHoldMonths} mo)`} value={money(nHoaCost)} tone="muted" />}
              {extraItems("nExtra", nExtraN).map((x, i) => <Res key={i} label={`− ${x.note || "Additional cost"}`} value={money(x.amt)} tone="muted" />)}
              <Res label="Net after credit, commission, closing, HOA + extras" value={money(nNet)} tone="muted" />
              <Res label="🎯 Novation MAO (max seller payout)" value={money(novMao)} tone={novMao > 0 ? "navy" : "bad"} big />
              {novMao > 0 && nList > 0 && <Res label="Sanity check" value={`${Math.round((novMao / nList) * 100)}% of list · ${nSaneWord}`} tone={nSaneTone} />}
              <Res label="⚓ Anchor payout (open here)" value={money(novAnchor)} tone="good" />
              <Res label="Our fee at anchor" value={money(feeAtAnchor)} tone="good" />
              <Res label="Negotiate (seller payout)" value={`${money(novAnchor)} → ${money(novMao)}`} tone="muted" />
              {novMao > 0 && <OfferLadder rungs={ladder(novAnchor, novMao)} />}
            </>
          )}
          {tab === "creative" && (
            <>
              <Res label="Structure" value={v("cType") || "Seller finance"} tone="muted" />
              <Res label="Assignment fee" value={money(cFee)} tone="muted" />
              <Res label={`Down markup (buyer ${money(cBuyerDown)} − seller ${money(cDown)})`} value={money(cDownMarkup)} tone={cDownMarkup > 0 ? "good" : "muted"} />
              <Res label="🎯 Total margin to us" value={money(cMargin)} tone={cMargin > 0 ? "good" : "muted"} big />
              <p className="mt-2 text-[11px] text-slate-400">We don&apos;t buy on these terms — we assign them to an end buyer who wants them. We make the assignment fee + the spread on the down payment; they assume the exact agreed terms.</p>
            </>
          )}
          {tab === "listing" && (
            <>
              <Res label="Listing commission" value={money(lList * (lComm / 100))} tone="muted" />
              <Res label="🎯 Our marketing / referral fee" value={money(mktFee)} tone={mktFee > 0 ? "good" : "muted"} big />
              <p className="mt-2 text-[11px] text-slate-400">Typical: 25% of the listing-side commission (industry-standard referral), or a flat $2,500–$5,000.</p>
            </>
          )}
          {tab === "flip" && (
            <>
              <MathReceipt
                title="Flip / Wholetail offer"
                rows={[
                  { text: `Start with the fixed-up value (ARV)${n("fPurchCredit") > 0 ? ` + ${money(n("fPurchCredit"))} purchase credit` : ""}`, amount: money(arv + n("fPurchCredit")) },
                  { text: "Take away the repair cost", amount: money(fRehab), minus: true },
                  { text: `Take away hold & sell costs (commission, closing, carry, HOA over ${fHold} mo)`, amount: money(fPropertyCosts - fRehab), minus: true },
                  ...(fMoneyCost > 0 ? [{ text: `Take away their hard-money cost${fLoanAuto ? ` (auto: ${money(fLoan)} loan ≈ 85% of purchase + rehab)` : " (points + interest + fees)"}`, amount: money(fMoneyCost), minus: true }] : []),
                  { text: "Take away the flipper's minimum profit", amount: money(fMinProfit), minus: true },
                ]}
                totalLabel="MAX OFFER (flip MAO)"
                total={money(fMao)}
                coach={fMao > 0 ? `A flipper can pay up to ${money(fMao)} and still make their ${money(fMinProfit)}. Never contract above it.` : "Fill in the ARV and repairs above to get your number."}
              />
              <Res label="Total property costs" value={money(fPropertyCosts)} tone="muted" />
              {fLoanAuto && fLoan > 0 && <Res label="Assumed hard-money loan (85% purchase + rehab)" value={money(fLoan)} tone="muted" />}
              <Res label="Total money cost" value={money(fMoneyCost)} tone="muted" />
              <Res label="Total costs" value={money(fTotalCosts)} tone="muted" />
              <Res label="− Minimum profit" value={money(fMinProfit)} tone="muted" />
              <Res label="🎯 Max Offer (flip MAO)" value={money(fMao)} tone={fMao > 0 ? "navy" : "bad"} big />
              {n("fPurchase") > 0 && <Res label="Profit at your purchase price" value={money(fProfit)} tone={fProfit > 0 ? "good" : "bad"} />}
            </>
          )}
          {tab === "rental" && (
            <>
              <MathReceipt
                title="Buy & Hold offer"
                rows={[
                  { text: `Rent ${money(rRent)}/mo × 12 months = a year of rent`, amount: money(rGrossYr) },
                  { text: `Take away taxes, insurance, HOA, vacancy, management & repairs`, amount: money(rOpEx), minus: true },
                  { text: `What's left is the yearly profit (NOI) — divide it by the buyer's ${rTargetCap}% target return`, amount: money(rNoi) },
                ]}
                totalLabel={`MAX OFFER at ${rTargetCap}% cap`}
                total={money(rMaxOffer)}
                coach={rMaxOffer > 0 ? `A landlord wanting ${rTargetCap}% back per year can pay up to ${money(rMaxOffer)}. Quick screen: rent should be ≥1% of price (this deal: ${rOnePct.toFixed(2)}%).` : "Enter the monthly rent above to get your number."}
              />
              <Res label="Gross annual rent" value={money(rGrossYr)} tone="muted" />
              <Res label="− Operating expenses" value={money(rOpEx)} tone="muted" />
              <Res label="Net operating income (NOI)" value={money(rNoi)} tone="muted" />
              <Res label="Cap rate" value={rPrice > 0 ? `${rCapRate.toFixed(1)}%` : "—"} tone={rCapRate >= rTargetCap && rCapRate > 0 ? "good" : "bad"} />
              <Res label="Gross yield" value={rPrice > 0 ? `${rGrossYield.toFixed(1)}%` : "—"} tone="muted" />
              <Res label="1% rule (rent ÷ price)" value={rPrice > 0 ? `${rOnePct.toFixed(2)}%` : "—"} tone={rOnePct >= 1 ? "good" : "bad"} />
              <Res label={`🎯 Max offer at ${rTargetCap}% cap`} value={money(rMaxOffer)} tone={rMaxOffer > 0 ? "navy" : "bad"} big />
              {rNoi > 0 && (
                <div className="sm:col-span-2 mt-1 rounded-lg bg-violet-50 px-3 py-2 ring-1 ring-violet-200">
                  <div className="text-[12px] font-bold text-violet-800">🎁 Wrap &amp; assign — the terms to lock up</div>
                  <div className="mt-1 space-y-0.5 text-[12px] text-violet-700">
                    <div>Monthly profit (NOI ÷ 12): <b>{money(rNoi / 12)}</b> − end buyer&apos;s cashflow <b>{money(rWrapCF)}</b> =</div>
                    <div className="text-sm font-extrabold text-violet-900">Max monthly payment (P&amp;I) the end buyer can pay us: {money(rMaxWrapPmt)}</div>
                    <div className="text-[11px] text-violet-500">Taxes, insurance &amp; HOA are already counted inside NOI — this ceiling is principal + interest only.</div>
                    {rSellerPmt > 0 ? (
                      <div>Our locked payment to the seller is <b>{money(rSellerPmt)}</b> → monthly spread on the wrap: <b className={rWrapSpread > 0 ? "text-emerald-700" : "text-red-600"}>{money(rWrapSpread)}/mo</b>{rWrapSpread <= 0 ? " — locked terms are TOO HIGH, negotiate the payment down" : ""}</div>
                    ) : (
                      <div>Lock up seller terms with a monthly payment <b>below {money(rMaxWrapPmt)}</b> — every dollar under it is our monthly spread.</div>
                    )}
                  </div>
                </div>
              )}
              {rBrrrOk !== null && (
                <div className={`sm:col-span-2 mt-1 rounded-lg px-3 py-2 ring-1 ${rBrrrOk ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}>
                  <div className={`text-[12px] font-bold ${rBrrrOk ? "text-emerald-800" : "text-red-800"}`}>
                    {rBrrrOk ? "🏦 ✅ BRRRR-able" : "🏦 🚫 Won't refi out"} — all-in {money(rAllIn)} vs 75% of ARV = {money(rRefiLimit)}
                  </div>
                  <div className={`mt-0.5 text-[11px] leading-snug ${rBrrrOk ? "text-emerald-700" : "text-red-700"}`}>
                    {rBrrrOk
                      ? `The buyer can refinance at 75% of the ${money(rArv)} ARV and pull their cash back out — a real BRRRR exit. Room to spare: ${money(rRefiLimit - rAllIn)}.`
                      : `Price + rehab exceeds the 75%-of-ARV refi by ${money(rAllIn - rRefiLimit)} — their cash stays stuck in the deal. Lower the price, or pitch it as a plain rental, not a BRRRR.`}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-400">Cap rate = NOI ÷ price. The 1% rule (monthly rent ≥ 1% of price) is a quick screen. Max offer = NOI ÷ the buyer&apos;s target cap rate.</p>
            </>
          )}
        </div>
      </div>

      {/* DEAL OUTCOME — one place, fill in as the deal moves: did the seller start
          too high, and what's the real margin once they accept a number? */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold text-slate-700">🧾 Deal outcome <span className="text-[11px] font-normal text-slate-400">— optional, fill in as you negotiate</span></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {showAsking && <Field k="askPrice" label="Seller's asking price (what they want)" prefix="$" placeholder="e.g. 300,000" req="need" />}
          <Field k="acceptedPrice" label="Under-contract price (what we lock with the seller)" prefix="$" placeholder="e.g. 250,000" req="good" />
          <Field k="salePrice" label={`List / sale price (defaults to ${tab === "novation" || tab === "listing" ? "list" : "ARV"})`} prefix="$" placeholder={saleDefault ? saleDefault.toLocaleString() : "e.g. 350,000"} req="opt" />
        </div>
        {(asking > 0 || accepted > 0) && (
          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
            {showAsking && asking > 0 && dealMax > 0 && (
              overAsk > 0
                ? <Res label={`Asking is above your max offer (${money(dealMax)})`} value={`${money(overAsk)} over → overpriced`} tone="bad" />
                : <Res label={`Asking is within your max offer (${money(dealMax)})`} value={`${money(-overAsk)} of room → workable`} tone="good" />
            )}
            {accepted > 0 && <Res label={`${marginLabel} at ${money(accepted)} accepted`} value={money(profitAtAccepted)} tone={profitAtAccepted > 0 ? "good" : "bad"} big />}
            {accepted > 0 && buyExit && dealMax > 0 && (
              <Res label="vs your max offer" value={accepted <= dealMax ? `${money(dealMax - accepted)} better than max ✅` : `${money(accepted - dealMax)} over max ⚠️`} tone={accepted <= dealMax ? "good" : "bad"} />
            )}
            {roi != null && <Res label={`📈 ROI · ${money(salePrice)} sale vs ${money(accepted)} contract`} value={`${roi >= 0 ? "+" : ""}${roi.toFixed(0)}%`} tone={roi > 0 ? "good" : "bad"} big />}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={exportPdf} className="rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy hover:opacity-90">📄 Export to CRM (PDF) — stops the timer</button>
        <span className="text-[11px] text-slate-400">Opens a clean report — choose “Save as PDF”, then upload to REI Reply.</span>
      </div>
      <p className="text-[11px] text-slate-400">Estimates only — confirm comps, repair scope, and title before making an offer. Next up: Wholetail, Flip, and Luxury assignment tabs.</p>
    </div>
    </FieldCtx.Provider>
  );
}
