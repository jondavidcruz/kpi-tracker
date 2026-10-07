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
  if (isManager(user)) return { call: true, sms: true, email: true };
  const map = await readCommsMap();
  return map[firstOf(user.name)] ?? { call: false, sms: false, email: false };
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
