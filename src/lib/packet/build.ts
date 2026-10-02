// Phase 8 pipeline: APNs in → ~60s → draft offering-packet PDF, versioned,
// never overwritten. Every lookup is Promise.allSettled — a failed source
// becomes a 🟡 TO BE VERIFIED item, never a crash. PDF via @sparticuz/chromium
// (Vercel-safe); if Chromium can't launch (or times out) the HTML version is
// still stored and printable from the browser.
import { db } from "@/lib/db";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";
import { parcelByApn } from "@/lib/geo/parcels";
import { femaFlood, nwiWetlands, sdaSoils, elevation, satelliteUrl } from "./sources";
import { renderPacketHtml } from "./template";
import type { PacketModel, ParcelDiligence, ParcelInfo } from "./types";

// County front desks for the 🟡 checklist (seed the markets we work; grow as needed).
const COUNTY_PHONES: Record<string, string> = {
  "Charlotte, FL": "(941) 743-1201",
  "Lee, FL": "(239) 533-8585",
  "Okaloosa, FL": "(850) 651-7180",
  "Rutherford, TN": "(615) 898-7730",
  "Collin, TX": "(972) 548-4100",
  "Mohave, AZ": "(928) 757-0903",
  "San Diego, CA": "(858) 565-5920",
};

export type BuildInput = {
  dealId: string;
  apns: string[];
  state: string; // "FL"
  county: string; // "Charlotte"
  manual?: Partial<PacketModel["manual"]>;
  generatedBy?: string;
};

export type BuildResult = {
  ok: boolean;
  error?: string;
  packetId?: string;
  version?: number;
  url?: string;
  htmlUrl?: string;
  warnings?: string[];
  changed?: string[]; // diff vs previous version
};

async function diligenceFor(p: ParcelInfo): Promise<ParcelDiligence> {
  const warnings: string[] = [];
  const [flood, wet, soils, elev] = await Promise.allSettled([femaFlood(p), nwiWetlands(p), sdaSoils(p), elevation(p)]);
  if (flood.status === "rejected") warnings.push(`FEMA lookup failed (${String(flood.reason).slice(0, 60)})`);
  if (wet.status === "rejected") warnings.push(`NWI wetlands lookup failed`);
  if (soils.status === "rejected") warnings.push(`USDA soils lookup failed`);
  const satUrl = satelliteUrl(p);
  if (!satUrl) warnings.push("No GOOGLE_MAPS_API_KEY — aerial images missing");
  return {
    parcel: p,
    flood: flood.status === "fulfilled" ? flood.value : null,
    wetlands: wet.status === "fulfilled" ? wet.value : null,
    soils: soils.status === "fulfilled" ? soils.value : [],
    elevation: elev.status === "fulfilled" ? elev.value : null,
    satUrl,
    warnings,
  };
}

export async function buildPacketModel(input: BuildInput): Promise<{ model: PacketModel; warnings: string[] }> {
  const warnings: string[] = [];
  const parcels: ParcelDiligence[] = [];
  for (const apn of input.apns.slice(0, 15)) {
    const info = await parcelByApn(apn.trim(), input.state, input.county).catch((e) => { warnings.push(`Regrid ${apn}: ${String(e).slice(0, 80)}`); return null; });
    if (!info) {
      if (!process.env.REGRID_API_KEY) warnings.push("REGRID_API_KEY not set — parcel geometry/acreage/zoning unavailable");
      else warnings.push(`APN ${apn} not found in ${input.county} County ${input.state}`);
      parcels.push({
        parcel: { apn: apn.trim(), address: "", county: `${input.county}, ${input.state}`, state: input.state, acres: null, zoning: "", lat: 0, lng: 0, polygon: null, source: "manual" },
        flood: null, wetlands: null, soils: [], elevation: null, satUrl: "", warnings: ["parcel lookup failed — all diligence 🟡"],
      });
      continue;
    }
    parcels.push(await diligenceFor(info));
  }
  const acresKnown = parcels.map((p) => p.parcel.acres).filter((a): a is number => a != null);
  const countyKey = `${input.county}, ${input.state}`;
  const deal = await db.deal.findUnique({ where: { id: input.dealId }, select: { address: true } });
  const model: PacketModel = {
    dealId: input.dealId,
    title: deal?.address || `${parcels.length} Parcel${parcels.length === 1 ? "" : "s"} — ${countyKey}`,
    county: input.county,
    state: input.state,
    generatedAt: new Date().toISOString(),
    parcels,
    totals: { parcels: parcels.length, acres: acresKnown.length ? Math.round(acresKnown.reduce((a, b) => a + b, 0) * 100) / 100 : null },
    manual: {
      utilitiesWater: input.manual?.utilitiesWater ?? "", utilitiesSewer: input.manual?.utilitiesSewer ?? "",
      electric: input.manual?.electric ?? "", setbacks: input.manual?.setbacks ?? "",
      species: input.manual?.species ?? "", notes: input.manual?.notes ?? "",
    },
    countyPhone: COUNTY_PHONES[countyKey] ?? "",
    toVerify: [],
  };
  const man = model.manual;
  model.toVerify = [
    ...(!man.utilitiesWater ? ["Water"] : []), ...(!man.utilitiesSewer ? ["Sewer"] : []),
    ...(!man.electric ? ["Electric"] : []), ...(!man.setbacks ? ["Setbacks"] : []),
    ...(!man.species && input.state === "FL" ? ["Scrub-jay / species"] : []),
  ];
  return { model, warnings: [...warnings, ...parcels.flatMap((p) => p.warnings)] };
}

async function htmlToPdf(html: string): Promise<Buffer | null> {
  try {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    const executablePath = process.env.VERCEL ? await chromium.executablePath() : (process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    const browser = await puppeteer.launch({
      args: process.env.VERCEL ? chromium.args : [],
      executablePath,
      headless: true,
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 35000 });
      await new Promise((r) => setTimeout(r, 4000)); // let the FEMA/NWI/static-map images finish
      const pdf = await page.pdf({ format: "letter", printBackground: true, timeout: 30000 });
      return Buffer.from(pdf);
    } finally { await browser.close(); }
  } catch {
    return null; // HTML fallback still stored
  }
}

/** The whole thing: model → HTML (+PDF when Chromium cooperates) → storage → DealPacket row. */
export async function generatePacket(input: BuildInput): Promise<BuildResult> {
  if (!input.apns.length) return { ok: false, error: "enter at least one APN" };
  const { model, warnings } = await buildPacketModel(input);
  const html = renderPacketHtml(model);

  const prev = await db.dealPacket.findFirst({ where: { dealId: input.dealId }, orderBy: { version: "desc" } });
  const version = (prev?.version ?? 0) + 1;

  let url = "", htmlUrl = "";
  if (adminConfigured()) {
    try {
      const admin = createAdminClient();
      await admin.storage.createBucket("packets", { public: false }).catch(() => {});
      const stamp = new Date().toISOString().slice(0, 10);
      const base = `${input.dealId}/${stamp}-v${version}`;
      const h = await admin.storage.from("packets").upload(`${base}.html`, Buffer.from(html), { contentType: "text/html", upsert: false });
      if (!h.error) {
        const signed = await admin.storage.from("packets").createSignedUrl(`${base}.html`, 60 * 60 * 24 * 30);
        htmlUrl = signed.data?.signedUrl ?? "";
      }
      const pdf = await htmlToPdf(html);
      if (pdf) {
        const u = await admin.storage.from("packets").upload(`${base}.pdf`, pdf, { contentType: "application/pdf", upsert: false });
        if (!u.error) {
          const signed = await admin.storage.from("packets").createSignedUrl(`${base}.pdf`, 60 * 60 * 24 * 30);
          url = signed.data?.signedUrl ?? "";
        }
      } else warnings.push("PDF engine unavailable here — open the HTML version and print to PDF");
    } catch (e) { warnings.push(`Storage: ${String(e).slice(0, 100)}`); }
  } else warnings.push("Supabase service key not configured — packet not stored, HTML returned only");

  const row = await db.dealPacket.create({
    data: { dealId: input.dealId, version, url, htmlUrl, model: model as never, generatedBy: input.generatedBy ?? "" },
  });

  // Diff vs previous version: which top-level facts changed
  const changed: string[] = [];
  if (prev) {
    const a = prev.model as unknown as PacketModel, b = model;
    if (a.totals.acres !== b.totals.acres) changed.push(`acres ${a.totals.acres ?? "?"} → ${b.totals.acres ?? "?"}`);
    const az = a.parcels.map((p) => p.flood?.zone).join(","), bz = b.parcels.map((p) => p.flood?.zone).join(",");
    if (az !== bz) changed.push(`flood zones ${az || "?"} → ${bz || "?"}`);
    const aw = a.parcels.map((p) => p.wetlands?.pctOfParcel).join(","), bw = b.parcels.map((p) => p.wetlands?.pctOfParcel).join(",");
    if (aw !== bw) changed.push("wetlands coverage changed");
    for (const k of ["utilitiesWater", "utilitiesSewer", "electric", "setbacks", "species"] as const) {
      if ((a.manual?.[k] ?? "") !== b.manual[k]) changed.push(`${k} updated`);
    }
  }
  return { ok: true, packetId: row.id, version, url, htmlUrl, warnings, changed };
}
