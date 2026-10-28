// 💬 Google Chat spaces (Jon 2026-10-08) — one webhook per room, stored as a
// JSON map in CHAT_WEBHOOKS_JSON. Each room has ONE job (Jon's noise rule):
//   contracts    → a deal gets SIGNED (acq or dispo) — the bell rings here
//   kpi          → ONE compact end-of-day KPI snapshot, nothing else
//   phonehealth  → number rotation + text deliverability only (weekly-ish)
//   receipts     → PDF receipts from subscriptions
//   leadership   → Friday leadership-call notes (C-suite + Marie)
//   team         → wins + closed deals, whole company
//   acquisitions → offers in motion (made / captured / negotiating)
//   directrei    → Direct REI AI updates + qualified-lead reporting
export type ChatSpace = "contracts" | "kpi" | "phonehealth" | "receipts" | "leadership" | "team" | "acquisitions" | "directrei";

// 🔑 Resolve a room's webhook URL. A DB override (Resource "__chat_webhooks__", a
// JSON map) wins over the CHAT_WEBHOOKS_JSON env var — so Jon can add/replace a
// room's webhook from inside the app without an env change + redeploy (Jon 2026-10-27,
// pasted the Freedom Offers Team + Contracts Sign webhooks). Falls back to env.
async function webhookFor(space: ChatSpace): Promise<string> {
  let override: Record<string, string> = {};
  try {
    const { db } = await import("@/lib/db");
    const row = await db.resource.findFirst({ where: { category: "__chat_webhooks__" } });
    if (row?.description) override = JSON.parse(row.description) as Record<string, string>;
  } catch { /* env fallback below */ }
  let env: Record<string, string> = {};
  try { env = JSON.parse(process.env.CHAT_WEBHOOKS_JSON || "{}") as Record<string, string>; } catch { /* none */ }
  return (override[space] || env[space] || "").trim();
}

export async function postToSpace(space: ChatSpace, text: string): Promise<boolean> {
  try {
    const url = await webhookFor(space);
    if (!url) return false;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return r.ok;
  } catch { return false; }
}

/** Post text + an image card (the EOD scoreboard) to a space. */
export async function postImageCard(space: ChatSpace, text: string, imageUrl: string): Promise<boolean> {
  try {
    const url = await webhookFor(space);
    if (!url) return false;
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, cardsV2: [{ cardId: "kpi-eod", card: { sections: [{ widgets: [{ image: { imageUrl, onClick: { openLink: { url: "https://kpi-tracker-lovat.vercel.app/report" } } } }] }] } }] }),
    });
    return r.ok;
  } catch { return false; }
}
