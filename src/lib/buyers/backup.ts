// Nightly + on-demand buyer backup (vetted-buyers rebuild Phase 1, BUILD_SPEC
// §2.3): every buyer (archived included) with history/contacts/touches + the
// legacy land-interview JSON → JSON + CSV + a zip of the area-map images →
// Google Drive folder "War Room Backups / Vetted Buyers". Fallback when Drive
// isn't configured: Supabase Storage bucket "backups". Retention: snapshots
// older than 90 days are MOVED to an "_archive" subfolder — never deleted.
import { db } from "@/lib/db";
import { gdriveConfigured, uploadToFolder, listFolder, ensureSubfolder, moveToFolder } from "@/lib/gdrive";
import { adminConfigured, createAdminClient } from "@/lib/supabase/admin";

const DRIVE_FOLDER = process.env.BUYER_BACKUP_FOLDER_ID || "18d9kIHwiQHTp54dZcUU53UqczBotrgUB";
const META_CAT = "__buyer_backup__"; // Resource row holding last-run metadata (drives the status pill)

// ── Minimal ZIP writer (store method, no compression — images are already compressed) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files: { name: string; data: Uint8Array }[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const nameB = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(f.data.length, 18); local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(nameB.length, 26); local.writeUInt16LE(0, 28);
    chunks.push(local, nameB, Buffer.from(f.data));
    const cent = Buffer.alloc(46);
    cent.writeUInt32LE(0x02014b50, 0); cent.writeUInt16LE(20, 4); cent.writeUInt16LE(20, 6); cent.writeUInt16LE(0, 8);
    cent.writeUInt16LE(0, 10); cent.writeUInt16LE(0, 12); cent.writeUInt16LE(0, 14); cent.writeUInt32LE(crc, 16);
    cent.writeUInt32LE(f.data.length, 20); cent.writeUInt32LE(f.data.length, 24);
    cent.writeUInt16LE(nameB.length, 28);
    cent.writeUInt32LE(offset, 42);
    central.push(cent, nameB);
    offset += 30 + nameB.length + f.data.length;
  }
  const centralStart = offset;
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(centralStart, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, end]);
}

const csvEsc = (v: unknown) => {
  const s = String(v ?? "").replace(/\r?\n/g, " | ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export type BuyerBackupResult = {
  ok: boolean; target: "drive" | "supabase" | "none";
  buyers: number; maps: number; historyRows: number; touches: number; contacts: number;
  link?: string; warning?: string;
};

export async function runBuyerBackup(): Promise<BuyerBackupResult> {
  const date = new Date().toISOString().slice(0, 10);
  const [buyers, landRow] = await Promise.all([
    db.marketContact.findMany({
      include: { history: { orderBy: { at: "asc" } }, contacts: true, touches: { orderBy: { at: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.resource.findFirst({ where: { category: "__buyer_land__" } }),
  ]);
  let land: Record<string, unknown> = {};
  try { land = JSON.parse(landRow?.description || "{}"); } catch {}

  const historyRows = buyers.reduce((s, b) => s + b.history.length, 0);
  const touches = buyers.reduce((s, b) => s + b.touches.length, 0);
  const contacts = buyers.reduce((s, b) => s + b.contacts.length, 0);

  const json = Buffer.from(JSON.stringify({ exportedAt: new Date().toISOString(), count: buyers.length, landInterviews: land, buyers }, null, 1), "utf8");

  const CSV_FIELDS = ["id", "name", "company", "category", "type", "vetStage", "status", "phone", "phone2", "email", "links", "market", "buyBoxAreas", "buyBox", "priceRange", "minLotSize", "closingSpeed", "lastContacted", "nextFollowUp", "outreachLog", "notes", "archivedAt", "archiveReason", "buyBoxSource", "contact"] as const;
  const csv = Buffer.from(
    "﻿" + [CSV_FIELDS.join(","), ...buyers.map((b) => CSV_FIELDS.map((f) => csvEsc((b as Record<string, unknown>)[f])).join(","))].join("\r\n"),
    "utf8",
  );

  // Area-map images (public bucket URLs stored in `contact`).
  const mapFiles: { name: string; data: Uint8Array }[] = [];
  for (const b of buyers) {
    const url = (b.contact || "").trim();
    if (!/^https?:\/\//.test(url)) continue;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ext = (url.split(".").pop() || "png").split("?")[0].slice(0, 5);
      mapFiles.push({ name: `${b.name.replace(/[^\w\- ]+/g, "_").slice(0, 60)}_${b.id.slice(-6)}.${ext}`, data: bytes });
    } catch { /* skip unreachable image, keep going */ }
  }
  const zip = mapFiles.length ? zipStore(mapFiles) : null;

  const names = {
    json: `vetted_buyers_${date}.json`,
    csv: `vetted_buyers_${date}.csv`,
    zip: `area_maps_${date}.zip`,
  };

  let result: BuyerBackupResult = { ok: false, target: "none", buyers: buyers.length, maps: mapFiles.length, historyRows, touches, contacts };

  if (gdriveConfigured()) {
    try {
      const up1 = await uploadToFolder(DRIVE_FOLDER, names.json, json, "application/json");
      await uploadToFolder(DRIVE_FOLDER, names.csv, csv, "text/csv");
      if (zip) await uploadToFolder(DRIVE_FOLDER, names.zip, zip, "application/zip");
      // Retention: snapshots older than 90 days move to _archive (never deleted).
      try {
        const cutoff = Date.now() - 90 * 86400000;
        const files = await listFolder(DRIVE_FOLDER);
        const old = files.filter((f) => f.mimeType !== "application/vnd.google-apps.folder" && Date.parse(f.createdTime) < cutoff);
        if (old.length) {
          const arch = await ensureSubfolder(DRIVE_FOLDER, "_archive");
          for (const f of old) await moveToFolder(f.id, DRIVE_FOLDER, arch);
        }
      } catch { /* retention is best-effort */ }
      result = { ...result, ok: true, target: "drive", link: `https://drive.google.com/drive/folders/${DRIVE_FOLDER}`, warning: undefined };
      void up1;
    } catch (e) {
      // Surface the service-account email so Jon can share the Drive folder with it
      // (client_email is designed to be shared — not a secret).
      let saEmail = "";
      try { saEmail = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}").client_email || ""; } catch {}
      result.warning = `Drive upload failed: ${String(e).slice(0, 200)}${saEmail ? ` — share the folder with ${saEmail}` : ""}`;
    }
  }

  if (!result.ok && adminConfigured()) {
    // Fallback: Supabase Storage bucket "backups" so nothing is lost.
    try {
      const admin = createAdminClient();
      await admin.storage.createBucket("backups", { public: false }).catch(() => {});
      const put = (name: string, data: Buffer, contentType: string) =>
        admin.storage.from("backups").upload(`vetted-buyers/${name}`, data, { contentType, upsert: true });
      const r1 = await put(names.json, json, "application/json");
      await put(names.csv, csv, "text/csv");
      if (zip) await put(names.zip, zip, "application/zip");
      if (r1.error) throw new Error(r1.error.message);
      result = { ...result, ok: true, target: "supabase", warning: (result.warning ? result.warning + " — " : "") + "saved to Supabase backups/ (Drive not available)" };
    } catch (e) {
      result.warning = (result.warning ? result.warning + " — " : "") + `Supabase fallback failed: ${String(e).slice(0, 200)}`;
    }
  }

  // Record last-run metadata for the status pill (best-effort).
  try {
    const meta = JSON.stringify({ at: new Date().toISOString(), ...result });
    const row = await db.resource.findFirst({ where: { category: META_CAT } });
    if (row) await db.resource.update({ where: { id: row.id }, data: { description: meta } });
    else await db.resource.create({ data: { title: "buyer-backup-meta", category: META_CAT, url: "", description: meta } });
  } catch { /* pill just shows unknown */ }

  return result;
}

/** Last backup metadata for the status pill (null if never ran). */
export async function lastBuyerBackup(): Promise<{ at: string; ok: boolean; target: string; buyers?: number; link?: string } | null> {
  const row = await db.resource.findFirst({ where: { category: META_CAT } }).catch(() => null);
  if (!row) return null;
  try { return JSON.parse(row.description || "null"); } catch { return null; }
}
