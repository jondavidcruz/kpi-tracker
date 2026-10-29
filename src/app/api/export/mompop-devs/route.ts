// ⬇️ CSV of our MOM & POP developers (Jon 2026-10-28, overnight): the local/agile builders
// to target first — pull into DirectREI for a mass SMS/email/call. Classified by the shared
// builder-size classifier (team overrides on formData.__builderSize win). C-suite only.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isCSuitePerson } from "@/lib/auth";
import { classifyBuilderSize } from "@/lib/builder-size";

export const dynamic = "force-dynamic";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!isCSuitePerson(me)) return NextResponse.json({ error: "forbidden — CSV export is restricted to the C-suite" }, { status: 403 });
  const onlyWithContact = new URL(req.url).searchParams.get("reachable") === "1";

  const { resolveNetworkPipelines } = await import("@/lib/dispo-network");
  const net = await resolveNetworkPipelines();
  const opps = net.dev.length ? await db.crmOpportunity.findMany({
    where: { archivedAt: null, pipeline: { in: net.dev } },
    select: { title: true, stage: true, formData: true, contact: { select: { name: true, phone: true, altPhone: true, email: true } } },
    orderBy: { createdAt: "desc" },
  }) : [];

  const header = ["Name", "Phone", "Phone 2", "Email", "Company", "Market / Area", "Size", "Stage"];
  const lines: string[] = [];
  for (const o of opps) {
    const fd = (o.formData ?? {}) as Record<string, unknown>;
    const imp = (fd.__import ?? {}) as { market?: string; buyBox?: string };
    const src = (fd.__migratedSource ?? {}) as { market?: string; buyBoxAreas?: string; company?: string; buyBox?: string };
    const form = (fd.dev_buybox ?? {}) as { buyCounties?: string; brokerage?: string; volume?: string };
    const bb = (fd.__buyBoxStruct ?? null) as { geo?: { nationwide?: boolean; states?: string[] }; status?: { volume_note?: string } } | null;
    const size = classifyBuilderSize({
      name: o.contact?.name || o.title,
      override: (fd.__builderSize as string | undefined) ?? null,
      nationwide: bb?.geo?.nationwide === true,
      statesCount: bb?.geo?.states?.length ?? 0,
      volumeText: bb?.status?.volume_note || form.volume || "",
      extraText: src.buyBox || imp.buyBox || "",
    });
    if (size !== "mompop") continue;
    if (onlyWithContact && !(o.contact?.phone || o.contact?.altPhone || o.contact?.email)) continue;
    const market = imp.market || src.market || form.buyCounties || src.buyBoxAreas || "";
    const company = src.company || form.brokerage || "";
    lines.push([o.contact?.name || o.title, o.contact?.phone, o.contact?.altPhone, o.contact?.email, company, market, "Mom & Pop", o.stage].map(esc).join(","));
  }

  const csv = [header.map(esc).join(","), ...lines].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mompop-developers-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
