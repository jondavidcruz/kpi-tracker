// Direct REI — the team's other daily CRM/dialer (directrei.com). Their API
// covers contacts / campaigns / deals (NO call-log endpoints — call analytics
// stay a CSV-import job). Key: Direct REI → Settings → API & Zapier →
// + Create API key → paste into Vercel as DIRECTREI_API_KEY.
// Rate limit: 120 req/min/account (429 + Retry-After over it).
const BASE = process.env.DIRECTREI_API_BASE || "https://vrgnjfatqasljgzrhyub.supabase.co/functions/v1/api/v1";

export function directReiConfigured(): boolean {
  return Boolean(process.env.DIRECTREI_API_KEY);
}

type DreiResult = { ok: boolean; status: number; body: unknown };

async function drei(path: string, params?: Record<string, string>): Promise<DreiResult> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${process.env.DIRECTREI_API_KEY}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

/** Key check — /me returns the account name + plan (what Zapier tests call too). */
export async function directReiWhoami() { return drei("/me"); }

export async function directReiContacts(params?: Record<string, string>) { return drei("/contacts", params); }
export async function directReiCampaigns() { return drei("/campaigns"); }

export type CampaignPerf = {
  id: string; name: string; channel: string; paused: boolean;
  contacts?: number; sent?: number; delivered?: number; opened?: number; replied?: number; optedOut?: number; bounced?: number;
};
/** Campaign performance for the dashboard — reads /campaigns and maps whatever stat fields the API
 *  returns (field names vary, so we try several). Numbers are "—" on the page when absent. */
export async function directReiCampaignPerf(): Promise<{ rows: CampaignPerf[] } | { error: string }> {
  const res = await directReiCampaigns();
  if (!res.ok) return { error: `campaigns ${res.status}: ${JSON.stringify(res.body).slice(0, 140)}` };
  const raw = ((res.body as { rows?: Array<Record<string, unknown>> })?.rows) ?? [];
  const n = (o: Record<string, unknown>, ...keys: string[]): number | undefined => {
    for (const k of keys) { const v = o[k]; if (typeof v === "number") return v; if (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) return Number(v); }
    return undefined;
  };
  const rows: CampaignPerf[] = raw.map((c) => ({
    id: String(c.id ?? ""), name: String(c.name ?? "—"), channel: String(c.channel ?? c.channels ?? ""), paused: c.paused === true,
    contacts: n(c, "contacts_count", "contact_count", "contacts", "total_contacts", "recipients"),
    sent: n(c, "sent", "sent_count", "messages_sent"),
    delivered: n(c, "delivered", "delivered_count"),
    opened: n(c, "opened", "opened_count", "opens"),
    replied: n(c, "replied", "replies", "replied_count", "reply_count"),
    optedOut: n(c, "opted_out", "opted_out_count", "opt_outs", "unsubscribed"),
    bounced: n(c, "bounced", "bounced_count", "bounces"),
  }));
  return { rows };
}
export async function directReiDeals(params?: Record<string, string>) { return drei("/deals", params); }
export async function directReiProperty(id: string) { return drei(`/properties/${encodeURIComponent(id)}`); }

// ─────────────────────────────────────────────────────────────────────────────
// ✍️ WRITE side — launch a buyer Deal Blast through DirectREI's own dialer/email/
// SMS automations (Jon 2026-10-22). Built to docs/directrei-integration-spec.md so
// it's plug-and-play when Jon's friend ships those endpoints. OFF until he does:
// needs DIRECTREI_WRITE=1 (so a half-configured key can never fire a blast).
// One-click "arm & launch" per Jon — human reviews the deal, clicks once.

async function dreiPost(path: string, payload: object): Promise<DreiResult> {
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.DIRECTREI_API_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: String(e) };
  }
}

/** Blast is launchable only when the key is present AND writes are explicitly on. */
export function directReiBlastConfigured(): boolean {
  return Boolean(process.env.DIRECTREI_API_KEY) && process.env.DIRECTREI_WRITE === "1";
}

async function dreiDelete(path: string): Promise<DreiResult> {
  try {
    const res = await fetch(BASE + path, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.DIRECTREI_API_KEY}`, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let body: unknown; try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
    return { ok: res.ok, status: res.status, body };
  } catch (e) { return { ok: false, status: 0, body: String(e) }; }
}

/** 🧹 Delete one contact — gated behind DIRECTREI_WRITE=1 so a weekly cleanup can't fire unarmed.
 *  Returns {ok} or an error. If DirectREI's API has no delete endpoint, this surfaces the 404 and
 *  the caller falls back to the exported CSV (bulk-delete in the DirectREI UI). */
export async function directReiDeleteContact(id: string): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!directReiBlastConfigured()) return { ok: false, status: 0, error: "DirectREI write API not enabled (set DIRECTREI_WRITE=1)" };
  if (!id) return { ok: false, status: 0, error: "no id" };
  const r = await dreiDelete(`/contacts/${encodeURIComponent(id)}`);
  return { ok: r.ok, status: r.status, ...(r.ok ? {} : { error: `delete ${r.status}: ${JSON.stringify(r.body).slice(0, 120)}` }) };
}

export type BlastContact = { name: string; phone?: string; email?: string; external_id: string };
export type BlastChannel = "sms" | "email" | "cold_call";

/** Add contacts to an EXISTING campaign matched by name (e.g. "unvetted buyers") — for the
 *  nightly developer push (Jon 2026-10-29). Best-effort; gated behind DIRECTREI_WRITE=1 so it
 *  can never auto-enroll people into live outreach until Jon arms it. Creates the campaign if
 *  `createIfMissing` and it isn't found. */
export async function directReiAddToCampaignByName(o: {
  name: RegExp | string; contacts: BlastContact[]; channels?: BlastChannel[]; createIfMissing?: boolean;
}): Promise<{ campaignId?: string; added?: number; created?: boolean; error?: string }> {
  if (!directReiBlastConfigured()) return { error: "DirectREI write API not enabled (set DIRECTREI_WRITE=1)" };
  if (!o.contacts.length) return { error: "no contacts to add" };
  const list = await directReiCampaigns();
  if (!list.ok) return { error: `campaigns ${list.status}: ${JSON.stringify(list.body).slice(0, 140)}` };
  const rows = ((list.body as { rows?: Array<{ id: string; name: string }> })?.rows) ?? [];
  const rx = typeof o.name === "string" ? new RegExp(o.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : o.name;
  let campaignId = rows.find((c) => rx.test(c.name || ""))?.id;
  let created = false;
  if (!campaignId) {
    if (!o.createIfMissing) return { error: `no campaign matching ${rx}` };
    const label = typeof o.name === "string" ? o.name : "Unvetted Buyers";
    const create = await dreiPost(`/campaigns`, { name: label.slice(0, 120), channels: o.channels ?? ["email", "sms", "cold_call"], source: "war-room", launch: false });
    if (!create.ok) return { error: `create ${create.status}: ${JSON.stringify(create.body).slice(0, 140)}` };
    campaignId = (create.body as { id?: string }).id;
    created = true;
    if (!campaignId) return { error: "create returned no campaign id" };
  }
  const add = await dreiPost(`/campaigns/${encodeURIComponent(campaignId)}/contacts`, { contacts: o.contacts.slice(0, 1000) });
  if (!add.ok) return { campaignId, created, error: `add-contacts ${add.status}: ${JSON.stringify(add.body).slice(0, 140)}` };
  const added = (add.body as { added?: number }).added ?? o.contacts.length;
  return { campaignId, created, added };
}

/** Create → add contacts → launch, in one call. Returns the campaign id + queued
 *  count, or an error string (never throws). Matches the 4-endpoint spec. */
export async function directReiLaunchBlast(o: {
  name: string;
  channels: BlastChannel[];
  message: { sms?: string; email_subject?: string; email_body?: string };
  contacts: BlastContact[];
}): Promise<{ campaignId?: string; queued?: number; added?: number; error?: string }> {
  if (!directReiBlastConfigured()) return { error: "DirectREI write API not enabled (set DIRECTREI_WRITE=1 once the endpoints are live)" };
  if (!o.contacts.length) return { error: "no buyer contacts to blast" };
  // 🕶 Strip the owner's name + company from the copy before it ever sends (Jon 2026-10-29).
  const { scrubMessage } = await import("@/lib/scrub-identity");
  const message = scrubMessage(o.message);
  // 1) create (draft — we launch explicitly in step 3 so a contact-add failure
  //    can't leave a half-empty campaign already sending)
  const create = await dreiPost(`/campaigns`, { name: o.name.slice(0, 120), channels: o.channels, source: "war-room", message, launch: false });
  if (!create.ok) return { error: `create ${create.status}: ${JSON.stringify(create.body).slice(0, 140)}` };
  const campaignId = (create.body as { id?: string }).id;
  if (!campaignId) return { error: "create returned no campaign id" };
  // 2) add contacts
  const add = await dreiPost(`/campaigns/${encodeURIComponent(campaignId)}/contacts`, { contacts: o.contacts.slice(0, 1000) });
  if (!add.ok) return { campaignId, error: `add-contacts ${add.status}: ${JSON.stringify(add.body).slice(0, 140)}` };
  const added = (add.body as { added?: number }).added ?? o.contacts.length;
  // 3) launch
  const launch = await dreiPost(`/campaigns/${encodeURIComponent(campaignId)}/launch`, {});
  if (!launch.ok) return { campaignId, added, error: `launch ${launch.status}: ${JSON.stringify(launch.body).slice(0, 140)}` };
  const queued = (launch.body as { queued?: number }).queued ?? added;
  return { campaignId, added, queued };
}
