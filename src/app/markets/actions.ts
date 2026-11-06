"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { readTargetMarkets, saveTargetMarkets, logMarketPull, type Trend, type MarketStatus } from "@/lib/target-markets";

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
