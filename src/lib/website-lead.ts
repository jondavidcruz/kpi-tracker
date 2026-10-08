// Website lead intake → War Room CRM. Target of the freedom-offers.com
// "Request a Private Offer" form. Creates (or reuses, by phone) a contact plus a
// native "New Lead" opportunity, and writes an SMS-consent timeline event as proof
// of opt-in state. Additive only — no schema change.
import { db } from "./db";
import { logCrmEvent } from "./crm";
import { CONSENT_VERSION, CONSENT_TEXT } from "./sms-consent";

export type WebsiteLead = {
  name: string;
  phone: string; // +1XXXXXXXXXX
  email: string;
  address: string;
  propertyType: "home" | "land";
  apn: string;
  priceWanted: string;
  motivation: string;
  smsConsent: boolean;
  contactConsent: boolean;
  sourcePage: string;
  ip: string;
  userAgent: string;
};

const clip = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** Validate + normalize raw form input. Honeypot hits return { bot: true }. */
export function parseWebsiteLead(
  raw: Record<string, unknown>,
  meta: { ip: string; userAgent: string; sourcePage: string },
): { ok: true; lead: WebsiteLead } | { ok: false; error: string; bot?: boolean } {
  if (clip(raw.company_website, 200)) return { ok: false, error: "bot", bot: true };

  const first = clip(raw.firstName, 60);
  const lastN = clip(raw.lastName, 60);
  const name = [first, lastN].filter(Boolean).join(" ") || clip(raw.name, 120);
  const digits = clip(raw.phone, 40).replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const email = clip(raw.email, 160);
  const address = clip(raw.address, 250);
  const motivation = clip(raw.motivation, 2000);
  const propertyType = raw.propertyType === "land" ? "land" : "home";
  // Consent is optional by design — the disclosure says it is not required for any service.
  const smsConsent = raw.smsConsent === true || raw.smsConsent === "true" || raw.smsConsent === "on";
  const contactConsent = raw.contactConsent === true || raw.contactConsent === "true" || raw.contactConsent === "on";
  const apn = clip(raw.apn, 60);
  const priceWanted = clip(raw.priceWanted, 40);

  if (!name) return { ok: false, error: "Please enter your name." };
  if (local.length !== 10) return { ok: false, error: "Please enter a valid 10-digit US phone number." };
  if (!address) return { ok: false, error: "Please enter the property address." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };

  return {
    ok: true,
    lead: { name, phone: `+1${local}`, email, address, propertyType, apn, priceWanted, motivation, smsConsent, contactConsent, ...meta },
  };
}

/** Writes contact (deduped by phone), a New Lead opportunity, and the consent record. */
export async function createWebsiteLead(lead: WebsiteLead) {
  // route to acquisitions so it shows on a rep's scoped pipeline immediately
  // (unassigned website leads were invisible to non-managers)
  const acq = await db.user.findFirst({ where: { active: true, position: "acquisitions" }, orderBy: { name: "asc" }, select: { name: true } });
  const owner = acq?.name ?? "";
  const existing = await db.crmContact.findFirst({ where: { phone: lead.phone, archivedAt: null } });
  const contact =
    existing ??
    (await db.crmContact.create({
      data: { name: lead.name, phone: lead.phone, email: lead.email, address: lead.address, source: "Website", tags: "website", assignedTo: owner },
    }));

  const formKey = lead.propertyType === "land" ? "land" : "property";
  const priceNum = Number(lead.priceWanted.replace(/[^\d.]/g, "")) || null;
  const opp = await db.crmOpportunity.create({
    data: {
      contactId: contact.id,
      title: lead.address,
      pipeline: "",
      stage: "new",
      tags: "website",
      assignedTo: existing?.assignedTo || owner,
      askPrice: priceNum,
      formData: { [formKey]: { address: lead.address, motivation: lead.motivation, ...(lead.apn ? { apn: lead.apn } : {}), ...(lead.priceWanted ? { wants: lead.priceWanted } : {}) } },
    },
  });
  await db.crmTask.create({
    data: { oppId: opp.id, contactId: contact.id, title: `🌐 WEBSITE LEAD — call ${lead.name} NOW (they asked for an offer)`, due: new Date().toISOString().slice(0, 10), assignedTo: existing?.assignedTo || owner, createdBy: "website" },
  }).catch(() => {});
  if (lead.smsConsent) sendWelcomeText({ contactId: contact.id, oppId: opp.id, phone: lead.phone, name: lead.name, repName: existing?.assignedTo || owner || "our team" }).catch(() => {});

  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: "Website lead — private offer requested", actor: "website" });
  await logCrmEvent({
    contactId: contact.id,
    oppId: opp.id,
    kind: "system",
    body: `${lead.smsConsent ? "SMS consent GIVEN" : "SMS consent NOT given"} · ${lead.contactConsent ? "contact consent GIVEN" : "contact consent NOT given"}`,
    meta: {
      type: "sms_consent",
      granted: lead.smsConsent,
      contactConsent: lead.contactConsent,
      consentVersion: CONSENT_VERSION,
      consentText: CONSENT_TEXT,
      phone: lead.phone,
      sourcePage: lead.sourcePage,
      ip: lead.ip,
      userAgent: lead.userAgent,
      at: new Date().toISOString(),
    },
    actor: "website",
  });

  return { contactId: contact.id, oppId: opp.id };
}

// 📲 Instant welcome text (Jon 2026-10-08): the moment a lead hits the
// system, they get a save-our-number text promising a call in ≤5 minutes.
// Rotating templates so it never reads canned. Consent-gated.
const WELCOME_TEXTS = [
  (first: string, rep: string) => `Hi ${first}! This is Freedom Offers — we got your property info. Save this number: ${rep} from our team is calling you in the next 5 minutes. Reply STOP to opt out.`,
  (first: string, rep: string) => `${first}, thanks for reaching out to Freedom Offers! Save our number — ${rep} will ring you within 5 minutes to talk through your options. Reply STOP to opt out.`,
  (first: string, rep: string) => `Hey ${first}, Freedom Offers here 👋 Your request is in. Keep this number handy — ${rep} on our team calls you in under 5 minutes. Reply STOP to opt out.`,
  (first: string, rep: string) => `Hi ${first} — Freedom Offers received your property details. ${rep} is calling from this number within 5 minutes, so please pick up! Reply STOP to opt out.`,
];

export async function sendWelcomeText(o: { contactId: string; oppId: string; phone: string; name: string; repName: string }): Promise<void> {
  const from = process.env.TELNYX_SMS_FROM || process.env.TELNYX_CALLER_ID;
  if (!process.env.TELNYX_API_KEY || !from || !o.phone) return;
  const first = o.name.trim().split(/\s+/)[0] || "there";
  const rep = o.repName.trim().split(/\s+/)[0] || "our team";
  const text = WELCOME_TEXTS[Math.floor(Math.random() * WELCOME_TEXTS.length)](first, rep);
  const res = await fetch("https://api.telnyx.com/v2/messages", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.TELNYX_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: o.phone, text }),
  }).catch(() => null);
  await logCrmEvent({ contactId: o.contactId, oppId: o.oppId, kind: "sms", body: `➡️ Us: ${text}${res?.ok ? "" : " (SEND FAILED)"}`, actor: "auto-welcome" }).catch(() => {});
}
