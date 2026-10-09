import { db } from "@/lib/db";

// 📧 Gmail deal-label automation (Jon 2026-10-09): the moment a contract
// signs, every teammate's Gmail gets the "🚀 ACTIVE DEALS/<address>" label +
// a filter that files all mail mentioning that address into it. Needs the
// gmail.labels + gmail.settings.basic (+ modify) DWD scopes — until Jon adds
// them, calls fail soft and report scope-missing.
const SCOPES = "https://www.googleapis.com/auth/gmail.labels https://www.googleapis.com/auth/gmail.settings.basic https://www.googleapis.com/auth/gmail.modify";

async function gmailAdminToken(asUser: string): Promise<string> {
  const crypto = await import("crypto");
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: sa.client_email, sub: asUser, scope: SCOPES, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`); signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const tok = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }) }).then((r) => r.json());
  if (!tok.access_token) throw new Error(`gmail-admin token (${asUser}): ${JSON.stringify(tok).slice(0, 160)}`);
  return tok.access_token as string;
}

/** Street-fragment search query for a deal address ("14376 Deerfield Lane, …" → "14376 Deerfield"). */
function addressQuery(address: string): string {
  const parts = address.trim().split(/[,]/)[0].trim().split(/\s+/).slice(0, 3).join(" ");
  return `"${parts}"`;
}

async function ensureForUser(email: string, address: string): Promise<string> {
  const token = await gmailAdminToken(email);
  const H = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const labelName = `1. 🚀 ACTIVE DEALS/${address.split(",")[0].trim().slice(0, 60)}`;
  // find or create the label (nested under ACTIVE DEALS via "/")
  const labels = (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { headers: H }).then((r) => r.json())) as { labels?: Array<{ id: string; name: string }> };
  let labelId = labels.labels?.find((l) => l.name === labelName)?.id;
  if (!labelId) {
    const made = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/labels", { method: "POST", headers: H, body: JSON.stringify({ name: labelName, labelListVisibility: "labelShow", messageListVisibility: "show" }) }).then((r) => r.json());
    labelId = (made as { id?: string }).id;
    if (!labelId) throw new Error(`label create failed: ${JSON.stringify(made).slice(0, 120)}`);
  }
  // filter: anything mentioning the street fragment → the label (skip if an identical filter exists)
  const q = addressQuery(address);
  const filters = (await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/filters", { headers: H }).then((r) => r.json())) as { filter?: Array<{ criteria?: { query?: string } }> };
  if (!(filters.filter ?? []).some((f) => f.criteria?.query === q)) {
    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/settings/filters", { method: "POST", headers: H, body: JSON.stringify({ criteria: { query: q }, action: { addLabelIds: [labelId] } }) });
  }
  return labelName;
}

/** Roll the deal label + filter out to the whole team's mailboxes. */
export async function rolloutDealLabel(address: string): Promise<Record<string, string>> {
  const users = await db.user.findMany({ where: { active: true, email: { endsWith: "@freedom-offers.com" } }, select: { email: true } });
  const boxes = [...new Set(["info@freedom-offers.com", ...users.map((u) => u.email)])];
  const out: Record<string, string> = {};
  for (const b of boxes) {
    try { out[b] = `✓ ${await ensureForUser(b, address)}`; }
    catch (e) { out[b] = String(e).slice(0, 120); }
  }
  return out;
}
