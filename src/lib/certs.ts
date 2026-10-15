import { db } from "@/lib/db";

// 🎖 Earned certificates (Jon 2026-10-15: "mirror how the Air Force rewards" —
// a certificate for every deal closed + custom ones for achievements). Stored in
// a Resource side-store (no schema change), keyed by userId → list of certs.
const CAT = "__certificates__";
export type Cert = { id: string; title: string; detail: string; issuedOn: string; kind: "deal" | "custom" };

export async function readCerts(): Promise<Record<string, Cert[]>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}
async function writeCerts(map: Record<string, Cert[]>) {
  const description = JSON.stringify(map);
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "certificates", category: CAT, url: "", description } });
}
/** Award a cert. `dedupeKey` (e.g. a deal id) prevents awarding the same one twice. */
export async function awardCert(userId: string, title: string, detail: string, kind: Cert["kind"] = "custom", dedupeKey?: string): Promise<boolean> {
  if (!userId || !title.trim()) return false;
  const map = await readCerts();
  const list = map[userId] ?? [];
  if (dedupeKey && list.some((c) => c.id === dedupeKey)) return false;
  list.unshift({ id: dedupeKey || `c_${Math.random().toString(36).slice(2, 9)}`, title: title.trim().slice(0, 90), detail: detail.trim().slice(0, 260), issuedOn: new Date().toISOString().slice(0, 10), kind });
  map[userId] = list.slice(0, 60);
  await writeCerts(map);
  return true;
}
export async function removeCert(userId: string, id: string) {
  const map = await readCerts();
  map[userId] = (map[userId] ?? []).filter((c) => c.id !== id);
  await writeCerts(map);
}

/** The gold-framed certificate HTML (for the page render AND the email). */
export function certHtml(name: string, title: string, detail: string, issuedOn: string): string {
  const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="max-width:620px;margin:0 auto;border:3px double #c9a875;border-radius:14px;padding:28px 24px;background:#fffdf8;font-family:Georgia,'Times New Roman',serif;text-align:center">
    <div style="letter-spacing:3px;color:#c9a875;font-size:12px;font-weight:bold">FREEDOM OFFERS</div>
    <div style="letter-spacing:2px;color:#0b1f3a;font-size:13px;margin-top:4px">CERTIFICATE OF ACHIEVEMENT</div>
    <div style="color:#64748b;font-size:12px;margin-top:18px;font-style:italic">This certifies that</div>
    <div style="font-size:28px;font-weight:bold;color:#0b1f3a;margin:6px 0">${esc(name)}</div>
    <div style="font-size:16px;font-weight:bold;color:#8a6d3b;margin-top:4px">${esc(title)}</div>
    ${detail ? `<div style="color:#475569;font-size:13px;margin-top:10px;line-height:1.5">${esc(detail)}</div>` : ""}
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:26px;font-size:11px;color:#475569">
      <div style="text-align:left"><div style="font-family:'Brush Script MT',cursive;font-size:20px;color:#0b1f3a">Jonathan Cruz</div><div>Jonathan Cruz · President, Freedom Offers LLC</div></div>
      <div style="text-align:right">🎖<br>Issued ${esc(issuedOn)}</div>
    </div>
  </div>`;
}
