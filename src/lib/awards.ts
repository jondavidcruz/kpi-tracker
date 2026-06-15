// Gamified recognition: weekly top-performer wins + AI Champion standings.
import { db } from "./db";
import { lastWeekRange } from "./date";
import { getMeetingDeck } from "./meeting";

/** Record last week's top performer per role (idempotent per week+role). Run Mondays. */
export async function recordWeeklyAwards(today: string): Promise<number> {
  const wk = lastWeekRange(today);
  const deck = await getMeetingDeck(today);
  let n = 0;
  for (const r of deck.recognition) {
    await db.weeklyAward.upsert({
      where: { weekStart_role: { weekStart: wk.start, role: r.role } },
      update: { repName: r.rep, kpiName: r.kpi, value: r.value },
      create: { weekStart: wk.start, role: r.role, repName: r.rep, kpiName: r.kpi, value: r.value },
    });
    n++;
  }
  return n;
}

export interface Champion { rep: string; wins: number; streak: number; reigning: boolean }

/** Cumulative top-performer leaderboard with current streaks + reigning champs. */
export async function getAwardBoard(): Promise<{ champions: Champion[]; latestWeek: string | null }> {
  const awards = await db.weeklyAward.findMany({ orderBy: { weekStart: "desc" } });
  if (!awards.length) return { champions: [], latestWeek: null };
  const latestWeek = awards[0].weekStart;

  const wins = new Map<string, number>();
  const byWeek = new Map<string, Set<string>>();
  for (const a of awards) {
    wins.set(a.repName, (wins.get(a.repName) ?? 0) + 1);
    if (!byWeek.has(a.weekStart)) byWeek.set(a.weekStart, new Set());
    byWeek.get(a.weekStart)!.add(a.repName);
  }
  const weeksDesc = [...byWeek.keys()].sort().reverse();
  const streakOf = (rep: string) => {
    let s = 0;
    for (const w of weeksDesc) { if (byWeek.get(w)?.has(rep)) s++; else break; }
    return s;
  };
  const reigning = byWeek.get(latestWeek) ?? new Set<string>();
  const champions = [...wins.entries()]
    .map(([rep, w]) => ({ rep, wins: w, streak: streakOf(rep), reigning: reigning.has(rep) }))
    .sort((a, b) => b.wins - a.wins || b.streak - a.streak);
  return { champions, latestWeek };
}

export interface AiChampion { rep: string; count: number; reward: number }

/** AI Champion standings from proven submissions. */
export async function getAiChampions(): Promise<AiChampion[]> {
  const proven = await db.aiSubmission.findMany({ where: { status: "proven" } });
  const board = new Map<string, { count: number; reward: number }>();
  for (const s of proven) {
    const e = board.get(s.submittedBy) ?? { count: 0, reward: 0 };
    e.count += 1; e.reward += s.rewardAmount ?? 0; board.set(s.submittedBy, e);
  }
  return [...board.entries()].map(([rep, e]) => ({ rep, ...e })).sort((a, b) => b.count - a.count || b.reward - a.reward);
}
