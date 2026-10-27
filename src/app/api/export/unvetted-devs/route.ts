// ⬇️ CSV of the UNVETTED developers (Jon 2026-10-27: pull them into DirectREI for Marie to
// mass-call). The whole DS: Developers pipeline minus the ✅ Vetted / ✕ Not-a-fit stages.
// C-suite only — same lock as the vetted-buyer export (never widen).
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET() {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — CSV export is restricted to the C-suite" }, { status: 403 });

  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const opps = net.dev.length ? await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.dev }, stage: { notIn: ["vetted", "not_fit"] } },
    select: { title: true, formData: true, contact: { select: { name: true, phone: true, altPhone: true, email: true } } },
    orderBy: { createdAt: "desc" },
  }) : [];

  const header = ["Name", "Phone", "Phone 2", "Email", "Company", "Market / Area"];
  const lines = opps.map((o) => {
    const fd = (o.formData ?? {}) as Record<string, unknown>;
    const imp = (fd.__import ?? {}) as { market?: string };
    const src = (fd.__migratedSource ?? {}) as { market?: string; buyBoxAreas?: string; company?: string };
    const form = (fd.dev_buybox ?? {}) as { buyCounties?: string; brokerage?: string };
    const market = imp.market || src.market || form.buyCounties || src.buyBoxAreas || "";
    const company = src.company || form.brokerage || "";
    return [o.contact?.name || o.title, o.contact?.phone, o.contact?.altPhone, o.contact?.email, company, market].map(esc).join(",");
  });

  const csv = [header.map(esc).join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="unvetted-developers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
