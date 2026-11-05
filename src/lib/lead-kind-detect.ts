// 🏕/🏠 Auto-detect whether a lead is LAND or a HOUSE (Jon 2026-11-05: DirectREI land leads keep
// importing as houses just because they have an address). Strategy that respects the RentCast
// 50/mo cap: decide from FREE signals first (APN, notes, pipeline) — no API call — and only fall
// back to an authoritative RentCast property-type lookup for the genuinely ambiguous ones.
import type { LeadKind } from "@/lib/lead-kind";

const LAND_RX = /\b(vacant|raw ?land|\bland\b|lot\b|lots\b|acre|acreage|parcel|unimproved|undeveloped|wooded|timber|pasture|ranch|\btbd\b|empty lot|build(?:able)? lot|homesite|home site)\b/i;
const HOUSE_RX = /\b(house|single ?family|\bsfr\b|duplex|triplex|fourplex|condo|townhouse|townhome|mobile home|manufactured|apartment|bed(?:room)?s?\b|bath(?:room)?s?\b|\bsq ?ft\b|square feet|roof|kitchen|garage|hoa dues)\b/i;

/** RentCast's propertyType string → our LeadKind. */
export function rcTypeToKind(propertyType: string): LeadKind {
  const t = (propertyType || "").toLowerCase();
  if (!t) return "";
  if (/land|vacant|lot/.test(t)) return "land";
  if (/family|condo|town|apartment|manufactured|mobile|duplex|triplex|residential|home/.test(t)) return "home";
  return "";
}

/** FREE signal only (no API): APN present, land/house keywords in notes/address, pipeline name.
 *  Returns "" when nothing is conclusive, so the caller can decide whether to spend a RentCast call. */
export function freeKindSignal(input: { apn?: string; notes?: string; address?: string; pipeline?: string }): { kind: LeadKind; source: string } {
  const apn = (input.apn ?? "").trim();
  const text = `${input.notes ?? ""} ${input.address ?? ""}`;
  if (LAND_RX.test(text)) return { kind: "land", source: "notes" };
  if (HOUSE_RX.test(text)) return { kind: "home", source: "notes" };
  if (apn) return { kind: "land", source: "apn" }; // a parcel # with no house keywords ≈ land
  if (/\bland\b/i.test(input.pipeline ?? "")) return { kind: "land", source: "pipeline" };
  return { kind: "", source: "" };
}

/** Full detect: free signal first; if inconclusive AND an address is present, ask RentCast (one
 *  cap-counted call). Never throws past the cap — returns {kind:""} so a bulk run can stop cleanly. */
export async function detectLeadKind(
  input: { apn?: string; notes?: string; address?: string; pipeline?: string },
  opts: { useRentcast?: boolean; by?: string } = {},
): Promise<{ kind: LeadKind; source: string }> {
  const free = freeKindSignal(input);
  if (free.kind) return free;
  const addr = (input.address ?? "").trim();
  if (!opts.useRentcast || !addr || !/\d/.test(addr)) return { kind: "", source: "" };
  try {
    const { rentcastConfigured, rentcastPropertyType } = await import("@/lib/rentcast");
    if (!rentcastConfigured()) return { kind: "", source: "" };
    const pt = await rentcastPropertyType(addr, opts.by ?? "kind-detect");
    const kind = rcTypeToKind(pt);
    return kind ? { kind, source: `rentcast:${pt}` } : { kind: "", source: "" };
  } catch {
    // RentCast cap reached or error — leave it unclassified; the bulk caller stops spending.
    return { kind: "", source: "capped" };
  }
}
