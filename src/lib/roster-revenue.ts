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
// Jon 2026-10-08: revenue = ONLY the dispo pipeline's 💰 DEAL WON deals (paid,
// escrow closed) — the life of the company. Each deal credits everyone named
// on it (assigned rep + followers), full value, so a person sees their whole
// impact (team totals can exceed company revenue).
export type RevRow = { revenue: number; revenueYtd: number; deals: number };

export async function getRevenueByUser(year: number): Promise<{ byUserId: Map<string, RevRow>; unattributed: number; adjustments: Record<string, number>; companyTotal: number }> {
  const [users, wins, adjRow] = await Promise.all([
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.crmOpportunity.findMany({
      where: { stage: "deal_won_100", pipeline: { contains: "Signed" } },
      select: { value: true, assignedTo: true, updatedAt: true, formData: true },
    }),
    db.resource.findFirst({ where: { category: "__roster_rev_adjust__" } }),
  ]);
  let adjustments: Record<string, number> = {};
  try { adjustments = adjRow?.description ? JSON.parse(adjRow.description) : {}; } catch { /* none */ }
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
  for (const w of wins) {
    const profit = w.value ?? 0;
    const fd = (w.formData ?? {}) as Record<string, unknown>;
    const closedAt = typeof fd.__closedAt === "string" && fd.__closedAt ? fd.__closedAt : w.updatedAt.toISOString();
    const yr = Number(closedAt.slice(0, 4)) || 0;
    companyTotal += profit; companyDeals += 1;
    if (yr === year) companyYtd += profit;
    const credited = new Set<string>();
    matchIds(w.assignedTo).forEach((id) => credited.add(id));
    const followers = Array.isArray(fd.__followers) ? (fd.__followers as string[]) : [];
    for (const f of followers) matchIds(f).forEach((id) => credited.add(id));
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
