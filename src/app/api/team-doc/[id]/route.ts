import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// Streams a team member's uploaded HR document (signed agreement). Owner only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const doc = await db.teamDoc.findUnique({ where: { id }, select: { data: true, filename: true, contentType: true } });
  if (!doc?.data) return new Response("Not found", { status: 404 });

  const bytes = doc.data as unknown as Buffer;
  const safeName = (doc.filename || "document").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
