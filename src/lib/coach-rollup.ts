// 📊 Per-rep coaching scorecard (roadmap A5) — rolls up the per-call CallScore history
// into each rep's average, trend, and weakest/strongest coaching areas. Pure aggregation
// over rows the AI already scored — NO new AI calls, so it's free to compute. The per-call
// breakdown area names are free text (the model picks them per call), so we bucket them
// into a canonical rubric before averaging.
import { db } from "@/lib/db";

// Canonical coaching rubric + the keywords that map a free-text area name into it.
const BUCKETS: { key: string; label: string; rx: RegExp }[] = [
  { key: "rapport", label: "Rapport / trust", rx: /rapport|trust|connect|trust-build|likab/i },
  { key: "motivation", label: "Motivation discovery", rx: /motiv|discovery|pain|need|why|situation|probing|questions/i },
  { key: "qualifying", label: "Qualifying", rx: /qualif|budget|timeline|authority/i },
  { key: "anchoring", label: "Price anchoring / framing", rx: /anchor|price|pricing|number|framing|offer/i },
  { key: "objection", label: "Objection handling", rx: /objection|rebuttal|pushback|concern/i },
  { key: "nextstep", label: "Setting the next step", rx: /next step|next-step|follow.?up|appointment|commit|close|closing/i },
  { key: "talk", label: "Talk / listen ratio", rx: /talk|listen|ratio|monolog|interrupt/i },
  { key: "script", label: "Script adherence", rx: /script/i },
];
function bucketOf(area: string): { key: string; label: string } | null {
  for (const b of BUCKETS) if (b.rx.test(area)) return { key: b.key, label: b.label };
  return null;
}

export type AreaAvg = { key: string; label: string; avg: number; n: number };
export type RepCoaching = {
  rep: string;
  calls: number;
  avgOverall: number | null;
  trend: "up" | "down" | "flat" | null; // recent calls vs prior
  avgStars: number | null;              // 1–5 manual review rating, when present
  focus: AreaAvg[];     // 2–3 lowest-scoring areas → coach these
  strengths: AreaAvg[]; // 2 highest-scoring areas
  lastAt: string;       // ISO of most recent scored call
};

type Row = { repName: string; overall: number; reviewStars: number; breakdown: string; createdAt: Date };

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export async function getCoachingScorecards(): Promise<RepCoaching[]> {
  const rows: Row[] = await db.callScore
    .findMany({ orderBy: { createdAt: "desc" }, take: 600, select: { repName: true, overall: true, reviewStars: true, breakdown: true, createdAt: true } })
    .catch(() => []);
  const byRep = new Map<string, Row[]>();
  for (const r of rows) {
    const rep = (r.repName || "").trim();
    if (!rep) continue;
    (byRep.get(rep) ?? byRep.set(rep, []).get(rep)!).push(r);
  }

  const out: RepCoaching[] = [];
  for (const [rep, list] of byRep) {
    // list is newest-first (query order). Overall scores (ignore un-scored 0s).
    const scored = list.filter((r) => r.overall > 0);
    const avgOverall = mean(scored.map((r) => r.overall));
    // Trend: recent third vs the rest (needs enough calls to be meaningful).
    let trend: RepCoaching["trend"] = null;
    if (scored.length >= 4) {
      const cut = Math.max(1, Math.round(scored.length / 3));
      const recent = mean(scored.slice(0, cut).map((r) => r.overall));
      const prior = mean(scored.slice(cut).map((r) => r.overall));
      if (recent != null && prior != null) trend = recent - prior > 3 ? "up" : recent - prior < -3 ? "down" : "flat";
    }
    const stars = list.map((r) => r.reviewStars).filter((n) => n > 0);

    // Bucketed area averages across all this rep's calls.
    const agg = new Map<string, { label: string; sum: number; n: number }>();
    for (const r of list) {
      let bd: { area?: unknown; score?: unknown }[] = [];
      try { bd = JSON.parse(r.breakdown || "[]"); } catch { /* skip */ }
      for (const item of bd) {
        const area = String(item.area ?? "");
        const score = Number(item.score ?? NaN);
        if (!area || !Number.isFinite(score)) continue;
        const b = bucketOf(area);
        if (!b) continue;
        const cur = agg.get(b.key) ?? { label: b.label, sum: 0, n: 0 };
        cur.sum += score; cur.n += 1; agg.set(b.key, cur);
      }
    }
    const areas: AreaAvg[] = [...agg.entries()].map(([key, v]) => ({ key, label: v.label, avg: v.sum / v.n, n: v.n }));
    const sortedLow = [...areas].sort((a, b) => a.avg - b.avg);
    const focus = sortedLow.filter((a) => a.n >= 2).slice(0, 3);
    const strengths = [...areas].sort((a, b) => b.avg - a.avg).filter((a) => a.n >= 2).slice(0, 2);

    out.push({
      rep, calls: list.length, avgOverall: avgOverall != null ? Math.round(avgOverall) : null,
      trend, avgStars: mean(stars), focus, strengths, lastAt: list[0].createdAt.toISOString(),
    });
  }
  // Most-coached (most calls) first.
  return out.sort((a, b) => b.calls - a.calls);
}
