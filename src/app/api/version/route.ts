import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Which build is actually serving? Returns the git SHA Vercel baked into this
// deployment. THE deploy check: after a push, poll until `sha` starts with your
// commit — a 200 from any page only proves the LAST good build is still up
// (2026-10-01: five broken deploys hid behind healthy-looking /tv checks).
export async function GET() {
  return NextResponse.json({
    sha: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
    at: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 80) ?? "",
  });
}
