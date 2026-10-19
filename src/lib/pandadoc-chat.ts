import { db } from "@/lib/db";

// 👀 PandaDoc "agreement viewed" → Google Chat (acquisitions space). Jon 2026-10-19:
// "every time someone in PandaDoc has viewed their agreement, post a message in the
// acquisitions Google Chat so the team knows." PandaDoc emails the owner per view,
// but the team never saw it — this surfaces it to everyone.
//
// The webhook URL (a secret token) is stored in a Resource, not env, so it can be
// set/rotated without a redeploy (same pattern as buyers-chat). Falls back to the
// configured "acquisitions" space in CHAT_WEBHOOKS_JSON if no dedicated hook is set.
const HOOK_CAT = "__pandadoc_chat_webhook__";
const SEEN_CAT = "__pd_view_announced__"; // first-view dedupe (docIds already posted)

export async function setPandaDocWebhook(url: string): Promise<void> {
  const clean = (url || "").trim();
  const row = await db.resource.findFirst({ where: { category: HOOK_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { url: clean } });
  else await db.resource.create({ data: { title: "pandadoc-chat-webhook", category: HOOK_CAT, url: clean, description: "" } });
}

export async function readPandaDocWebhook(): Promise<string> {
  const row = await db.resource.findFirst({ where: { category: HOOK_CAT } }).catch(() => null);
  return (row?.url || "").trim();
}

/** True the FIRST time we see a given docId viewed; false (already posted) after. */
async function claimFirstView(docId: string): Promise<boolean> {
  if (!docId) return true;
  const row = await db.resource.findFirst({ where: { category: SEEN_CAT } }).catch(() => null);
  let seen: string[] = [];
  try { seen = JSON.parse(row?.description || "[]"); } catch { seen = []; }
  if (seen.includes(docId)) return false;
  seen.push(docId);
  if (seen.length > 500) seen = seen.slice(-500); // keep it bounded
  const body = JSON.stringify(seen);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: body } }).catch(() => {});
  else await db.resource.create({ data: { title: "pd-view-announced", category: SEEN_CAT, description: body, url: "" } }).catch(() => {});
  return true;
}

/**
 * Post a "viewed" card to the acquisitions Chat space. Best-effort, deduped to the
 * first view per document so the channel stays quiet (Jon's one-signal rule).
 * Returns whether it actually posted.
 */
export async function postPandaDocView(opts: { docId: string; docName: string; viewer: string; oppId?: string; kindLabel?: string }): Promise<boolean> {
  // Resolve destination: dedicated hook, else the acquisitions space from env.
  let webhook = await readPandaDocWebhook();
  if (!webhook) {
    try {
      const map = JSON.parse(process.env.CHAT_WEBHOOKS_JSON || "{}") as Record<string, string>;
      webhook = (map.acquisitions || "").trim();
    } catch { /* none */ }
  }
  if (!webhook) return false;
  if (!(await claimFirstView(opts.docId))) return false; // already announced this doc

  const who = (opts.viewer || "").trim();
  const kind = opts.kindLabel ? `${opts.kindLabel} ` : "";
  const headline = who
    ? `👀 ${who} just opened their ${kind}agreement`
    : `👀 An agreement was just opened`;
  const buttons = opts.oppId
    ? [{ text: "Open the lead", onClick: { openLink: { url: `https://kpi-tracker-lovat.vercel.app/crm/${opts.oppId}` } } }]
    : [];
  const payload = {
    text: `${headline} — “${opts.docName}”`,
    cardsV2: [{
      cardId: "pd-view",
      card: {
        header: { title: headline, subtitle: opts.docName },
        sections: [{
          widgets: [
            { decoratedText: { topLabel: "Status", text: "First view — the seller is looking at it. Good time to follow up." } },
            ...(buttons.length ? [{ buttonList: { buttons } }] : []),
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
