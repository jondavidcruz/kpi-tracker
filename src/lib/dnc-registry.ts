import "server-only";
// 🚫 Internal DNC registry (Jon 2026-11-13: "double-verify every uploaded list is scrubbed for DNC").
// DealMachine scrubs on pull and cleanleads365 scrubs on demand, but neither knows about the people
// WE'VE already opted out or who threatened to sue us. This is our own suppression list: every phone
// we must never re-import as a workable lead — contacts tagged dnc / dnd_* / legal-watch, plus the
// standalone legal-watch records (threats logged for people not in the CRM). The lead importer checks
// every uploaded row against this and removes matches before they ever hit the board.
import { db } from "@/lib/db";

const last10 = (p?: string | null) => (p || "").replace(/\D/g, "").slice(-10);

/** Load the set of last-10 phone digits we must never re-contact (opted-out + litigators). */
export async function loadInternalDncSet(): Promise<Set<string>> {
  const set = new Set<string>();
  const contacts = await db.crmContact.findMany({
    where: { OR: [{ tags: { contains: "dnc" } }, { tags: { contains: "dnd_" } }, { tags: { contains: "legal-watch" } }] },
    select: { phone: true, altPhone: true },
  }).catch(() => [] as { phone: string | null; altPhone: string | null }[]);
  for (const c of contacts) {
    const a = last10(c.phone); if (a.length === 10) set.add(a);
    const b = last10(c.altPhone); if (b.length === 10) set.add(b);
  }
  // Standalone legal-watch records — threats logged for people who aren't CRM contacts.
  try {
    const row = await db.resource.findFirst({ where: { category: "__legal_watch__" } });
    if (row?.description) {
      const list = JSON.parse(row.description) as Array<{ phone?: string }>;
      for (const r of list) { const a = last10(r.phone); if (a.length === 10) set.add(a); }
    }
  } catch { /* best-effort */ }
  return set;
}

export async function internalDncCount(): Promise<number> {
  return (await loadInternalDncSet()).size;
}

export { last10 as dncLast10 };
