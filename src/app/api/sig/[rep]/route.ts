import { NextRequest, NextResponse } from "next/server";
import { readSignatureImage } from "@/lib/crm-comms";

// 🖼 Serves a rep's email-signature image so outgoing emails can reference it by a
// real URL (renders reliably in email clients, unlike inline data URIs). Public by
// design — it's just a signature graphic (Jon 2026-10-21).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ rep: string }> }) {
  const { rep } = await params;
  const img = await readSignatureImage(decodeURIComponent(rep || "").toLowerCase());
  if (!img) return new NextResponse("not found", { status: 404 });
  try {
    const bytes = Buffer.from(img.data, "base64");
    return new NextResponse(bytes, {
      status: 200,
      headers: { "Content-Type": img.type || "image/png", "Cache-Control": "public, max-age=300" },
    });
  } catch {
    return new NextResponse("bad image", { status: 500 });
  }
}
