"use server";
// 🗂 Deal Board — a freeform dispositions whiteboard (Jon 2026-10-14). Draw +
// type with no limit to lay out a buyer's multi-parcel, multi-seller deal and
// price each parcel. Boards persist in a Resource (no schema change).
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { revalidatePath } from "next/cache";

const CAT = "__deal_boards__";

export type BoardNote = { id: string; x: number; y: number; text: string; color?: string; w?: number };
export type BoardStroke = { color: string; width: number; pts: number[] }; // flat [x,y,x,y,...]
export type DealBoard = { id: string; name: string; notes: BoardNote[]; strokes: BoardStroke[]; updatedAt: string; updatedBy?: string };

async function allowed() {
  const me = await getCurrentUser();
  return me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? "")) ? me : null;
}

export async function readBoards(): Promise<Record<string, DealBoard>> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : {}; } catch { return {}; }
}
async function writeBoards(map: Record<string, DealBoard>) {
  const description = JSON.stringify(map);
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "deal-boards", category: CAT, url: "", description } });
}

export async function saveDealBoardAction(formData: FormData): Promise<void> {
  const me = await allowed();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const payload = String(formData.get("payload") ?? "");
  if (!id || !payload) return;
  let parsed: { name?: string; notes?: BoardNote[]; strokes?: BoardStroke[] };
  try { parsed = JSON.parse(payload); } catch { return; }
  const map = await readBoards();
  const prev = map[id];
  map[id] = {
    id,
    name: (parsed.name ?? prev?.name ?? "Untitled board").slice(0, 80),
    notes: (parsed.notes ?? []).slice(0, 400),
    strokes: (parsed.strokes ?? []).slice(0, 800),
    updatedAt: new Date().toISOString(),
    updatedBy: me.name,
  };
  await writeBoards(map);
}

export async function createDealBoardAction(formData: FormData): Promise<void> {
  const me = await allowed();
  if (!me) return;
  const name = String(formData.get("name") ?? "").trim().slice(0, 80) || "New deal board";
  const id = `b_${Math.random().toString(36).slice(2, 10)}`;
  const map = await readBoards();
  map[id] = { id, name, notes: [], strokes: [], updatedAt: new Date().toISOString(), updatedBy: me.name };
  await writeBoards(map);
  revalidatePath("/crm/dealboard");
}

export async function renameDealBoardAction(formData: FormData): Promise<void> {
  const me = await allowed();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  if (!id || !name) return;
  const map = await readBoards();
  if (map[id]) { map[id].name = name; await writeBoards(map); revalidatePath("/crm/dealboard"); }
}

export async function deleteDealBoardAction(formData: FormData): Promise<void> {
  const me = await allowed();
  if (!me) return;
  const id = String(formData.get("id") ?? "");
  const map = await readBoards();
  if (map[id]) { delete map[id]; await writeBoards(map); revalidatePath("/crm/dealboard"); }
}

// 🔗 Pull a seller's parcels (CRM opportunities) so the board can drop them in
// pre-filled: address + what the seller wants. Returns the matches to the client.
export async function pullSellerParcelsAction(query: string): Promise<{ seller: string; parcels: { title: string; apn: string; wants: number | null }[] }[]> {
  const me = await allowed();
  if (!me) return [];
  const q = query.trim();
  if (!q) return [];
  const contacts = await db.crmContact.findMany({
    where: { name: { contains: q, mode: "insensitive" }, archivedAt: null },
    select: { name: true, opportunities: { where: { archivedAt: null }, select: { title: true, askPrice: true, value: true, formData: true } } },
    take: 8,
  });
  return contacts.filter((c) => c.opportunities.length).map((c) => ({
    seller: c.name,
    parcels: c.opportunities.map((o) => {
      const fd = (o.formData ?? {}) as { property?: { apn?: string } };
      return { title: o.title, apn: fd.property?.apn ?? "", wants: o.askPrice ?? o.value ?? null };
    }),
  }));
}
