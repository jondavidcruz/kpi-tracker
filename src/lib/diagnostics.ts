import { db } from "./db";
import { monthBounds } from "./date";
import { getSettings } from "./data";
import { sendEmailTo } from "./notify";

export type Stage = { key: string; label: string; count: number; convFromPrev: number | null };
export interface Leaks {
  rangeLabel: string;
  leads: number;
  refundRequested: number;
  refunded: number;
  netLeads: number;
  stages: Stage[];
  worstLeak: { from: string; to: string; lostPct: number } | null;
  econ: {
    leadSpend: number; totalExpenses: number; revenue: number;
    costPerLead: number | null; costPerSigned: number | null; costPerClosed: number | null;
    revenuePerLead: number | null; net: number; closedCount: number;
  };
}

const LEAD_KEYS = ["ppl_leads", "text_responses", "direct_mail_responses", "leads_generated"];
const SIGNED_KEYS = ["acq_signed_assignment", "acq_signed_novation", "acq_signed_listing", "acq_signed_creative"];

/** Live conversion + unit-economics diagnostic from real KPI/deal/expense data. */
export async function buildLeaks(today: string, range: "week" | "month" | "ytd"): Promise<Leaks> {
  const year = Number(today.slice(0, 4));
  let start: string, end = today, rangeLabel: string;
  if (range === "ytd") { start = `${year}-01-01`; rangeLabel = `${year} year-to-date`; }
  else if (range === "week") { const d = new Date(today + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 6); start = d.toISOString().slice(0, 10); rangeLabel = "last 7 days"; }
  else { start = monthBounds(today).start; rangeLabel = "this month"; }

  const allKeys = [...LEAD_KEYS, "completed_process_calls", "offers_made", "acq_contracts_sent", ...SIGNED_KEYS, "ppl_refund_requested", "ppl_refunded"];
  const kpis = await db.kpi.findMany({ where: { key: { in: allKeys } }, select: { id: true, key: true } });
  const keyById = new Map(kpis.map((k) => [k.id, k.key]));
  const entries = await db.entry.findMany({ where: { kpiId: { in: kpis.map((k) => k.id) }, date: { gte: start, lte: end } }, select: { kpiId: true, value: true } });
  const sum: Record<string, number> = {};
  for (const e of entries) { const k = keyById.get(e.kpiId); if (k) sum[k] = (sum[k] ?? 0) + e.value; }
  const g = (k: string) => sum[k] ?? 0;

  const leads = LEAD_KEYS.reduce((s, k) => s + g(k), 0);
  const processCalls = g("completed_process_calls");
  const offers = g("offers_made");
  const signed = SIGNED_KEYS.reduce((s, k) => s + g(k), 0);
  const refundRequested = g("ppl_refund_requested");
  const refunded = g("ppl_refunded");

  // Closed-for-cash from the verified ledger.
  const closings = await db.closedDeal.findMany({
    where: range === "ytd" ? { year } : { closeDate: { gte: start, lte: end } },
    select: { profit: true },
  });
  const closedCount = closings.length;
  const revenue = closings.reduce((s, c) => s + c.profit, 0);

  const raw = [
    { key: "leads", label: "Leads", count: leads },
    { key: "calls", label: "Process calls", count: processCalls },
    { key: "offers", label: "Offers made", count: offers },
    { key: "signed", label: "Contracts signed", count: signed },
    { key: "closed", label: "Closed for cash", count: closedCount },
  ];
  const stages: Stage[] = raw.map((s, i) => ({ ...s, convFromPrev: i === 0 ? null : raw[i - 1].count > 0 ? s.count / raw[i - 1].count : null }));

  // Worst leak = the consecutive step with the lowest conversion (where prev > 0).
  let worstLeak: Leaks["worstLeak"] = null;
  for (let i = 1; i < stages.length; i++) {
    const c = stages[i].convFromPrev;
    if (c != null && raw[i - 1].count >= 1) {
      const lostPct = (1 - c) * 100;
      if (!worstLeak || lostPct > worstLeak.lostPct) worstLeak = { from: raw[i - 1].label, to: raw[i].label, lostPct };
    }
  }

  // Costs from the P&L for the period's month(s).
  const months = range === "ytd" ? [`${year}`] : [start.slice(0, 7)];
  const lineWhere = range === "ytd" ? { month: { startsWith: `${year}` } } : { month: start.slice(0, 7) };
  const lines = await db.expenseLine.findMany({ where: lineWhere, select: { actual: true, label: true } });
  const totalExpenses = lines.reduce((s, l) => s + l.actual, 0);
  const leadSpend = lines.filter((l) => /speed/i.test(l.label)).reduce((s, l) => s + l.actual, 0);
  void months;

  return {
    rangeLabel, leads, refundRequested, refunded, netLeads: leads - refunded, stages, worstLeak,
    econ: {
      leadSpend, totalExpenses, revenue,
      costPerLead: leads > 0 ? leadSpend / leads : null,
      costPerSigned: signed > 0 ? totalExpenses / signed : null,
      costPerClosed: closedCount > 0 ? totalExpenses / closedCount : null,
      revenuePerLead: leads > 0 ? revenue / leads : null,
      net: revenue - totalExpenses, closedCount,
    },
  };
}

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

export interface LeaksNarrative { headline: string; biggest: string; meaning: string[]; actions: string[] }

/** Plain-English read of the funnel + economics — what's wrong and what to do. */
export function buildLeaksNarrative(d: Leaks): LeaksNarrative {
  const sc = (k: string) => d.stages.find((s) => s.key === k)?.count ?? 0;
  const leads = sc("leads"), calls = sc("calls"), offers = sc("offers"), signed = sc("signed"), closed = sc("closed");

  if (leads === 0) {
    return {
      headline: "Not enough logged yet to diagnose this range.",
      biggest: "No leads were logged for this period.",
      meaning: ["The funnel and these numbers fill in automatically as the team logs leads, process calls, offers, and contracts each day."],
      actions: ["Make sure Michelle logs her process calls, offers, and contracts daily — that's what powers this whole diagnostic."],
    };
  }

  const pct = (a: number, b: number) => (b > 0 ? Math.round((1 - a / b) * 100) : 0);
  const meaning: string[] = [];
  const actions: string[] = [];
  let biggest = "";

  // Interpret the single worst leak in plain English.
  const wl = d.worstLeak;
  if (wl) {
    const key = `${wl.from}→${wl.to}`;
    if (key === "Leads→Process calls") {
      biggest = `Your biggest leak is the very top: ${pct(calls, leads)}% of the leads you paid for never even got a call.`;
      meaning.push("You can't close a seller nobody talks to. This is a follow-up / speed-to-lead problem — not a closing problem. It's the most expensive leak because you already paid for those leads.");
      actions.push("Make 'every lead gets called + put in a multi-touch follow-up' the #1 daily standard. If Michelle can't reach someone, they go into a follow-up sequence — never the trash.");
    } else if (key === "Process calls→Offers made") {
      biggest = `Your biggest leak is calls → offers: you're reaching sellers but only ${Math.round((offers / Math.max(1, calls)) * 100)}% turn into an offer.`;
      meaning.push("Either the leads aren't motivated/qualified, or the offer isn't being made on the call. You're doing the hard part (the conversation) and not asking for the deal.");
      actions.push("Drill the offer step: every qualified call should end in a verbal offer or a clear next step. Use the AI coach for the offer talk track.");
    } else if (key === "Offers made→Contracts signed") {
      biggest = `Your biggest leak is offers → signed: you're making offers but only ${Math.round((signed / Math.max(1, offers)) * 100)}% get signed.`;
      meaning.push("This is the negotiation and the close — exactly the Jon→Michelle handoff. Offers that don't sign means the close is the bottleneck while Michelle is still ramping.");
      actions.push("Co-close: Michelle presents and builds rapport, you step into the negotiation until her signed-rate proves out. Drill 'negotiating to signed' daily.");
    } else if (key === "Contracts signed→Closed for cash") {
      biggest = `Your biggest leak is signed → closed: contracts are signing but only ${Math.round((closed / Math.max(1, signed)) * 100)}% make it to cash.`;
      meaning.push("Deals are dying after contract — buyers walking or escrow fallout. That's a dispositions / escrow problem, not acquisitions.");
      actions.push("Tighten dispo: faster buyer matching, make EMD hard, and watch the deal-aging board so nothing rots.");
    } else {
      biggest = `Your biggest drop-off is ${wl.from} → ${wl.to} (${Math.round(wl.lostPct)}% lost there).`;
      meaning.push("Focus your energy on the step where the most deals fall out — fixing it has the highest leverage.");
    }
  } else {
    biggest = "No single dominant leak this period — the funnel is fairly even.";
  }

  // Economics read.
  if (d.econ.costPerLead != null && d.econ.costPerLead <= 25) {
    meaning.push(`Lead cost is healthy (about ${usd(d.econ.costPerLead)}/lead). Your problem isn't lead price — it's conversion. Raising the funnel even a point or two multiplies contracts off the same spend.`);
  }
  if (d.econ.net < 0) {
    meaning.push(`Net is negative (${usd(d.econ.net)}) — expenses are outrunning closed revenue. A profitable single month doesn't mean a profitable period; you have to close more, not spend more.`);
  } else if (d.econ.revenue > 0) {
    meaning.push(`Net is positive (${usd(d.econ.net)}) for this range — protect the close and keep the funnel full.`);
  }
  if (d.refunded > 0 || d.refundRequested > 0) {
    meaning.push(`${d.refunded} of ${d.refundRequested} requested lead refunds came back — keep flagging bad leads so you only pay for usable ones.`);
  }
  if (actions.length < 2) actions.push("Keep the team logging every step daily so this diagnostic stays sharp and the leak can't hide.");

  const headline = d.econ.net < 0
    ? `Bottom line: you're not failing at leads or cost — you're failing at converting them, and it's costing you money (${usd(d.econ.net)} net this range).`
    : `Bottom line: the funnel is working — the lever now is keeping the close tight and the pipeline full.`;

  return { headline, biggest, meaning, actions };
}

/** Friday EOD Leaks report — emailed to the C-suite (this week + YTD). */
export async function sendLeaksReport(today: string): Promise<boolean> {
  const settings = await getSettings();
  let to = (settings.payrollEmails || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) {
    const cs = await db.user.findMany({ where: { active: true, role: { in: ["admin", "manager"] } }, select: { email: true } });
    to = cs.map((u) => u.email).filter(Boolean);
  }
  if (to.length === 0) return false;

  const [wk, ytd] = await Promise.all([buildLeaks(today, "week"), buildLeaks(today, "ytd")]);
  const funnel = (l: Leaks) => l.stages.map((s) => `${s.label}: <b>${s.count.toLocaleString()}</b>${s.convFromPrev != null ? ` <span style="color:#94a3b8">(${Math.round(s.convFromPrev * 100)}% of prev)</span>` : ""}`).join("<br>");
  const leak = (l: Leaks) => (l.worstLeak && l.worstLeak.lostPct >= 1 ? `🚨 Biggest leak: <b>${l.worstLeak.from} → ${l.worstLeak.to}</b> — losing ${Math.round(l.worstLeak.lostPct)}% here.` : "No single dominant leak this period.");

  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0b1f3a;">
    <h2 style="margin:0 0 4px;">🩺 Weekly Leaks Report</h2>
    <p style="color:#64748b;margin:0 0 16px;">Where deals are leaking + the unit economics. C-suite only.</p>

    <div style="background:#fff7f7;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin:0 0 14px;">
      <div style="font-weight:700;color:#b91c1c;">This week</div>
      <div style="color:#7f1d1d;margin:4px 0;">${leak(wk)}</div>
      <div style="color:#334155;font-size:14px;line-height:1.7;">${funnel(wk)}</div>
    </div>

    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin:0 0 14px;">
      <div style="font-weight:700;">Year to date</div>
      <div style="color:#7f1d1d;margin:4px 0;">${leak(ytd)}</div>
      <div style="color:#334155;font-size:14px;line-height:1.7;">${funnel(ytd)}</div>
      <div style="margin-top:10px;color:#475569;font-size:13px;">
        Leads <b>${ytd.leads.toLocaleString()}</b> · Refund req <b>${ytd.refundRequested}</b> · Refunded <b>${ytd.refunded}</b><br>
        Cost/lead <b>${ytd.econ.costPerLead != null ? usd(ytd.econ.costPerLead) : "—"}</b> · Cost/closed <b>${ytd.econ.costPerClosed != null ? usd(ytd.econ.costPerClosed) : "—"}</b> · Revenue <b>${usd(ytd.econ.revenue)}</b> · Net <b style="color:${ytd.econ.net >= 0 ? "#047857" : "#b91c1c"}">${usd(ytd.econ.net)}</b>
      </div>
    </div>

    <p style="color:#94a3b8;font-size:13px;">The lever is conversion, not lead cost. Open the live diagnostic in the War Room → Leaks page for the full breakdown.</p>
  </div>`;
  return sendEmailTo(to, `🩺 Weekly Leaks Report — ${today}`, html);
}
