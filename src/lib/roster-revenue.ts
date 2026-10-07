import { db } from "./db";

// ── Ramp-up / promotion ladder (owner-only) ──────────────────────────────────
// Draft tiers based on lifetime revenue GENERATED for the company (both-sides
// credit). Jon edits these numbers/titles anytime — just change this array.
export type LadderTier = { tier: string; min: number; blurb: string };
export const REVENUE_LADDER: LadderTier[] = [
  { tier: "Trainee", min: 0, blurb: "Learning the system — shadowing, scripts, and certification." },
  { tier: "Rep", min: 25000, blurb: "Owns their seat with consistent daily output." },
  { tier: "Senior Rep", min: 100000, blurb: "Reliably closes and mentors newer teammates." },
  { tier: "Team Lead", min: 250000, blurb: "Drives a lane and owns the team's number." },
  { tier: "Director", min: 500000, blurb: "Owns a department's revenue end-to-end." },
];

export function tierFor(revenue: number) {
  let current = REVENUE_LADDER[0];
  let next: LadderTier | null = REVENUE_LADDER[1] ?? null;
  for (let i = 0; i < REVENUE_LADDER.length; i++) {
    if (revenue >= REVENUE_LADDER[i].min) { current = REVENUE_LADDER[i]; next = REVENUE_LADDER[i + 1] ?? null; }
  }
  const toGo = next ? Math.max(0, next.min - revenue) : 0;
  const pct = next ? Math.min(1, Math.max(0, (revenue - current.min) / (next.min - current.min))) : 1;
  return { current, next, toGo, pct };
}

// ── Revenue generated per person ─────────────────────────────────────────────
// A closed wholesale deal has two contributors: the acquisitions/LM side that
// signed it (Deal.lmAq / assignedTo) and the dispo side that closed it
// (ClosedDeal.closedBy). Per Jon's call we credit BOTH the full profit, so each
// person sees their full impact (team totals will exceed company revenue).
export type RevRow = { revenue: number; revenueYtd: number; deals: number };

export async function getRevenueByUser(year: number): Promise<{ byUserId: Map<string, RevRow>; unattributed: number; adjustments: Record<string, number>; companyTotal: number }> {
  const [users, closed, deals, adjRow] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.closedDeal.findMany({ select: { profit: true, year: true, closedBy: true, dealId: true } }),
    db.deal.findMany({ select: { id: true, lmAq: true, assignedTo: true, status: true, soldPrice: true, assignmentFee: true, soldDate: true } }),
    db.resource.findFirst({ where: { category: "__roster_rev_adjust__" } }),
  ]);
  let adjustments: Record<string, number> = {};
  try { adjustments = adjRow?.description ? JSON.parse(adjRow.description) : {}; } catch { /* none */ }
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const firstOf = (n: string) => n.trim().split(/\s+/)[0].toLowerCase();
  const roster = users.map((u) => ({ id: u.id, first: firstOf(u.name) })).filter((u) => u.first.length >= 2);
  // Which active users are named in a free-text credit field (by first name).
  const matchIds = (field: string | null | undefined): string[] => {
    const f = (field ?? "").toLowerCase();
    if (!f) return [];
    return roster.filter((u) => new RegExp(`(^|[^a-z])${u.first}([^a-z]|$)`).test(f)).map((u) => u.id);
  };

  const byUserId = new Map<string, RevRow>();
  users.forEach((u) => byUserId.set(u.id, { revenue: 0, revenueYtd: 0, deals: 0 }));
  let unattributed = 0;

  let companyTotal = 0;
  let companyYtd = 0;
  let companyDeals = 0;
  for (const c of closed) {
    companyTotal += c.profit; companyDeals += 1;
    if (c.year === year) companyYtd += c.profit;
    const credited = new Set<string>();
    matchIds(c.closedBy).forEach((id) => credited.add(id)); // dispo side
    const d = c.dealId ? dealById.get(c.dealId) : null;
    if (d) {
      matchIds(d.lmAq).forEach((id) => credited.add(id));       // acquisitions / LM side
      matchIds(d.assignedTo).forEach((id) => credited.add(id)); // dispo named on the deal
    }
    if (credited.size === 0) { unattributed += c.profit; continue; }
    for (const id of credited) {
      const row = byUserId.get(id);
      if (!row) continue;
      row.revenue += c.profit;
      row.deals += 1;
      if (c.year === year) row.revenueYtd += c.profit;
    }
  }
  // Closed deals living only on the Deals board (incl. the GHL DEAL WON
  // imports) — credit assignedTo + lmAq, skip any already in the ledger.
  const inLedger = new Set(closed.map((c) => c.dealId).filter(Boolean));
  for (const d of deals) {
    if (d.status !== "closed" || inLedger.has(d.id)) continue;
    const profit = d.assignmentFee ?? d.soldPrice ?? 0;
    if (!profit) continue;
    const yr = Number((d.soldDate ?? "").slice(0, 4)) || 0;
    companyTotal += profit; companyDeals += 1;
    if (yr === year) companyYtd += profit;
    const credited = new Set<string>();
    matchIds(d.assignedTo).forEach((id) => credited.add(id));
    matchIds(d.lmAq).forEach((id) => credited.add(id));
    if (credited.size === 0) { unattributed += profit; continue; }
    for (const id of credited) {
      const row = byUserId.get(id);
      if (!row) continue;
      row.revenue += profit;
      row.deals += 1;
      if (yr === year) row.revenueYtd += profit;
    }
  }
  // Manual adjustments (Jon edits on the roster) — added to lifetime.
  for (const u of users) {
    const adj = adjustments[firstOf(u.name)] ?? 0;
    if (adj) { const row = byUserId.get(u.id); if (row) row.revenue += adj; }
  }
  // Enrico & Jonathan carry the WHOLE company's profit since the start.
  for (const u of users) {
    const f = firstOf(u.name);
    if (["enrico", "jonathan", "jon"].includes(f)) {
      byUserId.set(u.id, { revenue: companyTotal + (adjustments[f] ?? 0), revenueYtd: companyYtd, deals: companyDeals });
    }
  }
  return { byUserId, unattributed, adjustments, companyTotal };
}
