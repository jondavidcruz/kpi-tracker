"use server";
// Dewong market-research entries (manual until the Zillow-style APIs are
// keyed): stored in Resource __dewong_research__, newest first, capped.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, canAccessMarketing } from "@/lib/auth";

const CAT = "__dewong_research__";

export type DewongEntry = {
  id: string; market: string; state: string; at: string; by: string;
  sold30: number; sold90: number; sold180: number;
  constr30: number; constr90: number; constr180: number;
  pendings30: number; notes: string;
};

export async function readDewong(): Promise<DewongEntry[]> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : []; } catch { return []; }
}

export async function saveDewongAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!canAccessMarketing(me)) return;
  const num = (k: string) => Math.max(0, Number(String(formData.get(k) ?? "").replace(/\D/g, "")) || 0);
  const market = String(formData.get("market") ?? "").trim().slice(0, 80);
  if (!market) return;
  const entry: DewongEntry = {
    id: Math.random().toString(36).slice(2, 10),
    market,
    state: String(formData.get("state") ?? "").trim().toUpperCase().slice(0, 2),
    at: new Date().toISOString(),
    by: me!.name,
    sold30: num("sold30"), sold90: num("sold90"), sold180: num("sold180"),
    constr30: num("constr30"), constr90: num("constr90"), constr180: num("constr180"),
    pendings30: num("pendings30"),
    notes: String(formData.get("notes") ?? "").trim().slice(0, 300),
  };
  const all = await readDewong();
  all.unshift(entry);
  const description = JSON.stringify(all.slice(0, 400));
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "dewong-research", category: CAT, url: "", description } });
  revalidatePath("/lead-sourcing");
}
