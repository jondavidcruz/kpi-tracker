import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, canViewLogins, onAccessList } from "@/lib/auth";
import { decryptSecret, vaultConfigured } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reveal a software password — decrypts server-side, logs who/when, and returns
 * the value only to a manager/admin or someone named in the tool's access list.
 * The plaintext never lives in the page; it's fetched on an explicit click.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "sign in" }, { status: 401 });

  const sw = await db.software.findUnique({ where: { id } });
  if (!sw || !sw.secret) return NextResponse.json({ error: "no password stored" }, { status: 404 });

  // Certified core team + managers see every login; others need to be named on
  // this tool's access list (matched by first OR full name).
  const allowed = canViewLogins(me) || onAccessList(sw.accessList, me);
  if (!allowed) return NextResponse.json({ error: "no access" }, { status: 403 });

  if (!vaultConfigured()) return NextResponse.json({ error: "vault not set up" }, { status: 503 });

  let secret: string;
  try {
    secret = decryptSecret(sw.secret);
  } catch {
    return NextResponse.json({ error: "decrypt failed" }, { status: 500 });
  }

  await db.secretAccess.create({ data: { softwareId: sw.id, softwareName: sw.name, viewedBy: me.name } });
  return NextResponse.json({ secret });
}
