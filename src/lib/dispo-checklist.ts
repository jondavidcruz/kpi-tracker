// Dispo Marketing Checklist (from Jon's "Property Disposition Checklist" doc,
// 2026-10-06) — the sell-it-fast sequence for every deal under contract,
// upgraded to point at the War Room tools that automate each step. State
// lives per deal in Resource __dispo_checklist__ {dealId: {stepKey: {by, at}}}.
import { db } from "@/lib/db";

export const DISPO_CHECKLIST_CAT = "__dispo_checklist__";

export type DispoStep = { key: string; label: string; hint: string; phase: string };

export const DISPO_STEPS: DispoStep[] = [
  // ── Day 0 — launch ──
  { key: "pricing", phase: "🚀 Day 0 — launch", label: "Marketing price set", hint: "Confirm the ask vs contract spread on this card — the margin IS the business." },
  { key: "cascade", phase: "🚀 Day 0 — launch", label: "Run the Buyer Cascade", hint: "Vetted Buyers → 🎯 Cascade: type this address — call the Send-first tier top-down." },
  { key: "email", phase: "🚀 Day 0 — launch", label: "Email blast buyers", hint: "🚀 Start auto-cascade on this card — it emails the top 3, then the next 3 every ~3h." },
  { key: "text", phase: "🚀 Day 0 — launch", label: "Text blast buyers", hint: "Direct REI buyer campaign (Deal Blast) — replies land on the dashboard pulse." },
  // ── Day 1–3 — work it ──
  { key: "coldcall", phase: "📞 Day 1–3 — work it", label: "Cold-call the top 10 ranked buyers", hint: "📇 Log each touch — it counts toward your KPIs and the buyer's track record." },
  { key: "skiptrace", phase: "📞 Day 1–3 — work it", label: "Skip-trace unresponsive priority buyers", hint: "Skipgenie the Send-first buyers who haven't picked up — new numbers, fresh dials." },
  { key: "outcomes", phase: "📞 Day 1–3 — work it", label: "Log every response in Sends & responses", hint: "Offers + passes (with reasons) — this builds the lowball/tire-kicker intel." },
  // ── Day 4–7 — escalate ──
  { key: "pricereview", phase: "🏷 Day 4–7 — escalate", label: "Price review vs offers received", hint: "All passes on price? Take it to Jon with the Sends panel open." },
  { key: "mls", phase: "🏷 Day 4–7 — escalate", label: "List on MLS (Beycome)", hint: "⚠️ ONLY if the purchase contract has the pre-marketing agreement — check before listing." },
];

export type DispoChecklistState = Record<string, Record<string, { by: string; at: string }>>;

export async function readDispoChecklists(): Promise<DispoChecklistState> {
  const row = await db.resource.findFirst({ where: { category: DISPO_CHECKLIST_CAT } }).catch(() => null);
  try { return JSON.parse(row?.description || "{}"); } catch { return {}; }
}

export async function toggleDispoStep(dealId: string, stepKey: string, by: string): Promise<void> {
  if (!DISPO_STEPS.some((s) => s.key === stepKey)) return;
  const state = await readDispoChecklists();
  const deal = (state[dealId] ??= {});
  if (deal[stepKey]) delete deal[stepKey];
  else deal[stepKey] = { by, at: new Date().toISOString() };
  const description = JSON.stringify(state);
  const row = await db.resource.findFirst({ where: { category: DISPO_CHECKLIST_CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "dispo-checklists", category: DISPO_CHECKLIST_CAT, url: "", description } });
}
