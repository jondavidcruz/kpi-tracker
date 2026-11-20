import "server-only";
// 🔗 Per-pull-campaign metadata (Jon 2026-11-15): an explicit link from an uploaded pull list to its
// Direct REI campaign (so interested/priced responses attach reliably instead of relying on fuzzy
// filename↔campaign-name matching), plus a manual notes/offers log per campaign. Reserved-Resource
// JSON, no migration. Both keyed by pull-batch id.
import { db } from "@/lib/db";

const LINK_CAT = "__pull_campaign_links__";  // { [batchId]: "Direct REI campaign name" }
const NOTES_CAT = "__pull_campaign_notes__"; // { [batchId]: Array<{ text, by, at }> }
const VIP_CAT = "__pull_campaign_vip__";     // { [batchId]: true } — ⭐ VIP JV campaigns (Jon×Jon land JV, Nov 2026)

export type CampaignNote = { text: string; by: string; at: string };

async function readMap<T>(cat: string): Promise<Record<string, T>> {
  try {
    const row = await db.resource.findFirst({ where: { category: cat } });
    const o = row?.description ? JSON.parse(row.description) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, T>) : {};
  } catch { return {}; }
}
async function writeMap(cat: string, title: string, obj: unknown): Promise<void> {
  const description = JSON.stringify(obj);
  const row = await db.resource.findFirst({ where: { category: cat } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title, category: cat, url: "", description } });
}

// ── Explicit Direct REI campaign link ────────────────────────────────────────────────────────────
export async function readCampaignLinks(): Promise<Record<string, string>> {
  return readMap<string>(LINK_CAT);
}
export async function setCampaignLink(batchId: string, campaign: string): Promise<void> {
  const links = await readCampaignLinks();
  if (campaign && campaign.trim()) links[batchId] = campaign.trim().slice(0, 120);
  else delete links[batchId];
  await writeMap(LINK_CAT, "pull-campaign-links", links);
}

// ── ⭐ VIP flag — the JV campaigns (Jon × Jon land JV). Owner marks these so they stand out + sort first.
export async function readCampaignVip(): Promise<Record<string, boolean>> {
  return readMap<boolean>(VIP_CAT);
}
export async function setCampaignVip(batchId: string, vip: boolean): Promise<Record<string, boolean>> {
  const all = await readCampaignVip();
  if (vip) all[batchId] = true;
  else delete all[batchId];
  await writeMap(VIP_CAT, "pull-campaign-vip", all);
  return all;
}

// ── Manual campaign notes / offers log ───────────────────────────────────────────────────────────
export async function readCampaignNotes(): Promise<Record<string, CampaignNote[]>> {
  return readMap<CampaignNote[]>(NOTES_CAT);
}
export async function addCampaignNote(batchId: string, text: string, by: string): Promise<CampaignNote[]> {
  const all = await readCampaignNotes();
  const note: CampaignNote = { text: (text || "").trim().slice(0, 600), by: by || "—", at: new Date().toISOString() };
  const list = [note, ...(all[batchId] || [])].slice(0, 50);
  all[batchId] = list;
  await writeMap(NOTES_CAT, "pull-campaign-notes", all);
  return list;
}
export async function deleteCampaignNote(batchId: string, at: string): Promise<void> {
  const all = await readCampaignNotes();
  if (all[batchId]) {
    all[batchId] = all[batchId].filter((n) => n.at !== at);
    if (!all[batchId].length) delete all[batchId];
    await writeMap(NOTES_CAT, "pull-campaign-notes", all);
  }
}
