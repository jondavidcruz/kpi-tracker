// Derive live availability + worked time from a user's time-card punches.

export type PresenceState = "online" | "break" | "lunch" | "offline";

const STATE_BY_KIND: Record<string, PresenceState> = {
  in: "online",
  break_end: "online",
  lunch_end: "online",
  break_start: "break",
  lunch_start: "lunch",
  out: "offline",
};

/** Current state + the time it started, from punches sorted ascending by `at`. */
export function stateFromPunches(punches: { kind: string; at: Date }[]): { state: PresenceState; since: Date | null } {
  if (punches.length === 0) return { state: "offline", since: null };
  const last = punches[punches.length - 1];
  return { state: STATE_BY_KIND[last.kind] ?? "offline", since: last.at };
}

/** Minutes actually worked today = clocked-in time minus breaks/lunch, up to `now`. */
export function workedMinutes(punches: { kind: string; at: Date }[], now: Date): number {
  let total = 0;
  let inAt: Date | null = null;
  for (const p of punches) {
    if (p.kind === "in" || p.kind === "break_end" || p.kind === "lunch_end") {
      if (inAt === null) inAt = p.at;
    } else if (p.kind === "out" || p.kind === "break_start" || p.kind === "lunch_start") {
      if (inAt !== null) {
        total += p.at.getTime() - inAt.getTime();
        inAt = null;
      }
    }
  }
  if (inAt !== null) total += now.getTime() - inAt.getTime();
  return Math.max(0, Math.round(total / 60000));
}

export function groupByUser(punches: { userId: string; kind: string; at: Date }[]): Map<string, { kind: string; at: Date }[]> {
  const byUser = new Map<string, { kind: string; at: Date }[]>();
  for (const p of punches) {
    const arr = byUser.get(p.userId) ?? [];
    arr.push({ kind: p.kind, at: p.at });
    byUser.set(p.userId, arr);
  }
  return byUser;
}
