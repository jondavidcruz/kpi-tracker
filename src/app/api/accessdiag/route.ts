import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { navAllowlist } from "@/lib/auth";
import { parseNavHidden, NAV_GROUPS } from "@/lib/navItems";

const DEPT_GROUPS: Record<string, string[]> = {
  acquisitions: ["Team Overview", "Acquisitions", "Performance", "Coaching", "EOS", "Requests & Support"],
  dispositions: ["Team Overview", "Dispositions", "Marketing", "Performance", "Coaching", "EOS", "Requests & Support"],
};

// POST {first, dept, also?:string[]} — clears the onboarding lock and applies a
// department access preset to a user (owner fix path; bearer-gated).
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ ok: false }, { status: 401 });
  let b: { first?: string; dept?: string } = {};
  try { b = await req.json(); } catch { /* none */ }
  const first = (b.first || "").toLowerCase().trim();
  const groups = DEPT_GROUPS[b.dept || ""];
  if (!first || !groups) return NextResponse.json({ ok: false, error: "need {first, dept:acquisitions|dispositions}" });
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const u = users.find((x) => x.name.toLowerCase().split(/\s+/)[0] === first) || users.find((x) => x.name.toLowerCase().includes(first));
  if (!u) return NextResponse.json({ ok: false, error: "not found", names: users.map((x) => x.name) });
  const allow = new Set(NAV_GROUPS.filter((g) => groups.includes(g.group)).flatMap((g) => g.items.map((i) => i.href)));
  if (b.dept === "acquisitions") allow.delete("/crm/conversations"); // notes-only reps don't get the comms inbox
  const navHidden = JSON.stringify(NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)).filter((h) => !allow.has(h)));
  await db.user.update({ where: { id: u.id }, data: { navHidden, accessMarketing: b.dept === "dispositions", onboarding: false } });
  return NextResponse.json({ ok: true, fixed: u.name, dept: b.dept, onboardingCleared: true, granted: [...allow] });
}

// 🔎 Owner diagnostic (Jon 2026-10-19: "I grant access but reps still can't see
// it"): reports a user's real access-governing state so we can see WHY a page is
// hidden — onboarding lock, navHidden, allowlist. Bearer-gated (CRON_SECRET).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const first = (url.searchParams.get("first") || "").toLowerCase().trim();
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, role: true, position: true, onboarding: true, navHidden: true, accessMarketing: true } });
  if (!first) return NextResponse.json({ ok: true, users: users.map((u) => ({ name: u.name, onboarding: u.onboarding, role: u.role, position: u.position })) });
  const u = users.find((x) => x.name.toLowerCase().split(/\s+/)[0] === first) || users.find((x) => x.name.toLowerCase().includes(first));
  if (!u) return NextResponse.json({ ok: false, error: "not found", names: users.map((x) => x.name) });
  const allow = navAllowlist(u as { name: string; onboarding?: boolean });
  const hidden = parseNavHidden(u.navHidden);
  return NextResponse.json({
    ok: true, name: u.name, role: u.role, position: u.position,
    onboarding: u.onboarding, accessMarketing: u.accessMarketing,
    navAllowlist_result: allow === null ? "null (unrestricted — sees all minus hidden/role)" : allow,
    onboardingLockActive: !!u.onboarding,
    hiddenCount: hidden.length, hidden,
  });
}
