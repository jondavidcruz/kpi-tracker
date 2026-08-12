import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";
import { getDriveFile } from "@/lib/drive-store";
import { downloadFromDrive } from "@/lib/gdrive";

// Streams a team member's uploaded HR document (signed agreement). Owner only.
// Falls back from Postgres to a private Google Drive copy if it's been offloaded.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const doc = await db.teamDoc.findUnique({ where: { id }, select: { data: true, filename: true, contentType: true } });
  if (!doc) return new Response("Not found", { status: 404 });

  const safeName = (doc.filename || "document").replace(/["\r\n]/g, "");
  const localBuf = doc.data as unknown as Buffer | null;
  const driveId = await getDriveFile(`doc:${id}`);
  let out: Uint8Array | null = localBuf && localBuf.length > 0 ? new Uint8Array(localBuf) : null;
  if (!out && driveId) out = await downloadFromDrive(driveId);
  if (!out) return new Response("Not found", { status: 404 });

  return new Response(out as unknown as BodyInit, {
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
