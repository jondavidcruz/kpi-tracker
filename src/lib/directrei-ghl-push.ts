// Direct REI → GoHighLevel push (Jon 2026-10-04). The "button" is in Direct REI:
// a rep marks a contact Qualified (or adds the tag `send-to-ghl`). This job
// polls Direct REI, pushes each such contact ONCE to the GHL inbound-webhook
// workflow, and remembers what it pushed so nothing goes twice. Replaces the
// old "every reply → GHL" webhook that flooded GHL with false positives.
//
// Armed only when GHL_PUSH_WEBHOOK_URL is set in Vercel (the leadconnectorhq
// webhook-trigger URL). Unset = no-op, so deploying this is safe.
import { db } from "@/lib/db";
import { directReiConfigured, directReiContacts, directReiCampaigns } from "@/lib/directrei";

export const GHL_PUSH_CAT = "__directrei_ghl_pushed__";
const PUSH_TAG = "send-to-ghl";

type Contact = {
  id: string; name?: string; first_name?: string; last_name?: string; phone?: string; email?: string;
  role?: string; contact_type?: string; status?: string; tags?: string[]; market?: string;
  campaign_id?: string; mailing_address?: string; mailing_city?: string; mailing_state?: string; mailing_zip?: string;
  property_address?: string; notes?: string; last_reply_at?: string | null; added_date?: string;
};

function wants(c: Contact): boolean {
  const tags = (c.tags ?? []).map((t) => String(t).toLowerCase());
  if (tags.includes(PUSH_TAG)) return true;
  if (tags.includes("dnc")) return false;
  return (c.status ?? "").toLowerCase() === "qualified";
}

async function pushedSet(): Promise<{ row: { id: string } | null; ids: Set<string> }> {
  const row = await db.resource.findFirst({ where: { category: GHL_PUSH_CAT } }).catch(() => null);
  let ids = new Set<string>();
  try { if (row) ids = new Set(JSON.parse(row.description) as string[]); } catch { /* fresh */ }
  return { row, ids };
}

async function savePushed(row: { id: string } | null, ids: Set<string>) {
  const description = JSON.stringify([...ids].slice(-5000));
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "directrei-ghl-pushed", category: GHL_PUSH_CAT, url: "", description } });
}

export type GhlPushResult = { armed: boolean; scanned: number; candidates: number; pushed: number; failed: number; names: string[] };

/** Poll + push. Safe to run every 15 min — each contact is pushed once. */
export async function pushQualifiedToGhl(dryRun = false): Promise<GhlPushResult> {
  const url = process.env.GHL_PUSH_WEBHOOK_URL;
  const out: GhlPushResult = { armed: Boolean(url), scanned: 0, candidates: 0, pushed: 0, failed: 0, names: [] };
  if (!url || !directReiConfigured()) return out;

  const campsRes = await directReiCampaigns();
  const campById = new Map((((campsRes.body as { rows?: Array<{ id: string; name: string }> })?.rows) ?? []).map((c) => [c.id, c.name]));
  const { row, ids } = await pushedSet();

  for (let page = 0; page < 25; page++) {
    const res = await directReiContacts({ limit: "200", offset: String(page * 200) });
    if (!res.ok) break;
    const body = res.body as { rows?: Contact[]; has_more?: boolean };
    const rows = body.rows ?? [];
    for (const c of rows) {
      out.scanned++;
      if (!c.id || ids.has(c.id) || !wants(c)) continue;
      out.candidates++;
      const name = c.name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "(no name)";
      const payload = {
        source: "Direct REI", event: "qualified", directrei_id: c.id,
        name, first_name: c.first_name ?? name.split(" ")[0], last_name: c.last_name ?? name.split(" ").slice(1).join(" "),
        phone: c.phone ?? "", email: c.email ?? "",
        lead_type: c.role ?? "", contact_type: c.contact_type ?? "", status: c.status ?? "",
        tags: c.tags ?? [], market: c.market ?? "", campaign: campById.get(String(c.campaign_id ?? "")) ?? "",
        property_address: c.property_address ?? "", mailing_address: [c.mailing_address, c.mailing_city, c.mailing_state, c.mailing_zip].filter(Boolean).join(", "),
        notes: c.notes ?? "", last_reply_at: c.last_reply_at ?? null, added_date: c.added_date ?? null,
        directrei_url: `https://directrei.com/app?contact=${c.id}`,
      };
      if (dryRun) { out.names.push(name); continue; }
      try {
        const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000) });
        if (r.ok) { ids.add(c.id); out.pushed++; out.names.push(name); } else out.failed++;
      } catch { out.failed++; }
    }
    if (!body.has_more || rows.length === 0) break;
  }
  if (!dryRun && out.pushed > 0) await savePushed(row, ids);
  return out;
}
