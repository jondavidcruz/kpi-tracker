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
  | { kind: "num"; id: string; label: string; emoji?: string; hint?: string; money?: boolean; step?: number; minOnly?: boolean };

export type Group = { key: string; title: string; emoji: string; blurb?: string; controls: Control[] };

export type WorkbenchState = {
  enums: Record<string, number[]>;
  bools: Record<string, boolean>;
  nums: Record<string, { min?: number; max?: number }>;
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
];

// Vacant Land + exclude landlocked is the sane starting point for every land hunt.
export const DEFAULT_STATE: WorkbenchState = { enums: { property_type: [6] }, bools: { is_landlocked: true }, nums: {} };

export type Preset = { key: string; label: string; emoji: string; state: () => WorkbenchState };
export const PRESETS: Preset[] = [
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
  return lines;
}

// How many user filters are active (property_type default [6] doesn't count).
export function activeCount(state: WorkbenchState): number {
  let n = 0;
  for (const [id, ids] of Object.entries(state.enums)) if (id !== "property_type" && ids?.length) n++;
  for (const on of Object.values(state.bools)) if (on) n++;
  for (const r of Object.values(state.nums)) if (r?.min != null || r?.max != null) n++;
  return n;
}
