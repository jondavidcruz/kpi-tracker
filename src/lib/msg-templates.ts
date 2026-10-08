import { db } from "@/lib/db";

// 💬 Editable message automations (Jon 2026-10-08: "I want to edit what's
// being sent out") — every auto-SMS/email the system sends lives here, with
// owner-editable overrides in Resource __msg_templates__. Tokens:
//   {first} = lead's first name · {rep} = rep's first name · {address} = property
export type MsgTemplateKey = "missed_call_sms" | "welcome_sms" | "welcome_email_subject" | "welcome_email_body";

export const MSG_TEMPLATE_META: Array<{ key: MsgTemplateKey; kind: "sms" | "email"; label: string; fires: string }> = [
  { key: "welcome_sms", kind: "sms", label: "New-lead welcome text", fires: "The moment a seller lead hits the system (website form, iSpeedToLead, or added by a rep) — consent-gated on website leads" },
  { key: "missed_call_sms", kind: "sms", label: "Missed-call text-back", fires: "When someone calls a War Room number and we don't answer" },
  { key: "welcome_email_subject", kind: "email", label: "New-lead welcome email — subject", fires: "Same moment as the welcome text, when the lead gave an email" },
  { key: "welcome_email_body", kind: "email", label: "New-lead welcome email — body", fires: "HTML allowed; keep it short and personal" },
];

export const MSG_DEFAULTS: Record<MsgTemplateKey, string> = {
  welcome_sms: "Hi {first}, it's Freedom Offers — we got your request about your property. Save this number: {rep} from our team is calling you in the next 5 minutes. Reply STOP to opt out.",
  missed_call_sms: "Hi {first}, this is Freedom Offers — sorry we missed your call! We'll ring you right back. If it's about your property, reply here and we're on it.",
  welcome_email_subject: "We got your request — your private offer is in motion",
  welcome_email_body: "<p>Hi {first},</p><p>Thanks for reaching out to <b>Freedom Offers</b> about <b>{address}</b>. We received your request and {rep} from our team will call you within the next few minutes from our number — please save it when the call comes in.</p><p>We'll prepare your private offer within 24 hours. No listings, no showings, no fees — and if you ever prefer email, just reply here.</p><p>— The Freedom Offers Team<br/>freedom-offers.com</p>",
};

const CAT = "__msg_templates__";

export async function readMsgTemplates(): Promise<Record<MsgTemplateKey, string>> {
  const out = { ...MSG_DEFAULTS };
  try {
    const row = await db.resource.findFirst({ where: { category: CAT } });
    if (row?.description) {
      const stored = JSON.parse(row.description) as Partial<Record<MsgTemplateKey, string>>;
      for (const k of Object.keys(out) as MsgTemplateKey[]) if (stored[k]?.trim()) out[k] = stored[k]!;
    }
  } catch { /* defaults */ }
  return out;
}

export async function saveMsgTemplates(patch: Partial<Record<MsgTemplateKey, string>>): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let cur: Partial<Record<MsgTemplateKey, string>> = {};
  try { cur = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  const next = JSON.stringify({ ...cur, ...patch });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: next } });
  else await db.resource.create({ data: { title: "message-templates", category: CAT, url: "", description: next } });
}

export function fillTokens(tpl: string, t: { first?: string; rep?: string; address?: string }): string {
  return tpl
    .replaceAll("{first}", t.first || "there")
    .replaceAll("{rep}", t.rep || "our team")
    .replaceAll("{address}", t.address || "your property");
}
