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
  motivation: string;
  smsConsent: boolean;
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

  const name = clip(raw.name, 120);
  const digits = clip(raw.phone, 40).replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  const email = clip(raw.email, 160);
  const address = clip(raw.address, 250);
  const motivation = clip(raw.motivation, 2000);
  const propertyType = raw.propertyType === "land" ? "land" : "home";
  // Consent is optional by design — the disclosure says it is not required for any service.
  const smsConsent = raw.smsConsent === true || raw.smsConsent === "true" || raw.smsConsent === "on";

  if (!name) return { ok: false, error: "Please enter your name." };
  if (local.length !== 10) return { ok: false, error: "Please enter a valid 10-digit US phone number." };
  if (!address) return { ok: false, error: "Please enter the property address." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Please enter a valid email address." };

  return {
    ok: true,
    lead: { name, phone: `+1${local}`, email, address, propertyType, motivation, smsConsent, ...meta },
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
  const opp = await db.crmOpportunity.create({
    data: {
      contactId: contact.id,
      title: lead.address,
      pipeline: "",
      stage: "new",
      tags: "website",
      assignedTo: existing?.assignedTo || owner,
      formData: { [formKey]: { address: lead.address, motivation: lead.motivation } },
    },
  });
  await db.crmTask.create({
    data: { oppId: opp.id, contactId: contact.id, title: `🌐 WEBSITE LEAD — call ${lead.name} NOW (they asked for an offer)`, due: new Date().toISOString().slice(0, 10), assignedTo: existing?.assignedTo || owner, createdBy: "website" },
  }).catch(() => {});

  await logCrmEvent({ contactId: contact.id, oppId: opp.id, kind: "system", body: "Website lead — private offer requested", actor: "website" });
  await logCrmEvent({
    contactId: contact.id,
    oppId: opp.id,
    kind: "system",
    body: lead.smsConsent ? "SMS consent GIVEN (box checked)" : "SMS consent NOT given (box unchecked)",
    meta: {
      type: "sms_consent",
      granted: lead.smsConsent,
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
