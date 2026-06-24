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

export type DaySegment = { type: "break" | "lunch"; startMs: number; endMs: number | null; min: number };
export type DayTimeline = {
  clockInMs: number | null;
  segments: DaySegment[]; // breaks + lunches, in order
  lastBreakEndMs: number | null;
  lastLunchEndMs: number | null;
  // How long they've been continuously online right now (since clock-in or last break/lunch end), in minutes.
  continuousMin: number;
};

/** Break/lunch history for one day + how long they've been on without a break right now. */
export function daySegments(punches: { kind: string; at: Date }[], now: Date): DayTimeline {
  const segments: DaySegment[] = [];
  let clockInMs: number | null = null;
  let lastBreakEndMs: number | null = null;
  let lastLunchEndMs: number | null = null;
  let openStartMs: number | null = null; // start of a current break/lunch
  let openType: "break" | "lunch" | null = null;
  let onlineSinceMs: number | null = null; // start of the current continuous-online stretch

  for (const p of punches) {
    const t = p.at.getTime();
    if (p.kind === "in") { clockInMs = clockInMs ?? t; onlineSinceMs = t; }
    else if (p.kind === "break_start") { openStartMs = t; openType = "break"; onlineSinceMs = null; }
    else if (p.kind === "lunch_start") { openStartMs = t; openType = "lunch"; onlineSinceMs = null; }
    else if (p.kind === "break_end" || p.kind === "lunch_end") {
      if (openStartMs != null && openType) {
        segments.push({ type: openType, startMs: openStartMs, endMs: t, min: Math.round((t - openStartMs) / 60000) });
        if (openType === "break") lastBreakEndMs = t; else lastLunchEndMs = t;
      }
      openStartMs = null; openType = null; onlineSinceMs = t;
    } else if (p.kind === "out") { onlineSinceMs = null; }
  }
  // Still on a break/lunch right now → include it as ongoing.
  if (openStartMs != null && openType) {
    segments.push({ type: openType, startMs: openStartMs, endMs: null, min: Math.round((now.getTime() - openStartMs) / 60000) });
  }
  const continuousMin = onlineSinceMs != null ? Math.max(0, Math.round((now.getTime() - onlineSinceMs) / 60000)) : 0;
  return { clockInMs, segments, lastBreakEndMs, lastLunchEndMs, continuousMin };
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
