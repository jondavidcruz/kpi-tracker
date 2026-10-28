// 🏠🏢 Mom-and-pop vs big-builder classification (Jon 2026-10-28: "John targets mom & pop
// builders — fastest feedback, work them first"). Pure + client-safe. A manual override
// (stored on the buyer's formData.__builderSize) always wins; otherwise we infer from the
// company name, a nationwide/multi-state footprint, and stated volume.

export type BuilderSize = "mompop" | "big";

// National production builders, large regionals, and institutional/iBuyers — the "big" set.
const BIG_NAMES = /\b(lennar|d\.?\s?r\.?\s?horton|horton|pulte|centex|del webb|nvr|ryan homes|dsld|k\.?b\.? ?home|kb homes|meritage|taylor morrison|toll brothers|century communities|lgi homes|lgi|m\/i homes|mi homes|tri\s?pointe|dream finders|ashton woods|david weekley|weekley|perry homes|highland homes|mattamy|clayton homes|richmond american|hovnanian|beazer|shea homes|calatlantic|stanley martin|landsea|smith douglas|dr\s?horton|opendoor|offerpad|zillow|invitation homes|american homes 4 rent|amh|progress residential|tricon|amherst|firstkey|hilbers|homebuilder|ibuyer|holdings)\b/i;

// Strong small/local signals — custom builders are almost always mom & pop.
const SMALL_NAMES = /\b(custom|remodel|renovation|handyman|hand to hand|fix|flip)\b/i;

function firstInt(s?: string): number {
  const m = String(s ?? "").replace(/[, ]/g, "").match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

export function classifyBuilderSize(opts: {
  name?: string;
  override?: string | null;         // formData.__builderSize set by the team — wins
  nationwide?: boolean;
  statesCount?: number;             // distinct states in the buy box
  volumeText?: string;              // "deals / lots per year" or volume_note
  extraText?: string;               // imported buy-box text / notes
}): BuilderSize {
  const ov = String(opts.override ?? "").toLowerCase();
  if (ov === "big" || ov === "mompop") return ov as BuilderSize;

  const hay = `${opts.name ?? ""} ${opts.extraText ?? ""}`;
  if (SMALL_NAMES.test(opts.name ?? "")) return "mompop"; // custom/remodel in the NAME → small
  if (BIG_NAMES.test(hay)) return "big";
  if (opts.nationwide) return "big";
  if ((opts.statesCount ?? 0) >= 4) return "big";       // multi-state footprint = production builder
  if (firstInt(opts.volumeText) >= 30) return "big";     // ~30+ lots/year = big
  return "mompop";                                        // default: local = work first
}

export function builderSizeMeta(size: BuilderSize): { label: string; emoji: string; cls: string; title: string } {
  return size === "big"
    ? { emoji: "🏢", label: "Big Builder", cls: "bg-slate-100 text-slate-500 ring-slate-200", title: "National/production builder or iBuyer — slower feedback. Click to change." }
    : { emoji: "🏠", label: "Mom & Pop", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200", title: "Small local builder — fastest feedback, work these first. Click to change." };
}
