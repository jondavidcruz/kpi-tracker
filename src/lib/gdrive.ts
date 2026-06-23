// Google Drive storage for call recordings (so files don't sit in paid Supabase
// Storage). Uses a service-account JSON (GOOGLE_SERVICE_ACCOUNT_JSON) uploading
// into a Shared Drive folder (GDRIVE_FOLDER_ID) — Shared Drive so the bytes count
// against the Workspace pool, not the quota-less service account.
import crypto from "crypto";

export function gdriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GDRIVE_FOLDER_ID);
}

type SA = { client_email: string; private_key: string };
function serviceAccount(): SA {
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
}

let cachedToken: { token: string; exp: number } | null = null;
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${head}.${claims}`); signer.end();
  const sig = signer.sign(sa.private_key).toString("base64url");
  const jwt = `${head}.${claims}.${sig}`;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("gdrive auth failed: " + JSON.stringify(j).slice(0, 200));
  cachedToken = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return cachedToken.token;
}

/** Verify creds + that the target folder is reachable. Returns folder name on success. */
export async function driveCheck(): Promise<{ ok: boolean; folder?: string; error?: string }> {
  try {
    const token = await getAccessToken();
    const id = process.env.GDRIVE_FOLDER_ID;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,driveId&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    const j = await res.json();
    if (!res.ok) return { ok: false, error: JSON.stringify(j).slice(0, 300) };
    return { ok: true, folder: `${j.name}${j.driveId ? " (Shared Drive ✓)" : " (⚠️ not a Shared Drive — uploads will fail on quota)"}` };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/** Upload bytes to the Drive folder, make it link-readable, return a playable URL. */
export async function uploadToDrive(name: string, bytes: Uint8Array, mime: string): Promise<string> {
  const token = await getAccessToken();
  const folderId = process.env.GDRIVE_FOLDER_ID;
  const boundary = "wrb_" + crypto.randomBytes(8).toString("hex");
  const meta = JSON.stringify({ name, parents: [folderId] });
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(pre), Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`)]);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await up.json();
  if (!j.id) throw new Error("gdrive upload failed: " + JSON.stringify(j).slice(0, 200));
  // Make it readable by anyone with the link so the in-app player can stream it.
  await fetch(`https://www.googleapis.com/drive/v3/files/${j.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
  return `https://drive.google.com/uc?export=download&id=${j.id}`;
}
