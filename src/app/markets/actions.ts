"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { readTargetMarkets, saveTargetMarkets, logMarketPull, type Trend, type MarketStatus } from "@/lib/target-markets";
import { isManager } from "@/lib/auth";
import { saveTerritory, deleteTerritory, type TerrStatus } from "@/lib/map-territories";

// 📍 Log that we pulled leads in a market (updates coverage + cooldown).
export async function logPullAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const marketId = String(formData.get("marketId") ?? "");
  if (!marketId) return;
  const count = Math.max(0, Math.round(Number(formData.get("count") ?? 0)) || 0);
  const date = String(formData.get("date") ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  await logMarketPull({
    marketId, date, count,
    source: String(formData.get("source") ?? "").slice(0, 40),
    landType: String(formData.get("landType") ?? "").slice(0, 40),
    by: me.name, note: String(formData.get("note") ?? "").slice(0, 200),
  });
  revalidatePath("/markets");
}

// 📈 Owner's 30-60-180 trend read for a market (up / flat / down + a note).
export async function setMarketTrendAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const marketId = String(formData.get("marketId") ?? "");
  const trend = String(formData.get("trend") ?? "") as Trend;
  if (!marketId || !["up", "flat", "down", ""].includes(trend)) return;
  const list = await readTargetMarkets();
  const m = list.find((x) => x.id === marketId);
  if (!m) return;
  m.trend = trend;
  m.trendNote = String(formData.get("trendNote") ?? "").slice(0, 200);
  m.trendAt = new Date().toISOString().slice(0, 10);
  await saveTargetMarkets(list);
  revalidatePath("/markets");
}

// 🎯 Move a market between target / active / paused.
export async function setMarketStatusAction(formData: FormData) {
  const me = await getCurrentUser();
  if (!me) return;
  const marketId = String(formData.get("marketId") ?? "");
  const status = String(formData.get("status") ?? "") as MarketStatus;
  if (!marketId || !["target", "active", "paused"].includes(status)) return;
  const list = await readTargetMarkets();
  const m = list.find((x) => x.id === marketId);
  if (!m) return;
  m.status = status;
  await saveTargetMarkets(list);
  revalidatePath("/markets");
}

// 🖍 Save a hand-drawn territory on the map (manager). `points` is a JSON [lat,lng][] ring.
export async function saveTerritoryAction(formData: FormData): Promise<{ ok: boolean; id?: string }> {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return { ok: false };
  const name = String(formData.get("name") ?? "").trim();
  const status = String(formData.get("status") ?? "") as TerrStatus;
  if (!["pulled", "marketing", "target", "avoid"].includes(status)) return { ok: false };
  let points: [number, number][] = [];
  try { points = JSON.parse(String(formData.get("points") ?? "[]")); } catch { return { ok: false }; }
  const id = String(formData.get("id") ?? "") || undefined;
  const pulledRaw = String(formData.get("pulled") ?? "").replace(/[^\d]/g, "");
  const pulled = pulledRaw ? Number(pulledRaw) : undefined;
  const saved = await saveTerritory({ id, name, status, points, by: me.name, pulled });
  revalidatePath("/markets");
  return { ok: !!saved, id: saved ?? undefined };
}

// 🗑 Delete a drawn territory (manager).
export async function deleteTerritoryAction(formData: FormData): Promise<{ ok: boolean }> {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return { ok: false };
  const id = String(formData.get("id") ?? "");
  if (id) await deleteTerritory(id);
  revalidatePath("/markets");
  return { ok: true };
}
