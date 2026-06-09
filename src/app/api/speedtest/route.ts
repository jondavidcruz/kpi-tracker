// Serves a fixed-size payload the browser downloads + times to estimate Mbps.
// Public (no session): it's just random bytes, no data. Used by the speed-test
// button on the Enter KPIs screen.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// 3 MB of bytes — big enough to get a stable read on slow connections,
// small enough not to be a burden.
const SIZE = 3 * 1024 * 1024;

export async function GET() {
  const buf = new Uint8Array(SIZE); // zero-filled is fine; size is what matters
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(SIZE),
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
