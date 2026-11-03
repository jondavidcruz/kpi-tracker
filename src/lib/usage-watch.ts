// 📊 Platform Usage Watch (Jon 2026-11-03) — a standing guardrail so we never get the
// Supabase "exceed_egress_quota" shutdown again (the whole team was locked out 2026-11-03).
// Keeps a weekly log of the real Supabase + Vercel usage numbers vs the Pro-plan limits,
// flags anything approaching a limit, and powers the Friday routine's alert. Stored in the
// Resource table (category __usage_log__) as JSON — no schema migration.
import { db } from "./db";

const CAT = "__usage_watch__";

// Pro-plan included quotas. Supabase values are exact (from the usage dashboard 2026-11-03);
// Vercel's are a reference target (verify on your plan — Vercel's included bandwidth is plan-
// and usage-dependent). Numbers are in GB unless noted.
export const PLATFORM_LIMITS = {
  supabase: {
    egressGB: 250,
    cachedEgressGB: 250,
    storageGB: 100,          // file storage
    dbSizeGB: 8,             // database size (Pro includes 8GB disk/project)
    logIngestionGB: 20,
    mau: 100_000,            // monthly active users
    edgeInvocations: 2_000_000,
    realtimeMessages: 5_000_000,
  },
  vercel: {
    // Reference only — confirm against your Vercel plan's current included amounts.
    bandwidthGB: 1_000,      // "Fast Data Transfer" ~1TB on Pro (reference)
  },
} as const;

// Warn early, act before it bites. % of the limit.
export const WARN_PCT = 70;
export const ACT_PCT = 85;

// A reading is "stale" (needs a fresh check) after this many days.
export const STALE_DAYS = 8;

export type UsageReading = {
  at: string;              // ISO when recorded
  cycleEnd?: string;       // optional billing-cycle end note, e.g. "03 Dec 2026"
  egressGB: number;        // Supabase egress used this cycle
  storageGB: number;       // Supabase file storage size
  dbSizeGB?: number;       // Supabase database size
  logGB?: number;          // Supabase log ingestion
  vercelBandwidthGB?: number; // Vercel bandwidth used this cycle
  // 🤖 Claude Code is a FLAT subscription, not metered — tracking it answers "could I drop
  // from the $200 (Max 20x) plan to $100 (Max 5x) without hitting limits?" (Jon 2026-11-03).
  // Record the PEAK usage % the Claude Code /usage view showed this period (0–100 of the
  // current plan's limit). Staying well under 25% most weeks ⇒ the $100 plan likely covers it
  // (it's ~1/4 the capacity of the $200 plan).
  claudeCodePlan?: string;    // e.g. "$200 Max 20x" | "$100 Max 5x"
  claudeCodePeakPct?: number; // peak % of the plan's limit hit this period
  note?: string;
  by: string;
};

// Claude Code: the $100 (Max 5x) plan is ~1/4 the capacity of the $200 (Max 20x) plan, so if
// peak usage on the $200 plan stays at/under this, the $100 plan should cover it with headroom.
export const CLAUDE_DOWNGRADE_PCT = 22;

export type MetricStatus = {
  key: string; label: string; used: number; limit: number; unit: string;
  pct: number; level: "ok" | "warn" | "act";
};

const levelFor = (pct: number): "ok" | "warn" | "act" => (pct >= ACT_PCT ? "act" : pct >= WARN_PCT ? "warn" : "ok");

export async function readUsageLog(): Promise<UsageReading[]> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row?.description) return [];
  try { const a = JSON.parse(row.description); return Array.isArray(a) ? (a as UsageReading[]) : []; } catch { return []; }
}

export async function recordUsageReading(r: UsageReading): Promise<void> {
  const log = await readUsageLog();
  log.unshift(r);                      // newest first
  const trimmed = log.slice(0, 52);    // keep a year of weekly readings
  const description = JSON.stringify(trimmed);
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { category: CAT, title: "usage-watch", url: "", description } });
}

/** Per-metric status for the latest reading (empty array if no reading yet). */
export function metricsFor(r: UsageReading | null): MetricStatus[] {
  if (!r) return [];
  const L = PLATFORM_LIMITS;
  const mk = (key: string, label: string, used: number, limit: number, unit = "GB"): MetricStatus => {
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
    return { key, label, used, limit, unit, pct, level: levelFor(pct) };
  };
  const out: MetricStatus[] = [
    mk("egress", "Supabase egress", r.egressGB, L.supabase.egressGB),
    mk("storage", "Supabase file storage", r.storageGB, L.supabase.storageGB),
  ];
  if (r.dbSizeGB != null) out.push(mk("db", "Supabase database size", r.dbSizeGB, L.supabase.dbSizeGB));
  if (r.logGB != null) out.push(mk("log", "Supabase log ingestion", r.logGB, L.supabase.logIngestionGB));
  if (r.vercelBandwidthGB != null) out.push(mk("vercel", "Vercel bandwidth", r.vercelBandwidthGB, L.vercel.bandwidthGB));
  return out;
}

export type UsageStatus = {
  recordedAt: string | null;
  stale: boolean;
  worstPct: number;
  level: "ok" | "warn" | "act" | "none";
  flagged: { label: string; pct: number; level: "warn" | "act" }[];
};

/** Overall status used by the card banner, the public endpoint, and the Friday routine. */
export async function usageStatus(): Promise<UsageStatus> {
  const log = await readUsageLog();
  const latest = log[0] ?? null;
  if (!latest) return { recordedAt: null, stale: true, worstPct: 0, level: "none", flagged: [] };
  const ageDays = (Date.now() - Date.parse(latest.at)) / 86_400_000;
  const stale = ageDays > STALE_DAYS;
  const metrics = metricsFor(latest);
  const worstPct = metrics.reduce((m, x) => Math.max(m, x.pct), 0);
  const flagged = metrics.filter((x) => x.level !== "ok").map((x) => ({ label: x.label, pct: x.pct, level: x.level as "warn" | "act" }));
  const level = metrics.some((x) => x.level === "act") ? "act" : metrics.some((x) => x.level === "warn") ? "warn" : "ok";
  return { recordedAt: latest.at, stale, worstPct, level, flagged };
}
