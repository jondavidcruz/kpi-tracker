// Per-agent comms permissions (Jon 2026-10-07: some agents get the PAID
// channels — calling / SMS / email — others get only the free features like
// notes & tasks). Stored in Resource __crm_comms__ as {firstNameLower:
// {call,sms,email}}; anyone unlisted gets NOTHING paid (safe default), and
// managers/C-suite always have everything.
import { db } from "./db";
import { isManager } from "./auth";
import type { User } from "@prisma/client";

const CAT = "__crm_comms__";
export type CommsPerm = { call: boolean; sms: boolean; email: boolean };
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
  if (first === "jon" || first === "jonathan") return { call: true, sms: true, email: true };
  const map = await readCommsMap();
  const rec = map[first];
  // an explicit saved row wins for ANYONE; managers/admins default to full
  if (rec) return rec;
  return isManager(user) || user.role === "admin" ? { call: true, sms: true, email: true } : { call: false, sms: false, email: false };
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
  return `${name}\nFreedom Offers\n📞 1-877-652-8991 · freedom-offers.com`;
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
