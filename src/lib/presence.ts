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

/**
 * Minutes actually worked = clocked-in time minus breaks/lunch.
 * A still-open session is counted only up to `cap` (the scheduled shift end +
 * grace) when provided, else up to `now`. This is what stops a forgotten
 * clock-out from racking up phantom hours overnight or through a vacation.
 */
export function workedMinutes(
  punches: { kind: string; at: Date }[],
  now: Date,
  cap?: Date | null,
): number {
  // Never count past the shift cap, and never past the real clock.
  const ceiling = cap && cap.getTime() < now.getTime() ? cap : now;
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
  if (inAt !== null) total += Math.max(0, ceiling.getTime() - inAt.getTime());
  return Math.max(0, Math.round(total / 60000));
}

/** True if the last punch leaves the person clocked in (online/break/lunch). */
export function isOpenSession(punches: { kind: string; at: Date }[]): boolean {
  const { state } = stateFromPunches(punches);
  return state !== "offline";
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
