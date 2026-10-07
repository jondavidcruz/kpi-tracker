// Google Sheets hybrid sync (Jon 2026-10-07: "the girls edit it similar to
// their Google sheet"). ONE source of truth stays the War Room: we PUSH the
// follow-up + deals tables into a Sheet in the War Room Vault, and PULL BACK
// only the inbox columns the girls type into (what they said · set next
// follow-up · your name · update next steps). Inbox cells are consumed on
// sync — applied through the rule-zero buyer write path, then rewritten
// blank — so there is never a second version of the truth.
import crypto from "crypto";
import { db } from "./db";
import { updateBuyer, logTouch } from "./buyers/write";
import { rollupResearchKpis } from "./research-kpis";
import { driveRootId } from "./gdrive";

const SHEET_CAT = "__dispo_sheet__";
const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";

type SA = { client_email: string; private_key: string };
let cached: { token: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;
  const sa: SA = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`); signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("sheets auth failed: " + JSON.stringify(j).slice(0, 160));
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cached.token;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const t = await token();
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${t}`, "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await res.text();
  if (!res.ok) {
    if (res.status === 403 && /SERVICE_DISABLED|has not been used/.test(body)) {
      throw new Error("SHEETS_API_DISABLED: enable it at https://console.cloud.google.com/apis/library/sheets.googleapis.com (one click, free), then sync again.");
    }
    throw new Error(`sheets ${res.status}: ${body.slice(0, 180)}`);
  }
  return JSON.parse(body) as T;
}

export type SheetInfo = { id: string; url: string; lastSync?: string };

export async function readSheetInfo(): Promise<SheetInfo | null> {
  const row = await db.resource.findFirst({ where: { category: SHEET_CAT } }).catch(() => null);
  try { return row?.description ? (JSON.parse(row.description) as SheetInfo) : null; } catch { return null; }
}

async function saveSheetInfo(info: SheetInfo): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: SHEET_CAT } });
  const description = JSON.stringify(info);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "dispo-sheet", category: SHEET_CAT, url: info.url, description } });
}

async function ensureSheet(): Promise<SheetInfo> {
  const existing = await readSheetInfo();
  if (existing) return existing;
  // Create via DRIVE, inside the Shared Drive — spreadsheets.create would land
  // in the service account's own My Drive, and SAs have no storage quota there
  // (same Google rule that forced the recordings into the War Room Vault).
  const root = await driveRootId();
  if (!root) throw new Error("No Drive root configured — set the War Room Vault first");
  const file = await api<{ id: string }>(`https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id`, {
    method: "POST",
    body: JSON.stringify({ name: "War Room — Dispo Board (synced)", mimeType: "application/vnd.google-apps.spreadsheet", parents: [root] }),
  });
  const id = file.id;
  // shape it: first tab → Follow-ups, add Deals, freeze + bold headers
  const meta = await api<{ sheets: Array<{ properties: { sheetId: number } }> }>(`${SHEETS}/${id}?fields=sheets.properties`);
  const firstId = meta.sheets[0]?.properties.sheetId ?? 0;
  const resp = await api<{ replies: Array<{ addSheet?: { properties: { sheetId: number } } }> }>(`${SHEETS}/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [
      { updateSheetProperties: { properties: { sheetId: firstId, title: "Follow-ups", gridProperties: { frozenRowCount: 1 } }, fields: "title,gridProperties.frozenRowCount" } },
      { addSheet: { properties: { title: "Deals", gridProperties: { frozenRowCount: 1 } } } },
    ] }),
  });
  const dealsId = resp.replies.find((r) => r.addSheet)?.addSheet?.properties.sheetId;
  await api(`${SHEETS}/${id}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [firstId, dealsId].filter((x): x is number => x != null).map((sheetId) => ({
      repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" },
    })) }),
  }).catch(() => {});
  const info = { id, url: `https://docs.google.com/spreadsheets/d/${id}/edit` };
  await saveSheetInfo(info);
  return info;
}

const FU_HEAD = ["id (don't touch)", "Name", "Type", "Phone", "Email", "Next follow-up", "Last contacted", "💬 WHAT THEY SAID — type here", "📅 SET NEXT FOLLOW-UP (YYYY-MM-DD)", "YOUR NAME (KPI credit)"];
const DEAL_HEAD = ["id (don't touch)", "Address", "Stage", "Rep", "Ask $", "Contract $", "Next steps (current)", "✍️ UPDATE NEXT STEPS — type here"];

/** Full round trip: pull the girls' typed cells in, then push fresh truth out. */
export async function syncDispoSheet(): Promise<{ ok: boolean; url: string; applied: number; contacts: number; deals: number; error?: string }> {
  const info = await ensureSheet();
  const today = new Date().toISOString().slice(0, 10);
  let applied = 0;

  // ── PULL: consume the inbox columns ──
  type ValuesResp = { valueRanges: Array<{ values?: string[][] }> };
  const got = await api<ValuesResp>(`${SHEETS}/${info.id}/values:batchGet?ranges=${encodeURIComponent("Follow-ups!A2:J1000")}&ranges=${encodeURIComponent("Deals!A2:H500")}`);
  const fuRows = got.valueRanges[0]?.values ?? [];
  const dealRows = got.valueRanges[1]?.values ?? [];
  const reps = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const repByName = (n: string) => reps.find((r) => r.name.toLowerCase() === n.toLowerCase() || r.name.toLowerCase().startsWith(n.toLowerCase() + " ") || r.name.split(" ")[0].toLowerCase() === n.toLowerCase());
  for (const r of fuRows) {
    const [id, , , , , , , said = "", setNext = "", repName = ""] = r;
    if (!id || (!said.trim() && !setNext.trim())) continue;
    const contact = await db.marketContact.findUnique({ where: { id }, select: { id: true, outreachLog: true } });
    if (!contact) continue;
    const note = said.trim().slice(0, 300);
    const nextDate = /^\d{4}-\d{2}-\d{2}$/.test(setNext.trim()) ? setNext.trim() : "";
    const fallbackNext = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const rep = repName.trim() ? repByName(repName.trim()) : undefined;
    const actor = rep?.name ?? "google-sheet";
    const stamped = note ? `${today}: ${note}` : `${today}: reached out (sheet)`;
    await updateBuyer(contact.id, {
      lastContacted: today,
      nextFollowUp: nextDate || fallbackNext,
      ...(note ? { outreachLog: `${stamped}\n${contact.outreachLog ?? ""}`.slice(0, 4000), vetStatus: "contacted" } : {}),
    }, actor, { action: "sheet_sync" });
    if (note) await logTouch(contact.id, { channel: "call", note }, actor);
    if (rep && note) await rollupResearchKpis(rep.id, today).catch(() => {});
    applied++;
  }
  for (const r of dealRows) {
    const [id, , , , , , , upd = ""] = r;
    if (!id || !upd.trim()) continue;
    const exists = await db.deal.findUnique({ where: { id }, select: { id: true } });
    if (!exists) continue;
    await db.deal.update({ where: { id }, data: { nextSteps: upd.trim().slice(0, 500) } });
    applied++;
  }

  // ── PUSH: rewrite both tabs with fresh truth (inbox columns come back blank) ──
  const contacts = await db.marketContact.findMany({
    where: { archivedAt: null, vetStage: { in: ["vetted", "active"] }, nextFollowUp: { not: "" } },
    orderBy: { nextFollowUp: "asc" }, take: 500,
    select: { id: true, name: true, type: true, phone: true, email: true, nextFollowUp: true, lastContacted: true },
  });
  const deals = await db.deal.findMany({ where: { active: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const fuData = [FU_HEAD, ...contacts.map((c) => [c.id, c.name, c.type, c.phone, c.email, c.nextFollowUp, c.lastContacted, "", "", ""])];
  const dealData = [DEAL_HEAD, ...deals.map((d) => [d.id, d.address, d.status, d.assignedTo, d.askingPrice ?? "", d.contractPrice ?? "", d.nextSteps, ""])];
  await api(`${SHEETS}/${info.id}/values:batchClear`, { method: "POST", body: JSON.stringify({ ranges: ["Follow-ups!A1:J1000", "Deals!A1:H500"] }) });
  await api(`${SHEETS}/${info.id}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data: [
      { range: "Follow-ups!A1", values: fuData },
      { range: "Deals!A1", values: dealData },
    ] }),
  });
  await saveSheetInfo({ ...info, lastSync: new Date().toISOString() });
  return { ok: true, url: info.url, applied, contacts: contacts.length, deals: deals.length };
}
