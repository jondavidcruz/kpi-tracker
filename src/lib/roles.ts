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
  {
    key: "listings",
    label: "Listings",
    short: "LST",
    emoji: "🏷️",
    blurb: "Closes listing deals already offered on — works his own pipeline of leads.",
  },
];

export const POSITION_KEYS = POSITIONS.map((p) => p.key);

// Retired roles — removed from the live UI (no tabs, no dropdown options, no
// scorecard) but kept here so historical data and exported reports still label
// correctly. Cold Call / Lead Mgr was retired 2026-06-12.
const ARCHIVED_POSITIONS: Record<string, string> = {
  cc_lm: "Cold Call / Lead Mgr",
};

export function positionLabel(key: string): string {
  return POSITIONS.find((p) => p.key === key)?.label ?? ARCHIVED_POSITIONS[key] ?? "Unassigned";
}

export function positionMeta(key: string): Position | undefined {
  return POSITIONS.find((p) => p.key === key);
}
