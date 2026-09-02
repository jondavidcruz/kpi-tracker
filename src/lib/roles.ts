// Role/position definitions. A "position" is which scorecard a rep belongs to.
export interface Position {
  key: string;
  label: string;
  short: string;
  emoji: string;
  blurb: string;
}

export const POSITIONS: Position[] = [
  {
    key: "acquisitions",
    label: "Acquisitions",
    short: "ACQ",
    emoji: "🎯",
    blurb: "Takes appointments → makes offers → gets contracts signed.",
  },
  {
    key: "dispositions",
    label: "Dispositions",
    short: "DS",
    emoji: "🤝",
    blurb: "Finds buyers and moves deals under contract, sold as fast as possible.",
  },
];

export const POSITION_KEYS = POSITIONS.map((p) => p.key);

// Retired roles — removed from the live UI (no tabs, no dropdown options, no
// scorecard) but kept here so historical data and exported reports still label
// correctly. Cold Call / Lead Mgr was retired 2026-06-12.
const ARCHIVED_POSITIONS: Record<string, string> = {
  cc_lm: "Cold Call / Lead Mgr",
  listings: "Listings", // retired 2026-07-06 (Ethan deactivated; listings not actively worked)
};

export function positionLabel(key: string): string {
  return POSITIONS.find((p) => p.key === key)?.label ?? ARCHIVED_POSITIONS[key] ?? "Unassigned";
}

// Hybrid reps — cross-trained on a SECOND scorecard (Jon, 2026-08-25: "so we
// have more people capable of acquisitions"). The primary (User.position) keeps
// driving goals, alerts, and missing-entry nags; the secondary role's KPIs are
// OPTIONAL — they appear on /entry as an extra section and show on the daily
// review when logged, but never alert. Michelle + Sharyn: primarily
// Dispositions, cross-trained on Acquisitions.
export const SECONDARY_POSITION: Record<string, string> = {
  michelle: "acquisitions",
  sharyn: "acquisitions",
};

/** The rep's cross-trained secondary scorecard, or null. Never equals their primary. */
export function secondaryPositionOf(user: { name?: string; position?: string } | null | undefined): string | null {
  const first = (user?.name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const sec = SECONDARY_POSITION[first] ?? null;
  return sec && sec !== user?.position ? sec : null;
}

export function positionMeta(key: string): Position | undefined {
  return POSITIONS.find((p) => p.key === key);
}
