// Google Drive storage for call recordings (so files don't sit in paid Supabase
import { db } from "./db";
// Storage). Uses a service-account JSON (GOOGLE_SERVICE_ACCOUNT_JSON) uploading
// into a Shared Drive folder (GDRIVE_FOLDER_ID) — Shared Drive so the bytes count
// against the Workspace pool, not the quota-less service account.
import crypto from "crypto";

export function gdriveConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GDRIVE_FOLDER_ID);
}

/** Accept a bare folder id OR a pasted Drive URL and return the bare id (Jon
 *  2026-10-16: GDRIVE_FOLDER_ID was set to a full folder URL → every upload 404'd). */
export function sanitizeFolderId(raw?: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/\/folders\/([A-Za-z0-9_-]+)/) || s.match(/[?&]id=([A-Za-z0-9_-]+)/) || s.match(/\/d\/([A-Za-z0-9_-]+)/);
  return (m ? m[1] : s.replace(/[?#].*$/, "")).trim();
}
/** The configured root folder id, URL-safe. */
export function rootFolderId(): string { return sanitizeFolderId(process.env.GDRIVE_FOLDER_ID); }

type SA = { client_email: string; private_key: string };
function serviceAccount(): SA {
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
}

let cachedToken: { token: string; exp: number } | null = null;
export async function getAccessToken(): Promise<string> {
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
// Runtime Drive root: a Shared Drive id saved in Resource __drive_root__ wins
// (service accounts can't OWN files in a personal My Drive — Google returns
// "Service Accounts do not have storage quota"); falls back to the legacy
// shared folder. Backups, packets, and recordings all resolve through this.
const DRIVE_ROOT_CAT = "__drive_root__";
export async function driveRootId(): Promise<string> {
  try {
    const row = await db.resource.findFirst({ where: { category: DRIVE_ROOT_CAT } });
    if (row?.url) return row.url;
  } catch { /* fall through */ }
  return process.env.BUYER_BACKUP_FOLDER_ID || "18d9kIHwiQHTp54dZcUU53UqczBotrgUB";
}
export async function setDriveRoot(id: string): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: DRIVE_ROOT_CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { url: id } });
  else await db.resource.create({ data: { title: "drive-root", category: DRIVE_ROOT_CAT, url: id, description: "Shared Drive id used as the War Room's Drive root" } });
}

/** Try to create a Shared Drive as the service account (works on some Workspace
 *  setups, 403s on others) and hand Jon organizer access. */
export async function createSharedDrive(name: string): Promise<{ id?: string; error?: string }> {
  try {
    const token = await getAccessToken();
    const requestId = crypto.randomBytes(16).toString("hex");
    const res = await fetch(`https://www.googleapis.com/drive/v3/drives?requestId=${requestId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const j = await res.json();
    if (!j.id) return { error: JSON.stringify(j).slice(0, 300) };
    await fetch(`https://www.googleapis.com/drive/v3/files/${j.id}/permissions?supportsAllDrives=true&sendNotificationEmail=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ role: "organizer", type: "user", emailAddress: "info@freedom-offers.com" }),
    }).catch(() => {});
    return { id: j.id };
  } catch (e) { return { error: String(e).slice(0, 200) }; }
}

export async function driveCheck(): Promise<{ ok: boolean; folder?: string; error?: string }> {
  try {
    const token = await getAccessToken();
    const id = rootFolderId();
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
  const folderId = rootFolderId();
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

/** Upload bytes PRIVATELY (no public permission) — for sensitive files like HUD
 *  statements and HR docs. Returns the Drive file id; only the service account can read
 *  it, so the app streams it back server-side (owner-gated) via downloadFromDrive. */
export async function uploadToDrivePrivate(name: string, bytes: Uint8Array, mime: string): Promise<string> {
  const token = await getAccessToken();
  const folderId = rootFolderId();
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
  if (!j.id) throw new Error("gdrive private upload failed: " + JSON.stringify(j).slice(0, 200));
  return j.id as string; // NOT made public
}

/** Download a private Drive file's bytes server-side (service account). */
export async function downloadFromDrive(fileId: string): Promise<Uint8Array | null> {
  try {
    const token = await getAccessToken();
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

// ── Buyer-backup helpers (vetted-buyers rebuild Phase 1) ──────────────────────

/** Upload into a SPECIFIC folder (not the default GDRIVE_FOLDER_ID). Private —
 *  backups aren't link-shared. Returns { id, link } (link opens for folder members). */
export async function uploadToFolder(folderId: string, name: string, bytes: Uint8Array, mime: string, publicRead = false): Promise<{ id: string; link: string }> {
  const token = await getAccessToken();
  const boundary = "wrb_" + crypto.randomBytes(8).toString("hex");
  const meta = JSON.stringify({ name, parents: [folderId] });
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(pre), Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`)]);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await up.json();
  if (!j.id) throw new Error("gdrive upload failed: " + JSON.stringify(j).slice(0, 200));
  // Call recordings need a STREAMABLE, link-readable URL so the in-app <audio>
  // player works (webViewLink is an HTML page, not a stream). publicRead=true
  // grants anyone-with-link reader + returns the uc?export=download stream URL.
  if (publicRead) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${j.id}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ role: "reader", type: "anyone" }),
    }).catch(() => {});
    return { id: j.id, link: `https://drive.google.com/uc?export=download&id=${j.id}` };
  }
  return { id: j.id, link: j.webViewLink || `https://drive.google.com/file/d/${j.id}/view` };
}

/** Upload CSV text as a NATIVE Google Sheet (Drive converts it), link-readable.
 *  Returns the Sheets webViewLink — opens/edits in Google Sheets or Excel. */
export async function uploadCsvAsSheet(folderId: string, name: string, csv: string): Promise<{ id: string; link: string }> {
  const token = await getAccessToken();
  const boundary = "wrb_" + crypto.randomBytes(8).toString("hex");
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: "application/vnd.google-apps.spreadsheet" });
  const pre = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: text/csv\r\n\r\n`;
  const body = Buffer.concat([Buffer.from(pre), Buffer.from(csv), Buffer.from(`\r\n--${boundary}--`)]);
  const up = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  const j = await up.json();
  if (!j.id) throw new Error("gdrive sheet upload failed: " + JSON.stringify(j).slice(0, 200));
  await fetch(`https://www.googleapis.com/drive/v3/files/${j.id}/permissions?supportsAllDrives=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  }).catch(() => {});
  return { id: j.id, link: j.webViewLink || `https://docs.google.com/spreadsheets/d/${j.id}` };
}

/** List files directly inside a folder (id, name, createdTime). */
// 📎 Start a RESUMABLE upload session straight to Drive and return the one-time
// session URL. The browser PUTs the file bytes to this URL directly, so a large
// file (phone photo, scanned contract) NEVER passes through our Vercel function —
// which rejects any request body over ~4.5MB with a non-JSON 413 ("the server
// sent a bad response"). This is the real reason doc/note uploads failed for
// Marie & Michelle on real-world files (Jon 2026-10-27).
export async function initResumableUpload(folderId: string, name: string, mime: string): Promise<string> {
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mime || "application/octet-stream",
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const loc = res.headers.get("location") || res.headers.get("Location");
  if (!res.ok || !loc) throw new Error("resumable init failed: " + (await res.text().catch(() => "")).slice(0, 160));
  return loc;
}

export async function listFolder(folderId: string): Promise<{ id: string; name: string; createdTime: string; mimeType: string }[]> {
  const token = await getAccessToken();
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime,mimeType)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  return j.files ?? [];
}

// 📁 The deal-documents parent folder. The old hardcoded ID
// (1pfZAlmeoaa3lkP7lboWHeHkppgFjc7Ub) 404'd for the service account — every CRM/
// recording upload failed (Jon 2026-10-16: "file uploads still not working").
// Now it's a "Deals" subfolder under the known-good GDRIVE_FOLDER_ID (or an
// explicit DEALS_FOLDER_ID env override). Cached per instance.
let _dealsParent: string | null = null;
export async function dealsParent(): Promise<string> {
  if (_dealsParent) return _dealsParent;
  const explicit = sanitizeFolderId(process.env.DEALS_FOLDER_ID);
  if (explicit) { _dealsParent = explicit; return explicit; }
  const root = rootFolderId();
  if (!root) throw new Error("GDRIVE_FOLDER_ID not set");
  _dealsParent = await ensureSubfolder(root, "Deals");
  return _dealsParent;
}

// Auto-surface a deal's existing Google Drive files in the War Room. Finds the
// deal folder under the deals parent by street number and lists its files.
export async function listDealFiles(label: string): Promise<{ id: string; name: string; link: string; mimeType: string }[]> {
  if (!gdriveConfigured()) return [];
  const clean = (label || "").trim();
  const streetNo = clean.match(/^\d+/)?.[0];
  const firstTok = clean.toLowerCase().split(",")[0].slice(0, 18);
  try {
    const top = await listFolder(await dealsParent());
    const folders = top.filter((x) => x.mimeType.includes("folder"));
    let folder = streetNo ? folders.find((x) => x.name.startsWith(streetNo)) : undefined;
    if (!folder && firstTok) folder = folders.find((x) => x.name.toLowerCase().includes(firstTok));
    if (!folder) return [];
    const files = await listFolder(folder.id);
    return files
      .filter((x) => !x.mimeType.includes("folder"))
      .map((x) => ({ id: x.id, name: x.name, mimeType: x.mimeType, link: x.mimeType.includes("google-apps") ? `https://drive.google.com/open?id=${x.id}` : `https://drive.google.com/file/d/${x.id}/view` }));
  } catch { return []; }
}

/** Find or create a subfolder by name inside a parent folder. */
export async function ensureSubfolder(parentId: string, name: string): Promise<string> {
  const existing = (await listFolder(parentId)).find((f) => f.name === name && f.mimeType === "application/vnd.google-apps.folder");
  if (existing) return existing.id;
  const token = await getAccessToken();
  const res = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const j = await res.json();
  if (!j.id) throw new Error("gdrive mkdir failed: " + JSON.stringify(j).slice(0, 200));
  return j.id;
}

/** Move a file from one folder to another (used for 90-day retention — never deletes). */
export async function moveToFolder(fileId: string, fromId: string, toId: string): Promise<void> {
  const token = await getAccessToken();
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${toId}&removeParents=${fromId}&supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: "{}",
  });
}

/** Pull a Drive file id out of any link we store (webViewLink, uc?export, /file/d/…). */
export function driveFileId(link?: string | null): string {
  if (!link) return "";
  const m = link.match(/[?&]id=([^&]+)/) || link.match(/\/d\/([^/]+)/) || link.match(/\/file\/d\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : (/^[\w-]{20,}$/.test(link) ? link : "");
}

/** Trash a Drive file (reversible — goes to Drive trash, not hard-deleted). Used to pull
 *  voicemail / no-answer recordings back out after the rep dispositions the call (Jon
 *  2026-10-26: only real conversations should stay in the deal folder). Best-effort. */
export async function trashDriveFile(fileId: string): Promise<boolean> {
  if (!fileId || !gdriveConfigured()) return false;
  try {
    const token = await getAccessToken();
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
    return r.ok;
  } catch { return false; }
}
