import { NextResponse } from "next/server";
import { getCurrentUser, isManager } from "@/lib/auth";
import { commsFor } from "@/lib/crm-comms";
import { provisionAndToken } from "@/lib/telnyx-webrtc";

export const dynamic = "force-dynamic";

export async function POST() {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });
  if (!(await commsFor(me!)).call) return NextResponse.json({ error: "Calling isn't enabled for you — ask Jon (Comms access on /crm)." }, { status: 403 });
  const r = await provisionAndToken();
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
  return NextResponse.json({ token: r.token, callerId: r.callerId, rep: me!.name });
}
