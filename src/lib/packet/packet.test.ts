// Phase 8 fixture (spec §8.4): the 7 Port Charlotte APNs from the sample packet.
// Hits live FEMA/NWI endpoints + needs REGRID_API_KEY, so it only runs when
// RUN_PACKET_NET=1 — `npm test` stays hermetic. Run with:
//   RUN_PACKET_NET=1 REGRID_API_KEY=... DATABASE_URL=... npx vitest run src/lib/packet
import { describe, it, expect } from "vitest";

const APNS = [
  "402116252014", "402116252015", "402116401007",
  "402116177010", "402116177011", "402116177012", "402116177026",
];

const NET = process.env.RUN_PACKET_NET === "1";

describe.skipIf(!NET)("Port Charlotte packet fixture (live APIs)", () => {
  it("all 7 parcels come back AE with BFE 9, panel 12015C0201G/0202G eff 2022-12-15", async () => {
    const { parcelByApn } = await import("@/lib/geo/parcels");
    const { femaFlood, nwiWetlands, sdaSoils } = await import("./sources");
    const results: Array<{ apn: string; zone: string; bfe: string; panel: string; panelDate: string; wetlandAttrs: string[]; soilTop: string }> = [];
    for (const apn of APNS) {
      const p = await parcelByApn(apn, "FL", "Charlotte");
      expect(p, `Regrid lookup for ${apn}`).toBeTruthy();
      const [flood, wet, soils] = await Promise.all([femaFlood(p!), nwiWetlands(p!), sdaSoils(p!)]);
      results.push({ apn, zone: flood.zone, bfe: flood.bfe, panel: flood.panel, panelDate: flood.panelDate, wetlandAttrs: wet.classes.map((c) => c.attribute), soilTop: soils[0]?.name ?? "" });
    }
    for (const r of results) {
      expect(r.zone, `${r.apn} zone`).toBe("AE");
      expect(r.bfe, `${r.apn} BFE`).toBe("9");
      expect(["12015C0201G", "12015C0202G"], `${r.apn} panel`).toContain(r.panel);
      expect(r.panelDate, `${r.apn} panel date`).toBe("2022-12-15");
    }
    // NWI hits on the two Seward St lots (PSS1/EM1Cd + PEM1Ad per the sample)
    const withWetlands = results.filter((r) => r.wetlandAttrs.length > 0);
    expect(withWetlands.length, "Seward St wetlands lots").toBeGreaterThanOrEqual(2);
    expect(results.flatMap((r) => r.wetlandAttrs).join(","), "wetland classes").toMatch(/PSS1|PEM1/);
    // Soils dominated by Oldsmar sand–Urban land
    expect(results.map((r) => r.soilTop).join("|"), "dominant soil").toMatch(/Oldsmar/i);
  }, 300000);
});

describe("packet template", () => {
  it("renders 🟡 TO BE VERIFIED pills for everything unknown and never crashes on an empty model", async () => {
    const { renderPacketHtml } = await import("./template");
    const html = renderPacketHtml({
      dealId: "d1", title: "Test — Port Charlotte, FL", county: "Charlotte", state: "FL",
      generatedAt: new Date().toISOString(),
      parcels: [{ parcel: { apn: "0000", address: "", county: "Charlotte, FL", state: "FL", acres: null, zoning: "", lat: 0, lng: 0, polygon: null, source: "manual" }, flood: null, wetlands: null, soils: [], elevation: null, satUrl: "", warnings: [] }],
      totals: { parcels: 1, acres: null },
      manual: { utilitiesWater: "", utilitiesSewer: "", electric: "", setbacks: "", species: "", notes: "" },
      countyPhone: "(941) 743-1201", toVerify: ["Water", "Sewer"], sellerSourced: [], highlights: ["Cleared + filled 2023"],
    });
    expect(html).toContain("TO BE VERIFIED");
    expect(html).toContain("Offering Summary");
    expect(html).toContain("(941) 743-1201");
    expect(html).toContain("Cleared + filled 2023"); // highlights render
    expect(html).toContain("Site highlights");
    expect(html).not.toContain("undefined");
  });
});
