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
    key: "cc_lm",
    label: "Cold Call / Lead Mgr",
    short: "CC/LM",
    emoji: "📞",
    blurb: "Cold calls and sets appointments, then hands off to Acquisitions.",
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

export function positionLabel(key: string): string {
  return POSITIONS.find((p) => p.key === key)?.label ?? "Unassigned";
}

export function positionMeta(key: string): Position | undefined {
  return POSITIONS.find((p) => p.key === key);
}
