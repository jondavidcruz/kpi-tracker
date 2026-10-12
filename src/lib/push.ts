// 📲 Web Push for the installed War Room app (iPhone home-screen + desktop).
// Subscriptions live in Resource __push_subs__ as { <firstNameLower>: Sub[] }.
// Dead subscriptions (410/404) are pruned on send.
import webpush from "web-push";
import { db } from "./db";

const CAT = "__push_subs__";
type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

function configured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

async function readSubs(): Promise<{ rowId: string | null; map: Record<string, Sub[]> }> {
  const row = await db.resource.findFirst({ where: { category: CAT } });
  let map: Record<string, Sub[]> = {};
  try { map = row?.description ? JSON.parse(row.description) : {}; } catch { /* fresh */ }
  return { rowId: row?.id ?? null, map };
}

async function writeSubs(rowId: string | null, map: Record<string, Sub[]>) {
  const description = JSON.stringify(map);
  if (rowId) await db.resource.update({ where: { id: rowId }, data: { description } }).catch(() => {});
  else await db.resource.create({ data: { title: "push-subs", category: CAT, url: "", description } }).catch(() => {});
}

export async function saveSub(first: string, sub: Sub) {
  const { rowId, map } = await readSubs();
  const key = first.toLowerCase();
  const list = (map[key] ?? []).filter((s) => s.endpoint !== sub.endpoint);
  list.push(sub);
  map[key] = list.slice(-5); // a person has at most a few devices
  await writeSubs(rowId, map);
}

export async function removeSub(first: string, endpoint: string) {
  const { rowId, map } = await readSubs();
  const key = first.toLowerCase();
  map[key] = (map[key] ?? []).filter((s) => s.endpoint !== endpoint);
  await writeSubs(rowId, map);
}

/** Send to specific first names (lowercase), or "all" for everyone subscribed. */
export async function sendPushTo(who: string[] | "all", payload: { title: string; body?: string; url?: string; tag?: string }) {
  if (!configured()) return;
  webpush.setVapidDetails(process.env.WEB_PUSH_CONTACT || "mailto:info@freedom-offers.com", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const { rowId, map } = await readSubs();
  const names = who === "all" ? Object.keys(map) : who.map((w) => w.toLowerCase());
  let pruned = false;
  await Promise.all(names.flatMap((name) => (map[name] ?? []).map(async (sub) => {
    try {
      await webpush.sendNotification(sub as webpush.PushSubscription, JSON.stringify(payload), { TTL: 120 });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 0;
      if (code === 404 || code === 410) { map[name] = (map[name] ?? []).filter((s) => s.endpoint !== sub.endpoint); pruned = true; }
    }
  })));
  if (pruned) await writeSubs(rowId, map);
}
