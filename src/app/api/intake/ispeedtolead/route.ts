import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logCrmEvent } from "@/lib/crm";

export const dynamic = "force-dynamic";

// 🛒 iSpeedToLead purchase intake — target of the Zapier zap (trigger: new
// lead purchased → POST here with ?secret=CRON_SECRET). Recreates the GHL
// import format Jon showed: source "iSpeedToLead $<price>", full lead-detail
// block as the first note, assigned to acquisitions (Michelle).
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let raw: Record<string, unknown> = {};
  try {
    const ct = req.headers.get("content-type") ?? "";
    raw = ct.includes("application/json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch { return NextResponse.json({ ok: false, error: "bad body" }, { status: 400 }); }

  const S = (k: string) => String(raw[k] ?? "").trim();
  const name = [S("first_name") || S("firstName"), S("last_name") || S("lastName")].filter(Boolean).join(" ") || S("name") || "iSpeedToLead lead";
  const digits = (S("phone") || S("smart_number") || S("phones")).replace(/\D/g, "");
  const phone = digits.length >= 10 ? `+1${digits.slice(-10)}` : "";
  const email = S("email") || S("emails");
  const addr = [S("address"), S("city"), S("state"), S("zip") || S("postal_code")].filter(Boolean).join(", ");
  const price = S("price") || S("lead_price") || S("leadPrice");
  const acq = await db.user.findFirst({ where: { active: true, position: "acquisitions" }, orderBy: { name: "asc" }, select: { name: true } });
  const owner = acq?.name ?? "";

  const existing = phone ? await db.crmContact.findFirst({ where: { phone, archivedAt: null } }) : null;
  const contact = existing ?? (await db.crmContact.create({ data: {
    name, phone, email, address: addr, source: `iSpeedToLead${price ? ` $${price}` : ""}`, tags: "ispeedtolead", assignedTo: owner,
  } }));

  const opp = await db.crmOpportunity.create({ data: {
    contactId: contact.id, title: addr || name, pipeline: "", stage: "new",
    tags: "ispeedtolead", assignedTo: existing?.assignedTo || owner,
    formData: { property: { address: addr } },
  } });

  // the GHL-style detail block: every field they sent, one per line
  const SKIP = new Set(["secret"]);
  const lines = Object.entries(raw)
    .filter(([k, v]) => !SKIP.has(k) && v != null && String(v).trim() !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v).slice(0, 300)}`)
    .slice(0, 60);
  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "note", body: `🛒 iSpeedToLead lead purchased${price ? ` ($${price})` : ""} — full details:\n${lines.join("\n")}`.slice(0, 5000), actor: "ispeedtolead" });
  await db.crmTask.create({ data: { oppId: opp.id, contactId: contact.id, title: `🛒 NEW PURCHASED LEAD — call ${name} NOW (iSpeedToLead${price ? ` $${price}` : ""})`, due: new Date().toISOString().slice(0, 10), assignedTo: existing?.assignedTo || owner, createdBy: "ispeedtolead" } }).catch(() => {});
  return NextResponse.json({ ok: true, oppId: opp.id });
}
