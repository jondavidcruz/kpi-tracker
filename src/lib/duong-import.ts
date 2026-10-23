// 🔥 Jon Duong / Upland Capital buyer list — researched builders/investors buying land
// in Golden Gate Estates (Naples / Collier County FL). Jon's top targets to snag, so
// they land in the DS: Developers "🔥 Hot" stage (Jon 2026-10-22). Checks what's
// already in the system first; dry-run then execute. Server-only.
import { db } from "@/lib/db";

export type DuongBuyer = { entity: string; deals: number; dates: string; lots: string; principals: string; address: string; sunbiz: string; type: string; priority: string };

// From Duong_Upland_Capital_Buyers_Naples_2026-10-16.xlsx (Jon provided 2026-10-22).
export const DUONG_BUYERS: DuongBuyer[] = [
  { entity: "SYNERGY INVEST LLC", deals: 3, dates: "9/30/24, 3/5/25, 6/20/25", lots: "GGE U40 T63; U64 T58; U77 T100", principals: "Marcilio Teixeira de Carvalho Pereira (AMBR); Mauricio Teixeira de Carvalho Pereira (AMBR)", address: "6659 Glen Arbor Way, Naples FL 34119", sunbiz: "L17000140592", type: "Investor/Builder", priority: "REPEAT x3" },
  { entity: "PALS BUILDERS LLC", deals: 2, dates: "4/8/25, 1/6/26", lots: "GGE U62 T23; U47 T8", principals: "Lazaro Oliva (President/RA); Sabrina Martin (President)", address: "946 Desoto Blvd N, Naples FL 34120", sunbiz: "L23000278978", type: "Builder", priority: "REPEAT x2" },
  { entity: "CONSTRUCTION 2018 CORP", deals: 2, dates: "10/29/24, 2/19/25", lots: "GGE U64 T43; U43 T153", principals: "Israel Garcia (P); Adiel Garcia (COO/RA)", address: "1300 NW 23rd Ct, Miami FL 33125", sunbiz: "P18000060545", type: "Builder", priority: "REPEAT x2" },
  { entity: "IPERMITTING SERVICES CORP", deals: 1, dates: "9/1/26", lots: "GGE U83 T123 W75'", principals: "Yoalys Martin (P/RA)", address: "2680 16th Ave NE, Naples FL 34120", sunbiz: "P19000053199", type: "Builder/Permitting", priority: "" },
  { entity: "THE MUNGUIA GROUP LLC", deals: 1, dates: "6/30/26", lots: "GGE U86 T44 W180'", principals: "Miguel Munguia (MGR); Annia Zambrano (MGR/RA)", address: "865 Everglades Blvd S, Naples FL 34117", sunbiz: "L22000085981", type: "Builder", priority: "" },
  { entity: "PHL CAPITAL INC", deals: 1, dates: "11/19/25", lots: "GGE U62 T85", principals: "Pedro Hernandez (P/RA)", address: "1241 19th St SW, Naples FL 34117", sunbiz: "P18000044818", type: "Investor/Builder", priority: "" },
  { entity: "IRL CONSTRUCTION INC", deals: 1, dates: "10/23/25", lots: "GGE U43 T153 W75'", principals: "Rudy L Blanco (PD/RA)", address: "2610 W 76 St Apt 201, Hialeah FL 33016", sunbiz: "P17000020300", type: "Builder", priority: "" },
  { entity: "JC & MIL CONSULTING LLC", deals: 1, dates: "3/25/25", lots: "GGE U82 T129", principals: "Juan C Hernandez (MGR/RA); Milin T Hernandez (MGR)", address: "5350 SW 144 Ave, Miami FL 33175", sunbiz: "L23000096866", type: "Investor", priority: "" },
  { entity: "HERROD CONSTRUCTION LLC", deals: 1, dates: "7/11/24", lots: "GGE U81 T16 W150'", principals: "Fernando Rodriguez (MGR/RA)", address: "661 Golden Gate Blvd W, Naples FL 34120", sunbiz: "L19000122527", type: "Builder", priority: "" },
  { entity: "HM SUNSHINE LLC", deals: 1, dates: "6/27/24", lots: "GGE U64 T98", principals: "Alana Medina (MGR/RA)", address: "16403 Barclay Ct, Naples FL 34110", sunbiz: "L24000159749", type: "Investor", priority: "" },
  { entity: "ABOVE HOMES CORPORATION", deals: 1, dates: "5/21/24", lots: "GGE U61 T46", principals: "Rafael Sandini Furlan (PSTD/RA); Valeria Stadler (VP/D)", address: "6836 Il Regalo Circle, Naples FL 34109", sunbiz: "P22000083457", type: "Builder", priority: "" },
  { entity: "Y&C DEVELOPMENT HOMES LLC", deals: 1, dates: "12/13/23", lots: "GGE U81 T17 E150'", principals: "Carlos A Nunez (MGR); Yoelvy Romero (MGR/RA)", address: "5270 Golden Gate Pkwy #116, Naples FL 34116", sunbiz: "L23000334584", type: "Builder", priority: "" },
  { entity: "COMO VENTURES LLC", deals: 1, dates: "10/30/23", lots: "GGE U85 T73", principals: "Mary M McDonnell (MGRM); RA Alan Hamisch Esq", address: "501 Goodlette Rd N A-210, Naples FL 34102", sunbiz: "L12000086773", type: "Investor (out-of-state)", priority: "" },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\b(llc|inc|corp|corporation|co|ltd|company|group|homes|builders|construction|capital|invest|investments|ventures|development|consulting|services)\b/g, "").replace(/\s+/g, " ").trim();
const firstPrincipal = (p: string) => p.split(";")[0].replace(/\s*\([^)]*\)\s*/g, "").trim();

export type DuongPlan = {
  total: number; alreadyHave: { entity: string; where: string }[]; toCreate: string[];
  executed: boolean; created: number; note: string;
};

export async function importDuong(execute: boolean): Promise<DuongPlan> {
  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const devPipe = net.dev[0] || "DS: Developers";

  const [devOpps, mcs] = await Promise.all([
    db.crmOpportunity.findMany({ where: { archivedAt: null, pipeline: { in: net.all.length ? net.all : [devPipe] } }, select: { contact: { select: { name: true } } } }).catch(() => []),
    db.marketContact.findMany({ where: { archivedAt: null }, select: { name: true } }).catch(() => []),
  ]);
  const existing = new Map<string, string>();
  for (const o of devOpps) if (o.contact?.name) existing.set(norm(o.contact.name), "kanban");
  for (const m of mcs) if (m.name) { const k = norm(m.name); if (!existing.has(k)) existing.set(k, "Buyer Research"); }

  const plan: DuongPlan = { total: DUONG_BUYERS.length, alreadyHave: [], toCreate: [], executed: execute, created: 0, note: "" };

  for (const b of DUONG_BUYERS) {
    const key = norm(b.entity);
    const where = key ? existing.get(key) : undefined;
    if (where) { plan.alreadyHave.push({ entity: b.entity, where }); continue; }
    plan.toCreate.push(b.entity);
    if (execute) {
      const contact = await db.crmContact.create({ data: { name: b.entity, phone: "", email: "", address: b.address, source: "Jon Duong / Upland Capital list" } });
      const box = {
        buyCounties: "Collier County, FL (Golden Gate Estates)",
        landTypes: "GGE residential lots",
        decisionMaker: firstPrincipal(b.principals),
        volume: `${b.deals} from Upland`,
        requirements: `${b.type}. Bought ${b.lots} (${b.dates}). ${b.priority ? b.priority + ". " : ""}Sunbiz ${b.sunbiz}.`,
        proofOfFunds: "Proven cash buyer (bought land from Upland)",
      };
      await db.crmOpportunity.create({ data: {
        title: b.entity, pipeline: devPipe, stage: "hot", contactId: contact.id, assignedTo: "",
        formData: { dev_buybox: box, __duongList: true, __import: { market: "Naples / Golden Gate Estates, FL", buyBox: box.requirements } } as never,
      } });
      await db.crmEvent.create({ data: { contactId: contact.id, kind: "note", body: `🔥 Jon Duong list — ${b.deals} lot${b.deals > 1 ? "s" : ""} bought from Upland Capital in Golden Gate Estates${b.priority ? ` (${b.priority})` : ""}. Principals: ${b.principals}. Address: ${b.address}. Lots: ${b.lots}. Sunbiz ${b.sunbiz}. ⟶ find their phone + reach out to buy their next lot.`, actor: "duong-import" } }).catch(() => {});
      existing.set(key, "kanban");
      plan.created++;
    }
  }
  plan.note = execute
    ? `Added ${plan.created} Duong buyers to the 🔥 Hot stage. ${plan.alreadyHave.length} were already in the system.`
    : `DRY RUN — ${plan.toCreate.length} would be added to 🔥 Hot, ${plan.alreadyHave.length} already in the system. Add ?mode=go to import. (Run /api/admin/add-dev-hot-stage first so the Hot column exists.)`;
  return plan;
}
