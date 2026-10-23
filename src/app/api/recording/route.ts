import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAccessToken, gdriveConfigured } from "@/lib/gdrive";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 🎧 Stream a call recording through the app so the in-app <audio> player can PLAY +
// SEEK it (Jon 2026-10-23: recordings weren't playing). Google Drive's uc?export=
// download URL doesn't honor HTTP Range, so the player shows 0:00/0:00. This proxies
// the file from Drive via the service account WITH Range support. Auth-gated.
function driveId(s: string): string {
  const m = s.match(/[?&]id=([^&]+)/) || s.match(/\/d\/([^/]+)/) || s.match(/\/file\/d\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : s;
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return new NextResponse("unauthorized", { status: 401 });
  if (!gdriveConfigured()) return new NextResponse("drive not configured", { status: 503 });
  const raw = req.nextUrl.searchParams.get("id") || req.nextUrl.searchParams.get("url") || "";
  const id = driveId(raw).trim();
  if (!id) return new NextResponse("no id", { status: 400 });
  try {
    const token = await getAccessToken();
    const range = req.headers.get("range") || "";
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}`, ...(range ? { Range: range } : {}) },
      cache: "no-store",
    });
    if (r.status !== 200 && r.status !== 206) return new NextResponse("recording unavailable", { status: r.status === 404 ? 404 : 502 });
    const headers = new Headers();
    headers.set("Content-Type", r.headers.get("content-type") || "audio/mpeg");
    headers.set("Accept-Ranges", "bytes");
    const cr = r.headers.get("content-range"); if (cr) headers.set("Content-Range", cr);
    const cl = r.headers.get("content-length"); if (cl) headers.set("Content-Length", cl);
    headers.set("Cache-Control", "private, max-age=3600");
    return new NextResponse(r.body, { status: r.status, headers });
  } catch (e) {
    return new NextResponse("error: " + String(e).slice(0, 120), { status: 500 });
  }
}
