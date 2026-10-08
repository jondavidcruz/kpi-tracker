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

export async function postToSpace(space: ChatSpace, text: string): Promise<boolean> {
  try {
    const map = JSON.parse(process.env.CHAT_WEBHOOKS_JSON || "{}") as Record<string, string>;
    const url = map[space];
    if (!url) return false;
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    return r.ok;
  } catch { return false; }
}
