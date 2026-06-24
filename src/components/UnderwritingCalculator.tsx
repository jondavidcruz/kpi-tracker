"use client";

import { useState, createContext, useContext } from "react";

const TABS = [
  { key: "assignment", label: "Assignment", emoji: "🤝", blurb: "Cash offer. MAO = (ARV × market %) − repairs − your fee. The market % already covers the flipper's carry + profit. Anchor opens below MAO." },
  { key: "novation", label: "Novation", emoji: "📋", blurb: "List at current similar-condition value, cover the seller's closing + commission (no holding — retail buyer). Find the max seller payout." },
  { key: "creative", label: "Creative", emoji: "🔑", blurb: "Seller-finance or Subject-to. We assign the terms to an end buyer and collect an assignment fee." },
  { key: "listing", label: "Listing", emoji: "🏷️", blurb: "Traditional listing with our agent. We collect a referral / marketing fee." },
  { key: "flip", label: "Flip / Wholetail", emoji: "🔨", blurb: "Full buyer's-lens analysis: Max Offer = ARV + purchase credit − min profit − (property costs + money costs)." },
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
const REHAB_LEVELS: [string, string][] = [
  ["", "— pick condition —"],
  ["17", "Cleanup (~$17/sf)"],
  ["22", "Lipstick (~$22/sf)"],
  ["30", "Interior (~$30/sf)"],
  ["35", "Full (~$35/sf)"],
  ["45", "Full + 2 big items (~$45/sf)"],
  ["55", "Full + 4 big items (~$55/sf)"],
  ["65", "Full + 6 big items (~$65/sf)"],
  ["75", "Full gut (~$75/sf)"],
];

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

function Res({ label, value, tone = "navy", big }: { label: string; value: string; tone?: "navy" | "good" | "bad" | "muted"; big?: boolean }) {
  const cls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "muted" ? "text-slate-500" : "text-brand-navy";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm text-slate-600">{label}</span>
      <span className={`font-extrabold tabular-nums ${big ? "text-2xl" : "text-base"} ${cls}`}>{value}</span>
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

export default function UnderwritingCalculator() {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("assignment");
  const [f, setF] = useState<Record<string, string>>({});
  const v = (k: string) => f[k] ?? "";
  const n = (k: string) => num(v(k));
  const setV = (k: string, val: string) => setF((p) => ({ ...p, [k]: val }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV(k, e.target.value);

  // Additional-cost rows (cash-for-keys, eviction, liens…) — 1 by default, "+ add" for more.
  const [aExtraN, setAExtraN] = useState(1);
  const [nExtraN, setNExtraN] = useState(1);
  const extraSum = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => n(`${prefix}${i}`)).reduce((s, x) => s + x, 0);
  const extraItems = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => ({ amt: n(`${prefix}${i}`), note: v(`${prefix}Note${i}`) })).filter((x) => x.amt > 0);

  const [comping, setComping] = useState(false);
  const [compMsg, setCompMsg] = useState("");
  async function pullComps() {
    const addr = (f.subject ?? "").trim();
    if (addr.length < 6) { setCompMsg("Enter the subject address first."); return; }
    setComping(true); setCompMsg("");
    try {
      const r = await fetch(`/api/comps?address=${encodeURIComponent(addr)}`);
      const d = await r.json();
      if (d.configured === false) { setCompMsg("Comp pull isn't connected yet — add a RentCast API key in Vercel (see setup)."); return; }
      if (d.error) { setCompMsg(d.error); return; }
      setF((p) => {
        const next = { ...p };
        if (d.arv) next.arv = String(d.arv);
        (d.comps || []).slice(0, 3).forEach((c: { address: string; price: number; dom: number | null }, i: number) => {
          const j = i + 1;
          next[`comp${j}`] = c.address; next[`comp${j}p`] = c.price ? String(c.price) : ""; next[`comp${j}d`] = c.dom != null ? String(c.dom) : "";
          next[`nComp${j}`] = c.address; next[`nComp${j}p`] = c.price ? String(c.price) : ""; next[`nComp${j}d`] = c.dom != null ? String(c.dom) : "";
        });
        return next;
      });
      setCompMsg(`Pulled ARV ${d.arv ? "$" + Number(d.arv).toLocaleString() : "?"} + ${(d.comps || []).length} comps. Review & adjust before offering.`);
    } catch { setCompMsg("Couldn't reach the comp service."); }
    finally { setComping(false); }
  }

  // Major / big-ticket repair items — checked items add their cost to the rehab.
  const majorTotal = MAJOR.reduce((s, [key]) => s + n(`maj_${key}`), 0);

  // ---- Assignment ----
  const marketPct = v("marketPct") || "70";
  const arv = n("arv");
  const suggestedFee = feeForArv(arv); // tiered minimum we plan for, by ARV
  const aFee = f.aFee != null && f.aFee !== "" ? n("aFee") : suggestedFee;
  const sqft = n("sqft"), rehabSf = num(v("rehabSf"));
  const repairsCalc = sqft * rehabSf;
  const repairs = (n("repairs") || repairsCalc) + majorTotal;
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

  // ---- Novation ----
  const novCompPrices = [n("nComp1p"), n("nComp2p"), n("nComp3p")].filter((x) => x > 0);
  const suggestedList = novCompPrices.length ? Math.min(...novCompPrices) : 0; // conservative → sells fastest
  const nList = n("nList"), nComm = num(v("nComm") || "5"), nRepairCredit = n("nRepairCredit");
  // Novation is valued on SIMILAR-CONDITION value (or EMV for land), NOT after-repair value,
  // so the fee tier keys off the list price (fallback to ARV if that's all that's entered).
  const novFeeBasis = nList > 0 ? nList : arv;
  const novSuggestedFee = feeForArv(novFeeBasis);
  const nMinFee = f.nMinFee != null && f.nMinFee !== "" ? n("nMinFee") : novSuggestedFee;
  const nSellerClosePct = num(v("nSellerClosePct") || "1.5"); // seller's closing only — we cover it
  const nSellerClose = nList * (nSellerClosePct / 100);
  const nHoldMonths = n("nHoldMonths") || 2;        // months on market before it sells
  const nHoaCost = n("nHoa") * nHoldMonths;          // HOA dues while listed
  const nExtra = extraSum("nExtra", nExtraN);        // manual override: cash-for-keys, eviction, etc.
  const nNet = nList - nRepairCredit - nList * (nComm / 100) - nSellerClose - nHoaCost - nExtra;
  const novMao = nNet - nMinFee;
  const nAnchorPct = v("nAnchorPct") || "7";
  const novAnchor = novMao * (1 - num(nAnchorPct) / 100);
  const feeAtAnchor = nNet - novAnchor;
  // Sanity check: novation should usually let us offer the seller MORE than cash (no
  // flipper margin / holding baked in). If cash MAO ends up higher, something's off.
  const maoConflict = cashMao > 0 && novMao > 0 && cashMao > novMao;

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
  const fHold = n("fHold") || 6;
  const fRehab = (n("fRehab") || n("sqft") * num(v("rehabSf"))) + majorTotal;
  const fComm = arv * (num(v("fComm") || "3") / 100);
  const fClosing = arv * (num(v("fClosing") || "2") / 100);
  const fCarry = arv * (num(v("fCarry") || "1") / 100); // utilities, taxes, insurance
  const fHoaCost = n("fHoa") * fHold;
  const fPropertyCosts = fRehab + fComm + fClosing + fCarry + fHoaCost + n("fPm");
  const fLoan = n("fLoan"), fRate = num(v("fRate") || "10") / 100, fPoints = num(v("fPoints") || "1") / 100, fSvc = n("fSvc");
  const fGap = n("fGap"), fGapRate = num(v("fGapRate") || "15") / 100;
  const fPointsCost = fLoan * fPoints;
  const fInterest = (fLoan * fRate / 12) * fHold + (fGap * fGapRate / 12) * fHold;
  const fMoneyCost = fPointsCost + fInterest + fSvc;
  const fTotalCosts = fPropertyCosts + fMoneyCost;
  const fMao = arv + n("fPurchCredit") - fMinProfit - fTotalCosts;
  const fProfit = arv - fTotalCosts - n("fPurchase");

  // ---- Deal outcome (shared across every exit): the seller's asking price and
  // the price they actually accepted, so we can see the TRUE margin at the end. ----
  const asking = n("askPrice");
  const accepted = n("acceptedPrice");
  let dealMax = 0, profitAtAccepted = 0, marginLabel = "Your profit", showAsking = true;
  if (tab === "assignment") { dealMax = cashMao; profitAtAccepted = (flipperTarget - repairs - aHoa - aExtra) - accepted; marginLabel = "Your assignment fee"; }
  else if (tab === "novation") { dealMax = novMao; profitAtAccepted = nNet - accepted; marginLabel = "Your fee"; }
  else if (tab === "flip") { dealMax = fMao; profitAtAccepted = arv - fTotalCosts - accepted; marginLabel = "Your profit"; }
  else if (tab === "creative") { dealMax = n("cPrice"); profitAtAccepted = cMargin; marginLabel = "Your total margin"; showAsking = false; }
  else { dealMax = lList; profitAtAccepted = lFlat > 0 ? lFlat : accepted * (lComm / 100) * (lRef / 100); marginLabel = "Your marketing fee"; showAsking = false; }
  const overAsk = asking - dealMax; // > 0 means the seller is asking above our max offer
  const buyExit = tab === "assignment" || tab === "novation" || tab === "flip";

  function buildReport(): { title: string; rows: [string, string][]; comps?: string; note?: string } {
    const addr = v("subject") || "—";
    if (tab === "assignment") {
      const comps = [1, 2, 3].map((i) => { const a = v(`comp${i}`); const p = v(`comp${i}p`); const d = v(`comp${i}d`); return a ? `${esc(a)}${p ? ` — $${esc(p)}` : ""}${d ? `, ${esc(d)} DOM` : ""}` : ""; }).filter(Boolean).join("<br>");
      return {
        title: "Assignment (Cash) Analysis", comps: `<strong>Subject:</strong> ${esc(addr)}${comps ? `<br><strong>ARV comps (price · days on market):</strong><br>${comps}` : ""}`,
        rows: [["ARV", money(arv)], [`Market tier (${marketPct}% of ARV)`, money(flipperTarget)], ["Repairs", money(repairs)], ...(aHoa > 0 ? ([["HOA / special dues", money(aHoa)]] as [string, string][]) : []), ...extraItems("aExtra", aExtraN).map((x) => [x.note || "Additional cost", money(x.amt)] as [string, string]), ["Assignment fee", money(aFee)], ["🎯 Cash MAO (max offer to seller)", money(cashMao)], [`Anchor / opening offer (${aAnchorPct}% below MAO)`, money(aAnchor)], ["Negotiation range", `${money(aAnchor)} → ${money(cashMao)}`]],
        note: "Open at the anchor, negotiate up to the cash MAO. Holding accounts for the flipper's carry. On assignment the end buyer covers BOTH the seller's and the buyer's closing costs, so no closing is deducted here. If the seller won't meet MAO, pivot to Novation.",
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
    const r = buildReport();
    // Append the real-world outcome so the saved report shows the true margin.
    if (showAsking && asking > 0) r.rows.push(["Seller's asking price", money(asking) + (overAsk > 0 ? ` (over max by ${money(overAsk)})` : " (within max)")]);
    if (accepted > 0) { r.rows.push(["Accepted price", money(accepted)], [`${marginLabel} (actual)`, money(profitAtAccepted)]); }
    const w = window.open("", "_blank", "width=820,height=920");
    if (!w) return;

    // Color-code each row so the offer call is easy to read at a glance.
    const toneFor = (label: string): { c: string; bg: string } => {
      const L = label.toLowerCase();
      if (label.startsWith("🎯") || L.includes("max offer") || (L.includes("margin") && !L.includes("markup")) || L.includes("your fee") || L.includes("marketing fee")) return { c: "#047857", bg: "#ecfdf5" }; // green = the money number
      if (L.includes("anchor")) return { c: "#b45309", bg: "#fffbeb" };       // amber = open here
      if (L.includes("over max") || L.includes("over by") || L.includes("overpriced") || (L.includes("over max by"))) return { c: "#b91c1c", bg: "#fef2f2" }; // red = problem
      if (L.startsWith("−") || L.includes("repair") || L.includes("cost") || L.includes("holding") || L.includes("commission") || L.includes("closing") || L.includes("hoa") || L.includes("dues") || L.includes("credit")) return { c: "#b91c1c", bg: "#fff" }; // red text = a deduction
      if (L.includes("negotiat")) return { c: "#1e3a8a", bg: "#eff6ff" };
      return { c: "#0f172a", bg: "#fff" };
    };
    const heroIdx = r.rows.findIndex(([l]) => l.startsWith("🎯"));
    const hero = heroIdx >= 0 ? r.rows[heroIdx] : null;
    const rows = r.rows.map(([l, val], i) => {
      const t = toneFor(l);
      const strong = l.startsWith("🎯");
      return `<tr style="background:${strong ? t.bg : i % 2 ? "#f8fafc" : "#fff"}"><td style="padding:8px 12px;color:#475569;${strong ? "font-weight:700" : ""}">${esc(l)}</td><td style="padding:8px 12px;font-weight:800;text-align:right;color:${t.c};font-size:${strong ? "16px" : "14px"}">${esc(val)}</td></tr>`;
    }).join("");

    // Negotiation-range bar (anchor → MAO) for the buy exits.
    const rangeLo = tab === "assignment" ? aAnchor : tab === "novation" ? novAnchor : 0;
    const rangeHi = tab === "assignment" ? cashMao : tab === "novation" ? novMao : 0;
    const rangeBar = (buyExit && rangeHi > 0 && rangeLo > 0) ? `
      <div style="margin:6px 0 18px">
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:700;margin-bottom:4px">
          <span style="color:#b45309">⚓ Open ${esc(money(rangeLo))}</span>
          <span style="color:#047857">🎯 Max ${esc(money(rangeHi))}</span>
        </div>
        <div style="height:14px;border-radius:8px;background:linear-gradient(90deg,#fcd34d,#34d399)"></div>
        <div style="font-size:10px;color:#94a3b8;text-align:center;margin-top:3px">Open at the anchor, negotiate up to the max — never past it.</div>
      </div>` : "";

    const conflict = maoConflict ? `<div style="margin:0 0 14px;padding:10px 12px;border-radius:8px;background:#fffbeb;border:1px solid #fcd34d;color:#92400e;font-size:12px;font-weight:600">⚠️ Cash MAO (${esc(money(cashMao))}) is higher than the Novation MAO (${esc(money(novMao))}) — novation should usually allow a higher offer. Re-check the novation inputs.</div>` : "";

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(r.title)}</title></head>
      <body style="font-family:system-ui,Arial,sans-serif;color:#0f172a;max-width:720px;margin:28px auto;padding:0 18px">
        <div style="border-bottom:3px solid #0b1f3a;padding-bottom:8px;margin-bottom:14px">
          <div style="font-weight:800;font-size:18px;color:#0b1f3a">Freedom Offers — War Room</div>
          <div style="color:#64748b;font-size:13px">${esc(r.title)} · ${new Date().toLocaleDateString()}</div>
        </div>
        ${hero ? `<div style="background:#0b1f3a;color:#fff;border-radius:12px;padding:14px 18px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;color:#cbd5e1;font-weight:600">${esc(hero[0].replace("🎯 ", ""))}</span>
          <span style="font-size:26px;font-weight:800;color:#fcd34d">${esc(hero[1])}</span>
        </div>` : ""}
        ${conflict}
        ${rangeBar}
        ${r.comps ? `<div style="margin-bottom:14px;color:#334155;line-height:1.5;font-size:13px">${r.comps}</div>` : ""}
        <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">${rows}</table>
        ${r.note ? `<p style="margin-top:16px;color:#64748b;font-size:12px;font-style:italic">${esc(r.note)}</p>` : ""}
      </body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 250);
  }

  const reqDiv = "sm:col-span-2 mt-1 border-t border-red-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-red-500";
  const optDiv = "sm:col-span-2 mt-1 border-t border-amber-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-amber-500";
  const goodDiv = "sm:col-span-2 mt-1 border-t border-emerald-100 pt-2 text-[11px] font-bold uppercase tracking-wide text-emerald-600";
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
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <span className="mb-0.5 block text-[11px] font-semibold text-slate-500">📍 Subject property address</span>
        <div className="flex flex-wrap items-center gap-2">
          <input value={v("subject")} onChange={set("subject")} placeholder="123 Main St, San Diego, CA 92101" className={`${inputCls} flex-1`} style={{ minWidth: 220 }} />
          <button type="button" onClick={pullComps} disabled={comping} className="shrink-0 rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 disabled:opacity-50">{comping ? "Pulling…" : "🔎 Pull comps & ARV"}</button>
        </div>
        {compMsg && <p className="mt-1.5 text-[11px] text-slate-500">{compMsg}</p>}
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === t.key ? "bg-brand-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{t.emoji} {t.label}</button>
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
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Market tier (% of ARV the flipper supports)</span>
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
                </div>
              </details>
              <Field k="arv" label="ARV" prefix="$" placeholder="350,000" req="need" />
              <div className="flex items-end gap-2">
                <div className="flex-1"><Field k="aFee" label="Assignment fee" prefix="$" placeholder={suggestedFee ? suggestedFee.toLocaleString() : "15,000"} req="need" /></div>
                {suggestedFee > 0 && <button type="button" onClick={() => setV("aFee", String(suggestedFee))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-2.5 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200" title={`Tiered minimum for ${tierLabel(arv)} ARV`}>Use {money(suggestedFee)}</button>}
              </div>
              {feeTierTable(arv, "ARV")}
              <div className={reqDiv}>Repairs (required) — type a figure, or estimate from sqft</div>
              <Field k="repairs" label="Override repair estimate ($)" prefix="$" span={2} req="need" />
              <Field k="sqft" label="Square feet" req="need" />
              <label><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Condition ($/sf)</span>
                <select value={v("rehabSf")} onChange={set("rehabSf")} className={`${inputCls} border-red-300`}>{REHAB_LEVELS.map(([val, l]) => <option key={val || "x"} value={val}>{l}</option>)}</select>
              </label>
              {majorRepairs()}
              <div className={optDiv}>Optional — refine the offer</div>
              <Field k="aAnchorPct" label="Anchor below MAO" suffix="%" placeholder="10" req="opt" />
              <Field k="aHoa" label="HOA / special dues ($)" prefix="$" placeholder="0" req="opt" />
              <p className="sm:col-span-2 -mt-1 text-[10px] italic text-slate-400">💡 No need to enter the flipper&apos;s holding or money costs — the market tier % already builds in their carry and profit. Detailed money-cost math lives on the Flip / Wholetail tab.</p>
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
          {tab === "novation" && (
            <>
              {legend}
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1"><Field k="nList" label="List price (similar-condition value · EMV for land)" prefix="$" placeholder="420,000" req="need" /></div>
                {suggestedList > 0 && (
                  <button type="button" onClick={() => setV("nList", String(suggestedList))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-200" title="Lowest comp — most conservative to sell under 90 days">Use {money(suggestedList)}</button>
                )}
              </div>
              <div className="sm:col-span-2 flex items-end gap-2">
                <div className="flex-1"><Field k="nMinFee" label="Our minimum fee" prefix="$" placeholder={novSuggestedFee ? novSuggestedFee.toLocaleString() : "15,000"} req="need" /></div>
                {novSuggestedFee > 0 && <button type="button" onClick={() => setV("nMinFee", String(novSuggestedFee))} className="mb-0.5 shrink-0 rounded-lg bg-emerald-100 px-2.5 py-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200" title={`Tiered minimum for ${tierLabel(novFeeBasis)} value`}>Use {money(novSuggestedFee)}</button>}
              </div>
              {feeTierTable(novFeeBasis, "similar-condition value (EMV for land)")}
              <Field k="nComm" label="Agent commission" suffix="%" placeholder="5" req="opt" />
              <Field k="nSellerClosePct" label="Seller closing % (we cover)" suffix="%" placeholder="1.5" req="opt" />
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
              <Field k="arv" label="ARV" prefix="$" placeholder="350,000" req="need" />
              <Field k="fMinProfit" label="Minimum profit" prefix="$" placeholder="30,000" req="opt" />
              <div className={goodDiv}>🟢 ARV comps (required · addr · sold $ · days on market)</div>
              <p className="sm:col-span-2 -mt-1 text-[11px] text-emerald-600">{compsNote}</p>
              {[1, 2, 3].map((i) => (
                <div key={i} className="sm:col-span-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Field k={`comp${i}`} label={`Comp ${i} address`} span={2} req="good" />
                  <Field k={`comp${i}p`} label="Sold $" prefix="$" req="good" />
                  <Field k={`comp${i}d`} label="DOM" req="good" />
                </div>
              ))}
              <div className={reqDiv}>Rehab (required) — direct $, or sqft × $/sf</div>
              <Field k="fRehab" label="Override rehab cost ($)" prefix="$" span={2} req="need" />
              <Field k="sqft" label="Square feet" req="need" />
              <label><span className="mb-0.5 block text-[11px] font-semibold text-red-600">Condition ($/sf)</span>
                <select value={v("rehabSf")} onChange={set("rehabSf")} className={`${inputCls} border-red-300`}>{REHAB_LEVELS.map(([val, l]) => <option key={val || "x"} value={val}>{l}</option>)}</select>
              </label>
              {majorRepairs()}
              <div className={optDiv}>Property costs (optional · % of ARV)</div>
              <Field k="fComm" label="Realtor commission" suffix="%" placeholder="3" req="opt" />
              <Field k="fClosing" label="Closing costs" suffix="%" placeholder="2" req="opt" />
              <Field k="fCarry" label="Utilities / taxes / insurance" suffix="%" placeholder="1" req="opt" />
              <Field k="fHoa" label="Monthly HOA ($)" prefix="$" req="opt" />
              <Field k="fPm" label="Project manager / misc ($)" prefix="$" req="opt" />
              <Field k="fPurchCredit" label="Purchase commission credit ($)" prefix="$" req="opt" />
              <div className={optDiv}>Money costs (optional · hard-money)</div>
              <label className="sm:col-span-2"><span className="mb-0.5 block text-[11px] font-semibold text-slate-500">Lender preset (fills rate / points / fee)</span>
                <select value={v("fLender")} onChange={(e) => { const L = LENDERS[e.target.value]; setF((p) => ({ ...p, fLender: e.target.value, ...(L ? { fRate: L.rate, fPoints: L.points, fSvc: L.svc } : {}) })); }} className={inputCls}>
                  <option value="">— custom —</option>
                  {Object.keys(LENDERS).map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <Field k="fLoan" label="Loan amount" prefix="$" req="opt" />
              <Field k="fHold" label="Hold time (months)" placeholder="6" req="opt" />
              <Field k="fRate" label="Interest rate" suffix="%" placeholder="10" req="opt" />
              <Field k="fPoints" label="Points" suffix="%" placeholder="1" req="opt" />
              <Field k="fSvc" label="Service fee ($)" prefix="$" req="opt" />
              <Field k="fGap" label="Gap loan amount ($)" prefix="$" req="opt" />
              <Field k="fGapRate" label="Gap interest rate" suffix="%" placeholder="15" req="opt" />
              <div className={optDiv}>Profit check (optional)</div>
              <Field k="fPurchase" label="Your purchase price ($)" prefix="$" span={2} req="opt" />
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
              <Res label={`Flipper resale target (${marketPct}% of ARV)`} value={money(flipperTarget)} tone="muted" />
              <Res label="− Repairs" value={money(repairs)} tone="muted" />
              {aHoa > 0 && <Res label="− HOA / special dues" value={money(aHoa)} tone="muted" />}
              {extraItems("aExtra", aExtraN).map((x, i) => <Res key={i} label={`− ${x.note || "Additional cost"}`} value={money(x.amt)} tone="muted" />)}
              <Res label="− Assignment fee" value={money(aFee)} tone="muted" />
              <Res label="🎯 Cash MAO (max offer to seller)" value={money(cashMao)} tone={cashMao > 0 ? "navy" : "bad"} big />
              <Res label="⚓ Anchor (open here)" value={money(aAnchor)} tone="good" />
              <Res label="Negotiate" value={`${money(aAnchor)} → ${money(cashMao)}`} tone="muted" />
            </>
          )}
          {tab === "novation" && (
            <>
              {nHoaCost > 0 && <Res label={`− HOA dues (${nHoldMonths} mo)`} value={money(nHoaCost)} tone="muted" />}
              {extraItems("nExtra", nExtraN).map((x, i) => <Res key={i} label={`− ${x.note || "Additional cost"}`} value={money(x.amt)} tone="muted" />)}
              <Res label="Net after credit, commission, closing, HOA + extras" value={money(nNet)} tone="muted" />
              <Res label="🎯 Novation MAO (max seller payout)" value={money(novMao)} tone={novMao > 0 ? "navy" : "bad"} big />
              <Res label="⚓ Anchor payout (open here)" value={money(novAnchor)} tone="good" />
              <Res label="Our fee at anchor" value={money(feeAtAnchor)} tone="good" />
              <Res label="Negotiate (seller payout)" value={`${money(novAnchor)} → ${money(novMao)}`} tone="muted" />
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
              <Res label="Total property costs" value={money(fPropertyCosts)} tone="muted" />
              <Res label="Total money cost" value={money(fMoneyCost)} tone="muted" />
              <Res label="Total costs" value={money(fTotalCosts)} tone="muted" />
              <Res label="− Minimum profit" value={money(fMinProfit)} tone="muted" />
              <Res label="🎯 Max Offer (flip MAO)" value={money(fMao)} tone={fMao > 0 ? "navy" : "bad"} big />
              {n("fPurchase") > 0 && <Res label="Profit at your purchase price" value={money(fProfit)} tone={fProfit > 0 ? "good" : "bad"} />}
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
          <Field k="acceptedPrice" label="Accepted price (what they actually took)" prefix="$" placeholder="e.g. 250,000" req="good" />
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
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={exportPdf} className="rounded-lg bg-brand-gold px-5 py-2.5 text-sm font-bold text-brand-navy hover:opacity-90">📄 Export PDF (for the CRM)</button>
        <span className="text-[11px] text-slate-400">Opens a clean report — choose “Save as PDF”, then upload to REI Reply.</span>
      </div>
      <p className="text-[11px] text-slate-400">Estimates only — confirm comps, repair scope, and title before making an offer. Next up: Wholetail, Flip, and Luxury assignment tabs.</p>
    </div>
    </FieldCtx.Provider>
  );
}
