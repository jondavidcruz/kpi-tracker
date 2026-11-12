// Per-agent comms permissions (Jon 2026-10-07: some agents get the PAID
// channels — calling / SMS / email — others get only the free features like
// notes & tasks). Stored in Resource __crm_comms__ as {firstNameLower:
// {call,sms,email}}; anyone unlisted gets NOTHING paid (safe default), and
// managers/C-suite always have everything.
import { db } from "./db";
import { isManager } from "./auth";
import type { User } from "@prisma/client";

const CAT = "__crm_comms__";
// `iphone` (Jon 2026-11-10) = may use the owner-style "Send from my iPhone" hand-off (opens Messages
// on their own iPhone; logs a blue bubble). Independent of `sms` (the paid Telnyx send), so a rep can
// be iPhone-text-only: iphone:true + sms:false. Opt-in for everyone; Jon always has it.
export type CommsPerm = { call: boolean; sms: boolean; email: boolean; iphone?: boolean };
export type CommsMap = Record<string, CommsPerm>;

export async function readCommsMap(): Promise<CommsMap> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}

export async function writeCommsMap(map: CommsMap): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "crm-comms", category: CAT, url: "", description } });
}

export function firstOf(name: string): string {
  return name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

export async function commsFor(user: User | null): Promise<CommsPerm> {
  if (!user) return { call: false, sms: false, email: false };
  const first = firstOf(user.name);
  // Jon himself can never be locked out (by NAME — several teammates also
  // carry the admin role, and Jon manages their rows on /crm/access)
  if (first === "jon" || first === "jonathan") return { call: true, sms: true, email: true, iphone: true };
  const map = await readCommsMap();
  const rec = map[first];
  // an explicit saved row wins for ANYONE; managers/admins default to full (but iPhone hand-off is
  // opt-in — never auto-granted, even to managers).
  if (rec) return { call: rec.call, sms: rec.sms, email: rec.email, iphone: rec.iphone ?? false };
  return isManager(user) || user.role === "admin" ? { call: true, sms: true, email: true, iphone: false } : { call: false, sms: false, email: false, iphone: false };
}

// ── Per-agent email signatures (GHL-style "From" identity) ─────────────────
const SIG_CAT = "__crm_signatures__";
export type SigMap = Record<string, string>; // firstNameLower → plain-text signature

export async function readSignatures(): Promise<SigMap> {
  const row = await db.resource.findFirst({ where: { category: SIG_CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}
export async function writeSignatures(map: SigMap): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: SIG_CAT } });
  const description = JSON.stringify(map);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "crm-signatures", category: SIG_CAT, url: "", description } });
}
export function defaultSignature(name: string): string {
  // ⚠️ Owner-anonymity: first name ONLY — never the company name, website, or the toll-free number
  // (Jon 2026-11-12: no company info in any outbound seller message). Scrubbed again at send time.
  return (name || "").trim().split(/\s+/)[0] || "";
}

// 🖼 Per-rep email signature IMAGE (Jon 2026-10-21) — upload your real Gmail
// signature image and it's embedded at the bottom of every email you send.
// Stored one Resource row per rep (base64 in description, mime in url) so a big
// image never bloats the shared signatures row.
const SIG_IMG_CAT = "__crm_sig_image__";
export async function readSignatureImage(firstLower: string): Promise<{ data: string; type: string } | null> {
  const row = await db.resource.findFirst({ where: { category: SIG_IMG_CAT, title: firstLower } }).catch(() => null);
  if (!row?.description) return null;
  return { data: row.description, type: row.url || "image/png" };
}
export async function writeSignatureImage(firstLower: string, dataB64: string, type: string): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: SIG_IMG_CAT, title: firstLower } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: dataB64, url: type } });
  else await db.resource.create({ data: { title: firstLower, category: SIG_IMG_CAT, url: type, description: dataB64 } });
}
export async function deleteSignatureImage(firstLower: string): Promise<void> {
  await db.resource.deleteMany({ where: { category: SIG_IMG_CAT, title: firstLower } }).catch(() => {});
}
export async function hasSignatureImage(firstLower: string): Promise<boolean> {
  const row = await db.resource.findFirst({ where: { category: SIG_IMG_CAT, title: firstLower }, select: { id: true } }).catch(() => null);
  return !!row;
}
