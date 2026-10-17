import { db } from "@/lib/db";

// 💬 Posts every new buyer list to a dedicated Google Chat space (Jon 2026-10-17:
// "post the list on an excel and put them in this webhook every time we get a new
// list of buyers"). The webhook URL (a secret) is stored in a Resource, not env,
// so it can be set without a redeploy. Chat webhooks can't attach files, so the
// message carries a one-click link to the Google Sheet (opens in Excel/Sheets).
const CAT = "__buyers_chat_webhook__";

export async function setBuyersChatWebhook(url: string): Promise<void> {
  const clean = (url || "").trim();
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { url: clean } });
  else await db.resource.create({ data: { title: "buyers-chat-webhook", category: CAT, url: clean, description: "" } });
}

export async function readBuyersChatWebhook(): Promise<string> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  return (row?.url || "").trim();
}

/** Post a buyer-list card to the Chat space. Best-effort; returns whether it posted. */
export async function postBuyerListToChat(opts: { title: string; count: number; sheetLink: string; csvLink?: string; byState?: Record<string, number>; note?: string }): Promise<boolean> {
  const webhook = await readBuyersChatWebhook();
  if (!webhook || !opts.count) return false;
  const byline = opts.byState ? Object.entries(opts.byState).map(([s, n]) => `${s}: ${n}`).join("  ·  ") : "";
  const buttons = [{ text: "📊 Open the spreadsheet", onClick: { openLink: { url: opts.sheetLink } } }];
  if (opts.csvLink) buttons.push({ text: "⬇️ CSV", onClick: { openLink: { url: opts.csvLink } } });
  const payload = {
    text: `🆕 ${opts.title} — ${opts.count} buyers`,
    cardsV2: [{
      cardId: "buyer-list",
      card: {
        header: { title: `🆕 ${opts.count} new buyers`, subtitle: opts.title },
        sections: [{
          widgets: [
            ...(byline ? [{ decoratedText: { topLabel: "By market", text: byline } }] : []),
            ...(opts.note ? [{ textParagraph: { text: opts.note } }] : []),
            { buttonList: { buttons } },
          ],
        }],
      },
    }],
  };
  try {
    const r = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(payload) });
    return r.ok;
  } catch { return false; }
}
