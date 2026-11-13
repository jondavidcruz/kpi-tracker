// 🧭 Curated DealMachine land-research filter catalog.
// DealMachine exposes 342 filters across 46 groups — dumping all of them in a UI would be WORSE
// than DealMachine, not better. This is the high-signal front door: the subset that actually moves
// a land-wholesaling + owner-motivation hunt, grouped and labeled so you dial a buy-box in seconds.
// Counts against these are FREE (DealMachine credits only burn on a pull). compileFilters() turns UI
// state into the v2 API's filter array; the rules below were validated against the live API.

export type DmFilterSpec = { filter_id: string; operator?: string; value: unknown };

export type EnumOpt = { id: number; label: string };
export type Control =
  | { kind: "enum"; id: string; label: string; emoji?: string; hint?: string; options: EnumOpt[] }
  // apply=false ⇒ this toggle EXCLUDES (is_boolean false), e.g. "exclude landlocked"
  | { kind: "bool"; id: string; label: string; emoji?: string; hint?: string; apply?: boolean }
  | { kind: "num"; id: string; label: string; emoji?: string; hint?: string; money?: boolean; step?: number; minOnly?: boolean }
  | { kind: "str"; id: string; label: string; emoji?: string; hint?: string };

export type Group = { key: string; title: string; emoji: string; blurb?: string; advanced?: boolean; controls: Control[] };

export type WorkbenchState = {
  enums: Record<string, number[]>;
  bools: Record<string, boolean>;
  nums: Record<string, { min?: number; max?: number }>;
  strs?: Record<string, string>;
};

export const PROPERTY_TYPE_OPTS: EnumOpt[] = [
  { id: 6, label: "Vacant Land" },
  { id: 19, label: "Agriculture" },
  { id: 20, label: "Development Site" },
];
const FLOOD_OPTS: EnumOpt[] = [
  { id: 1, label: "Low risk" },
  { id: 2, label: "Moderate-low" },
  { id: 3, label: "High risk" },
  { id: 4, label: "High (coastal)" },
  { id: 5, label: "Undetermined" },
];

export const CATALOG: Group[] = [
  {
    key: "land", title: "Land", emoji: "🏞️", blurb: "What kind of dirt",
    controls: [
      { kind: "enum", id: "property_type", label: "Property type", options: PROPERTY_TYPE_OPTS, hint: "Defaults to Vacant Land" },
      { kind: "num", id: "lot_size_acres", label: "Lot size", hint: "acres", step: 0.1 },
      { kind: "num", id: "assessed_land_value", label: "Assessed land value", money: true, hint: "The margin signal — set a floor like $100k to skip cheap platted lots" },
      { kind: "num", id: "assessed_improvement_value", label: "Max improvement value", money: true, hint: "Low = raw/unimproved land" },
      { kind: "num", id: "estimated_value", label: "Market value (AVM)", money: true },
    ],
  },
  {
    key: "owner", title: "Owner & motivation", emoji: "🎯", blurb: "Why they'd sell",
    controls: [
      { kind: "bool", id: "has_out_of_state_owners", label: "Out-of-state owner", emoji: "✈️" },
      { kind: "bool", id: "has_absentee_owners", label: "Absentee owner", emoji: "🏚️" },
      { kind: "num", id: "ppm_num_properties_owned_by_owner", label: "Owns at least N properties", minOnly: true, hint: "Set 2+ for portfolio / multi-property owners" },
      { kind: "bool", id: "is_tax_delinquent", label: "Tax delinquent", emoji: "🔥" },
      { kind: "bool", id: "is_preforeclosure", label: "Pre-foreclosure", emoji: "⚖️" },
      { kind: "bool", id: "has_active_lien", label: "Active lien", emoji: "📎" },
      { kind: "bool", id: "is_free_and_clear", label: "Owns free & clear", emoji: "💰", hint: "No mortgage — clean land deal" },
      { kind: "bool", id: "is_vacant_home", label: "Vacant", emoji: "🕳️" },
      { kind: "bool", id: "is_zombie_property", label: "Zombie property", emoji: "🧟" },
      { kind: "bool", id: "is_pre_probate", label: "Probate", emoji: "🕊️" },
      { kind: "bool", id: "is_owned_by_trust", label: "Owned by trust", emoji: "🏛️" },
      { kind: "bool", id: "is_corporate_owned", label: "Corporate owned", emoji: "🏢" },
      { kind: "bool", id: "has_senior_owners", label: "Senior owner", emoji: "👴" },
    ],
  },
  {
    key: "quality", title: "Land quality / exclude", emoji: "🌊", blurb: "Keep the good dirt",
    controls: [
      { kind: "bool", id: "is_landlocked", label: "Exclude landlocked", apply: false },
      { kind: "bool", id: "is_inside_special_flood_hazard_area", label: "Exclude flood hazard", apply: false },
      { kind: "enum", id: "flood_zone", label: "Flood zone", options: FLOOD_OPTS },
      { kind: "num", id: "road_frontage_feet", label: "Min road frontage", hint: "feet", minOnly: true },
    ],
  },
  // ── Advanced groups (the long tail) — rendered behind an "All filters" expander. All
  // properties-source + validated against the live v2 count API. ──
  {
    key: "valuation", title: "Valuation & equity", emoji: "💰", advanced: true, controls: [
      { kind: "num", id: "assessed_total_value", label: "Total assessed value", money: true },
      { kind: "num", id: "estimated_equity_amount", label: "Estimated equity", money: true },
      { kind: "num", id: "estimated_equity_percentage", label: "Equity %" },
      { kind: "num", id: "tax_amount", label: "Annual tax amount", money: true },
    ],
  },
  {
    key: "lot2", title: "Lot detail", emoji: "📐", advanced: true, controls: [
      { kind: "num", id: "lot_size_sqft", label: "Lot size (sqft)" },
      { kind: "num", id: "road_count", label: "Min road count", minOnly: true },
      { kind: "num", id: "distance_to_road_feet", label: "Max distance to road (ft)" },
      { kind: "bool", id: "is_corner_lot", label: "Corner lot", emoji: "📍" },
      { kind: "str", id: "zoning", label: "Zoning contains", hint: "e.g. AG, RSF" },
      { kind: "str", id: "subdivision_name", label: "Subdivision contains" },
    ],
  },
  {
    key: "distress2", title: "Distress detail", emoji: "📉", advanced: true, controls: [
      { kind: "num", id: "tax_delinquent_year", label: "Delinquent since year (≤)" },
      { kind: "num", id: "num_total_active_liens", label: "Min active liens", minOnly: true },
      { kind: "num", id: "total_open_lien_amount", label: "Lien amount", money: true },
      { kind: "bool", id: "has_hoa_lien", label: "HOA lien", emoji: "📎" },
      { kind: "bool", id: "is_bank_owned", label: "Bank owned", emoji: "🏦" },
      { kind: "enum", id: "foreclosure_status", label: "Foreclosure status", options: [{ id: 1, label: "Pre-foreclosure" }, { id: 2, label: "In foreclosure" }, { id: 3, label: "Bank owned" }] },
    ],
  },
  {
    key: "owner2", title: "More owner signals", emoji: "👥", advanced: true, controls: [
      { kind: "enum", id: "ownership_entity_type", label: "Entity type", options: [{ id: 1, label: "Individual" }, { id: 2, label: "Corporation" }, { id: 3, label: "Trust" }, { id: 4, label: "Bank" }, { id: 5, label: "Government" }] },
      { kind: "bool", id: "is_owner_occupied", label: "Exclude owner-occupied", apply: false },
      { kind: "bool", id: "is_likely_to_move", label: "Likely to move", emoji: "📦" },
    ],
  },
  {
    key: "listing", title: "Listing / MLS", emoji: "🏘️", advanced: true, controls: [
      { kind: "enum", id: "market_status", label: "Market status", options: [{ id: 1, label: "Active" }, { id: 2, label: "Pending" }, { id: 3, label: "Contingent" }, { id: 4, label: "Recently sold" }, { id: 5, label: "Expired" }, { id: 6, label: "Off market" }] },
      { kind: "num", id: "mls_days_on_market", label: "Days on market" },
      { kind: "bool", id: "is_recently_sold", label: "Recently sold", emoji: "🏷️" },
    ],
  },
  {
    key: "utilities", title: "Utilities", emoji: "🚰", advanced: true, controls: [
      { kind: "enum", id: "water", label: "Water", options: [{ id: 2, label: "Municipal" }, { id: 5, label: "Well" }, { id: 1, label: "Cistern" }, { id: 4, label: "Spring" }] },
      { kind: "enum", id: "sewer", label: "Sewer", options: [{ id: 1, label: "Municipal" }, { id: 4, label: "Septic" }, { id: 3, label: "Storm" }] },
      { kind: "num", id: "year_built", label: "Year built", hint: "0 = unbuilt land" },
    ],
  },
];

// Vacant Land + exclude landlocked is the sane starting point for every land hunt.
export const DEFAULT_STATE: WorkbenchState = { enums: { property_type: [6] }, bools: { is_landlocked: true }, nums: {}, strs: {} };

export type Preset = { key: string; label: string; emoji: string; state: () => WorkbenchState };
export const PRESETS: Preset[] = [
  // 🏗 The elite-land default (Jon 2026-11-08): BIG, valuable, buildable lots developers want —
  // land value ≥$75k + ≥0.25 acre, so the penny lots (Lehigh Acres) never show up.
  { key: "developer_lots", label: "Developer lots — big + valuable (not penny lots)", emoji: "🏗",
    state: () => ({ enums: { property_type: [6] }, bools: { is_landlocked: true, has_absentee_owners: true }, nums: { assessed_land_value: { min: 75000 }, lot_size_acres: { min: 0.25 } } }) },
  { key: "motivated_multi", label: "Out-of-state · owns multiple · delinquent", emoji: "🎯",
    state: () => ({ enums: { property_type: [6] }, bools: { has_out_of_state_owners: true, is_tax_delinquent: true, is_landlocked: true }, nums: { ppm_num_properties_owned_by_owner: { min: 2 } } }) },
  { key: "high_value_land", label: "High-value land ($100k+)", emoji: "💎",
    state: () => ({ enums: { property_type: [6] }, bools: { has_absentee_owners: true, is_landlocked: true }, nums: { assessed_land_value: { min: 100000 } } }) },
  { key: "free_clear", label: "Free & clear + absentee", emoji: "💰",
    state: () => ({ enums: { property_type: [6] }, bools: { is_free_and_clear: true, has_absentee_owners: true, is_landlocked: true }, nums: {} }) },
  { key: "distressed", label: "Distressed (lien / foreclosure / delinquent)", emoji: "🔥",
    state: () => ({ enums: { property_type: [6] }, bools: { is_tax_delinquent: true, is_preforeclosure: true, has_active_lien: true }, nums: {} }) },
  { key: "acreage_oos", label: "Big acreage · out-of-state", emoji: "🌄",
    state: () => ({ enums: { property_type: [6, 19] }, bools: { has_out_of_state_owners: true, is_landlocked: true }, nums: { lot_size_acres: { min: 1, max: 20 } } }) },
];

// 🎯 Niche snipers — Jon's focus plays (waterfront / solar / data-center). One click loads the part
// of each sniper filter DealMachine can COUNT for free (property type, value/acre gates, owner skew,
// flood), and lists the geo steps you then apply on the map (transmission / navigable-water
// proximity, subdivision blacklist) — those are NOT DealMachine count filters (verified against the
// live 342-filter catalog: no transmission/substation/canal/coast/navigable filter exists). Full
// area intel + live source links live on the 🎯 Niches tab (niche-markets.ts). "Sell the use, not
// the dirt." Each area is a plain query string resolved via /api/markets/dm?action=locations.
export type NicheArea = { name: string; q: string; badge?: string };
export type NichePreset = {
  key: string; nicheId: string; label: string; emoji: string; blurb: string;
  state: () => WorkbenchState;
  autoApplied: string[]; // enforced by the live FREE count
  refine: string[];      // apply on the map / in DealMachine at pull time (not a free count filter)
  areas: NicheArea[];    // recommended hunt areas — a click resolves + picks it, keeping the buy-box
};

export const NICHE_PRESETS: NichePreset[] = [
  {
    key: "waterfront", nicheId: "waterfront", emoji: "🌊", label: "Waterfront land",
    blurb: "Vacant waterfront lots over the $50k penny-lot floor → canal & luxury spec builders. Our proven play.",
    state: () => ({ enums: { property_type: [6] }, bools: { is_landlocked: true, has_absentee_owners: true }, nums: { assessed_land_value: { min: 50000 }, lot_size_acres: { min: 0.15 } } }),
    autoApplied: [
      "Vacant land · assessed land value ≥ $50k (auto-kills Lehigh / Rotonda / Burnt Store Lakes penny lots)",
      "Lot ≥ 0.15 ac · not landlocked · absentee owner (away = motivated)",
    ],
    refine: [
      "On the map turn on the 🏘 parcel layer (zoom ≥15) and keep only lots on a NAVIGABLE canal / river / Gulf / ICW / lake — drop freshwater drainage & retention.",
      "Prefer no-fixed-bridge / direct water access — the single biggest value multiplier.",
      "At pull time exclude penny-lot subdivisions: Lehigh Acres, Burnt Store Lakes, Rotonda interior, Golden Gate Estates, Citrus Springs, Marion Oaks, Poinciana.",
      "Optional tighteners (Customize): owns free & clear, road frontage ≥ 60 ft (80'+ for sailboat/premium).",
    ],
    areas: [
      { name: "Cape Coral", q: "Cape Coral, FL", badge: "volume" },
      { name: "Punta Gorda", q: "Punta Gorda, FL", badge: "sailboat" },
      { name: "Marco Island", q: "Marco Island, FL" },
      { name: "Apollo Beach", q: "Apollo Beach, FL" },
      { name: "Palm Coast", q: "Palm Coast, FL" },
      { name: "Crystal River", q: "Crystal River, FL" },
    ],
  },
  {
    key: "solar", nicheId: "solar", emoji: "☀️", label: "Solar land",
    blurb: "Flat, cheap ag land near transmission — the 'be the only wholesaler hitting it' play. Almost no one sources for it.",
    state: () => ({ enums: { property_type: [6, 19] }, bools: { is_landlocked: true, is_inside_special_flood_hazard_area: true, has_absentee_owners: true }, nums: { lot_size_acres: { min: 150, max: 1500 } } }),
    autoApplied: [
      "Vacant + agriculture · 150–1,500 ac (prioritize 400–1,000 contiguous)",
      "Not landlocked · out of the flood hazard area · absentee rural owner",
    ],
    refine: [
      "Transmission is the game — keep parcels within ~2 mi of a 138 kV+ line AND ~2 mi of a substation (gen-tie runs ~$1–3M/mi). Not a DealMachine filter.",
      "Cross-reference against the utility Ten-Year Site Plan preferred sites + county conditional-use agendas (live links on the 🎯 Niches tab).",
      "Exclude parcels already owned by FPL / Duke / TECO / Origis / NextEra — already taken.",
      "Flag adjacent same-owner parcels for assembly; favor aging cattle/citrus operations.",
    ],
    areas: [
      { name: "Manatee", q: "Manatee County, FL", badge: "FPL" },
      { name: "Hendry", q: "Hendry County, FL", badge: "FPL" },
      { name: "St. Lucie", q: "St. Lucie County, FL", badge: "FPL" },
      { name: "Polk", q: "Polk County, FL" },
      { name: "Okeechobee", q: "Okeechobee County, FL", badge: "FPL" },
    ],
  },
  {
    key: "data_center", nicheId: "data_center", emoji: "🖥", label: "Data-center land",
    blurb: "Big tracts near power — highest ROI, down the line. Buy raw land before the hyperscaler/utility arrives.",
    state: () => ({ enums: { property_type: [6, 19, 20] }, bools: { is_landlocked: true, is_inside_special_flood_hazard_area: true, has_absentee_owners: true }, nums: { lot_size_acres: { min: 100, max: 2000 } } }),
    autoApplied: [
      "Vacant + ag + development site · ≥ 100 ac (sweet spot 150–1,500; land-bank ≥ 1,000)",
      "Not landlocked · out of the flood hazard area · absentee owner",
    ],
    refine: [
      "Power adjacency is the whole thesis — within ~1 mi of a 138–500 kV line AND ~5–10 mi of a substation with spare capacity (TYSP). Not a DealMachine filter.",
      "Prefer single-owner contiguous tracts; flag adjacent same-owner parcels for assembly.",
      "Owner skew: ag/ranch/timber corps, phosphate/mining, citrus estates, land trusts, decommissioned power-plant sites.",
      "Watch county data-center moratoria (negative signal) — links on the 🎯 Niches tab.",
    ],
    areas: [
      { name: "Polk", q: "Polk County, FL", badge: "1GW+" },
      { name: "St. Lucie", q: "St. Lucie County, FL" },
      { name: "DeSoto", q: "DeSoto County, FL" },
      { name: "Palm Beach", q: "Palm Beach County, FL" },
      { name: "Citrus", q: "Citrus County, FL" },
    ],
  },
];

const BOOL_APPLY = (() => {
  const m = new Map<string, boolean>();
  for (const g of CATALOG) for (const c of g.controls) if (c.kind === "bool") m.set(c.id, c.apply ?? true);
  return m;
})();
const CONTROL_BY_ID = (() => {
  const m = new Map<string, Control>();
  for (const g of CATALOG) for (const c of g.controls) m.set(c.id, c);
  return m;
})();

// Compile UI state → DealMachine v2 filter array. Rules validated against the live API:
//   • range requires BOTH {min,max}; one-sided ⇒ greater_than_or_equal / less_than_or_equal
//   • enum ⇒ contains_any; bool ⇒ is_boolean (value false for "exclude" toggles)
//   • property_type always falls back to Vacant Land so a count is never "all property types"
export function compileFilters(state: WorkbenchState): DmFilterSpec[] {
  const out: DmFilterSpec[] = [];
  const ptypes = state.enums.property_type?.length ? state.enums.property_type : [6];
  out.push({ filter_id: "property_type", operator: "contains_any", value: ptypes });
  for (const [id, ids] of Object.entries(state.enums)) {
    if (id === "property_type" || !ids?.length) continue;
    out.push({ filter_id: id, operator: "contains_any", value: ids });
  }
  for (const [id, on] of Object.entries(state.bools)) {
    if (!on) continue;
    out.push({ filter_id: id, operator: "is_boolean", value: BOOL_APPLY.has(id) ? BOOL_APPLY.get(id)! : true });
  }
  for (const [id, r] of Object.entries(state.nums)) {
    const hasMin = r?.min != null && !Number.isNaN(r.min);
    const hasMax = r?.max != null && !Number.isNaN(r.max);
    if (hasMin && hasMax) out.push({ filter_id: id, operator: "range", value: { min: r.min, max: r.max } });
    else if (hasMin) out.push({ filter_id: id, operator: "greater_than_or_equal", value: r.min });
    else if (hasMax) out.push({ filter_id: id, operator: "less_than_or_equal", value: r.max });
  }
  for (const [id, v] of Object.entries(state.strs ?? {})) {
    if (v && v.trim()) out.push({ filter_id: id, operator: "contains", value: v.trim() });
  }
  return out;
}

// Human-readable recipe — the handoff you replicate in DealMachine to pull.
export function describeFilters(state: WorkbenchState): string[] {
  const lines: string[] = [];
  const labelOf = (id: string) => CONTROL_BY_ID.get(id)?.label ?? id;
  const ptypes = state.enums.property_type?.length ? state.enums.property_type : [6];
  lines.push("Property type: " + ptypes.map((i) => PROPERTY_TYPE_OPTS.find((o) => o.id === i)?.label ?? i).join(", "));
  for (const [id, ids] of Object.entries(state.enums)) {
    if (id === "property_type" || !ids?.length) continue;
    const ctrl = CONTROL_BY_ID.get(id);
    const opts = ctrl && ctrl.kind === "enum" ? ctrl.options : [];
    lines.push(`${labelOf(id)}: ${ids.map((i) => opts.find((o) => o.id === i)?.label ?? i).join(", ")}`);
  }
  for (const [id, on] of Object.entries(state.bools)) if (on) lines.push(labelOf(id));
  for (const [id, r] of Object.entries(state.nums)) {
    if (r?.min == null && r?.max == null) continue;
    const ctrl = CONTROL_BY_ID.get(id);
    const money = ctrl?.kind === "num" && ctrl.money;
    const fmt = (n?: number) => (n == null ? "" : money ? "$" + n.toLocaleString() : n.toLocaleString());
    const parts = [r.min != null ? "≥ " + fmt(r.min) : "", r.max != null ? "≤ " + fmt(r.max) : ""].filter(Boolean);
    lines.push(`${labelOf(id)}: ${parts.join(" · ")}`);
  }
  for (const [id, v] of Object.entries(state.strs ?? {})) if (v && v.trim()) lines.push(`${labelOf(id)}: "${v.trim()}"`);
  return lines;
}

// How many user filters are active (property_type default [6] doesn't count).
export function activeCount(state: WorkbenchState): number {
  let n = 0;
  for (const [id, ids] of Object.entries(state.enums)) if (id !== "property_type" && ids?.length) n++;
  for (const on of Object.values(state.bools)) if (on) n++;
  for (const r of Object.values(state.nums)) if (r?.min != null || r?.max != null) n++;
  for (const v of Object.values(state.strs ?? {})) if (v && v.trim()) n++;
  return n;
}
