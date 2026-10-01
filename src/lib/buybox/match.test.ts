// Phase 3 gate: the cascade scorer must pass every fixture in the spec pack
// (warroom-vetted-buyers-build/buybox/test-cases.json) against the 60-buyer
// backfill. Geocoding is NOT under test — each case carries its expected
// geocode result, and the deal coordinates are pinned below.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rankBuyers, type BuyerLite, type Deal, type Ranked } from "./match";

type Fixture = {
  name: string;
  input: { address: string; price?: number; acres?: number; assetType?: string };
  expect_geocode: { county?: string; city?: string; state?: string; zip?: string };
  expect_tier1_includes?: string[];
  expect_tier1_or_2_includes?: string[];
  expect_tier2_includes?: string[];
  expect_not_tier1?: string[];
  expect_chips?: Record<string, string[]>;
};

const ROOT = join(__dirname, "../../..");
const CASES: Fixture[] = JSON.parse(readFileSync(join(ROOT, "warroom-vetted-buyers-build/buybox/test-cases.json"), "utf8"));
const BACKFILL: Array<{ buyer_id: string; name: string; buy_box: unknown }> = JSON.parse(
  readFileSync(join(__dirname, "backfill-2026-09-22.json"), "utf8"),
);

const BUYERS: BuyerLite[] = BACKFILL.map((b) => ({ id: b.buyer_id, name: b.name, buyBox: b.buy_box as BuyerLite["buyBox"] }));

// Deal coordinates per fixture address (what the geocoder would return live).
const COORDS: Record<string, [number, number]> = {
  "2118 Old Fort Pkwy, Murfreesboro, TN 37129": [35.8522, -86.4259],
  "1234 SW 20th Ave, Cape Coral, FL 33991": [26.619, -82.011],
  "Crestview, FL": [30.762, -86.57],
  "Celina, TX 75009": [33.3243, -96.7845],
  "4520 Adams Ave, San Diego, CA 92116": [32.7634, -117.1082],
  "Lake Havasu City, AZ 86403": [34.4839, -114.3225],
  "Newport Beach, CA 92660": [33.6293, -117.8689],
  "Columbia, TN 38401": [35.615, -87.0353],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
function find(ranked: Ranked[], name: string): Ranked | undefined {
  return ranked.find((r) => norm(r.buyer.name) === norm(name) || norm(r.buyer.name).includes(norm(name)) || norm(name).includes(norm(r.buyer.name)));
}

function toDeal(f: Fixture): Deal {
  const [lat, lng] = COORDS[f.input.address] ?? [0, 0];
  const g = f.expect_geocode;
  const state = g.state ?? g.county?.split(",")[1]?.trim() ?? g.city?.split(",")[1]?.trim();
  return { lat, lng, county: g.county, city: g.city, state, zip: g.zip, price: f.input.price, acres: f.input.acres, assetType: f.input.assetType };
}

describe("cascade scorer vs spec fixtures", () => {
  for (const f of CASES) {
    describe(f.name, () => {
      const ranked = rankBuyers(toDeal(f), BUYERS);

      for (const name of f.expect_tier1_includes ?? []) {
        it(`tier 1 includes ${name}`, () => {
          const r = find(ranked, name);
          expect(r, `${name} missing from results`).toBeTruthy();
          expect(r!.tier, `${name} geoBasis=${r!.geoBasis} score=${r!.score}`).toBe(1);
        });
      }
      for (const name of f.expect_tier1_or_2_includes ?? []) {
        it(`tier 1–2 includes ${name}`, () => {
          const r = find(ranked, name);
          expect(r, `${name} missing from results`).toBeTruthy();
          expect(r!.tier, `${name} geoBasis=${r!.geoBasis}`).toBeLessThanOrEqual(2);
        });
      }
      for (const name of f.expect_tier2_includes ?? []) {
        it(`tier 2 includes ${name}`, () => {
          const r = find(ranked, name);
          expect(r, `${name} missing from results`).toBeTruthy();
          expect(r!.tier).toBe(2);
        });
      }
      for (const name of f.expect_not_tier1 ?? []) {
        it(`${name} is NOT tier 1`, () => {
          const r = find(ranked, name);
          if (r) expect(r.tier).toBeGreaterThan(1);
        });
      }
      for (const [name, chips] of Object.entries(f.expect_chips ?? {})) {
        for (const chip of chips) {
          it(`${name} shows a chip like "${chip}"`, () => {
            const r = find(ranked, name);
            expect(r, `${name} missing from results`).toBeTruthy();
            // Loose match: same meaning, not same wording — key tokens must appear.
            const key = chip.replace(/[✅⚠️❌🌎📍⚡🧊💵]/g, "").trim().split(/\s+/).slice(0, 2).join(" ");
            const hit = r!.why.some((c) => c.label.toLowerCase().includes(key.toLowerCase()));
            expect(hit, `${name} chips: ${r!.why.map((c) => c.label).join(" | ")} — wanted ~"${chip}"`).toBe(true);
          });
        }
      }
    });
  }
});
