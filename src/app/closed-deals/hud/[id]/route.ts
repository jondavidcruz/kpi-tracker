import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getDriveFile } from "@/lib/drive-store";
import { downloadFromDrive } from "@/lib/gdrive";

// Streams a closed deal's HUD statement (verification proof). Owner-only.
// If it's been offloaded to Google Drive, fetch it back server-side (stays private);
// otherwise stream the bytes still stored in Postgres.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const deal = await db.closedDeal.findUnique({
    where: { id },
    select: { hudData: true, hudName: true, hudType: true },
  });
  if (!deal) return new Response("No HUD on file", { status: 404 });

  const safeName = (deal.hudName || "hud").replace(/["\r\n]/g, "");
  const driveId = await getDriveFile(`hud:${id}`);
  let out: Uint8Array | null = deal.hudData ? new Uint8Array(deal.hudData as unknown as Buffer) : null;
  if (!out && driveId) out = await downloadFromDrive(driveId);
  if (!out) return new Response("No HUD on file", { status: 404 });

  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": deal.hudType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
