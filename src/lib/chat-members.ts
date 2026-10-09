import { db } from "@/lib/db";

// 👥 Google Chat membership automation (Jon added the chat.memberships DWD
// scope 2026-10-08): add/remove people from the team's Chat spaces straight
// from the War Room — on-boarding puts them in, off-boarding pulls them out.
// Space IDs come from the webhook URLs already in CHAT_WEBHOOKS_JSON.

async function chatToken(): Promise<string> {
  const crypto = await import("crypto");
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: sa.client_email, sub: "info@freedom-offers.com", scope: "https://www.googleapis.com/auth/chat.memberships", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`); signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }) }).then((r) => r.json());
  if (!tok.access_token) throw new Error(`chat token: ${JSON.stringify(tok).slice(0, 180)}`);
  return tok.access_token as string;
}

/** Space name ("spaces/XXX") per room key, parsed from the webhook URLs. */
export function chatSpaces(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const map = JSON.parse(process.env.CHAT_WEBHOOKS_JSON || "{}") as Record<string, string>;
    for (const [k, url] of Object.entries(map)) {
      const m = url.match(/spaces\/([^/]+)\//);
      if (m) out[k] = `spaces/${m[1]}`;
    }
  } catch { /* none */ }
  const wr = (process.env.WARROOM_CHAT_WEBHOOK ?? "").match(/spaces\/([^/]+)\//);
  if (wr) out.updates = `spaces/${wr[1]}`;
  return out;
}

export async function addToSpaces(email: string, rooms: string[]): Promise<Record<string, string>> {
  const token = await chatToken();
  const spaces = chatSpaces();
  const results: Record<string, string> = {};
  for (const r of rooms) {
    const space = spaces[r];
    if (!space) { results[r] = "unknown room"; continue; }
    const res = await fetch(`https://chat.googleapis.com/v1/${space}/members`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ member: { name: `users/${email}`, type: "HUMAN" } }),
    });
    results[r] = res.ok ? "added" : `${res.status}: ${(await res.text()).slice(0, 100)}`;
  }
  return results;
}

export async function removeFromSpaces(email: string, rooms: string[]): Promise<Record<string, string>> {
  const token = await chatToken();
  const spaces = chatSpaces();
  const results: Record<string, string> = {};
  for (const r of rooms) {
    const space = spaces[r];
    if (!space) { results[r] = "unknown room"; continue; }
    // membership resource name uses the user id — users/{email} works for lookup
    const res = await fetch(`https://chat.googleapis.com/v1/${space}/members/users%2F${encodeURIComponent(email)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    results[r] = res.ok ? "removed" : `${res.status}: ${(await res.text()).slice(0, 100)}`;
  }
  return results;
}

/** Off-boarding: strip a departing teammate from EVERY space we manage. */
export async function offboardFromAllChats(email: string): Promise<Record<string, string>> {
  return removeFromSpaces(email, Object.keys(chatSpaces()));
}

/** Logs the result on the audit trail so Jon can see it happened. */
export async function logChatRosterChange(summary: string): Promise<void> {
  await db.resource.findFirst({ where: { category: "__telnyx_events__" } }).then(async (row) => {
    let list: unknown[] = [];
    try { list = row?.description ? JSON.parse(row.description) : []; } catch { /* fresh */ }
    list.unshift({ at: new Date().toISOString(), ev: "chat-roster", summary });
    const description = JSON.stringify(list.slice(0, 25));
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "telnyx-events", category: "__telnyx_events__", url: "", description } });
  }).catch(() => {});
}
