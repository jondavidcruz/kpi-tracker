import { db } from "@/lib/db";
import { getCurrentUser, isAdmin } from "@/lib/auth";

// Streams a closed deal's HUD statement (verification proof). Owner-only.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getCurrentUser();
  if (!isAdmin(me)) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const deal = await db.closedDeal.findUnique({
    where: { id },
    select: { hudData: true, hudName: true, hudType: true },
  });
  if (!deal?.hudData) return new Response("No HUD on file", { status: 404 });

  const bytes = deal.hudData as unknown as Buffer;
  const safeName = (deal.hudName || "hud").replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": deal.hudType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
