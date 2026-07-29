import Link from "next/link";
import { setMyPassword, saveMyAddress } from "@/app/actions";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { positionLabel } from "@/lib/roles";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200";
const labelCls = "mb-1 block text-xs font-semibold text-slate-500";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ pwok?: string; pwerr?: string; gemini?: string; addr?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return null;
  const sp = await searchParams;
  const profile = await db.teamProfile.findUnique({ where: { userId: me.id }, select: { address: true } });

  return (
    <div className="mx-auto max-w-lg space-y-5">
      <SectionTitle title="👤 My Account" subtitle="Your login and password" accent="bg-brand-navy" />

      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-navy text-sm font-bold text-brand-gold-soft">
            {me.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <div>
            <div className="font-bold text-slate-800">{me.name}</div>
            <div className="text-xs text-slate-400">{me.email} · {me.position ? positionLabel(me.position) : me.role}</div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">🔑 Change my password</h3>
        <p className="mb-3 text-xs text-slate-500">Set a new password for signing in. You&apos;ll use your email + this password next time.</p>

        {sp.pwok && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Password updated.</div>}
        {sp.pwerr === "short" && <div className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">Password must be at least 8 characters.</div>}
        {sp.pwerr === "1" && <div className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">Couldn&apos;t update — try again.</div>}

        <form action={setMyPassword} className="space-y-3">
          <input type="hidden" name="to" value="/account" />
          <label><span className={labelCls}>New password (8+ characters)</span>
            <input type="password" name="password" autoComplete="new-password" minLength={8} required placeholder="••••••••" className={inputCls} />
          </label>
          <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Update password</button>
        </form>
      </Card>

      <Card className="p-5">
        <h3 className="mb-1 text-sm font-bold text-slate-700">📮 My mailing address</h3>
        <p className="mb-3 text-xs text-slate-500">So the team knows where to ship reward gifts. Only you and Jon can see this.</p>
        {sp.addr && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Address saved.</div>}
        <form action={saveMyAddress} className="space-y-3">
          <label><span className={labelCls}>Full mailing address (name, street, city, state/region, ZIP, country)</span>
            <textarea name="address" rows={3} defaultValue={profile?.address ?? ""} placeholder="Jane Dela Cruz&#10;123 Mabini St, Barangay …&#10;Cebu City, Cebu 6000&#10;Philippines" className={inputCls} />
          </label>
          <button className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Save address</button>
        </form>
      </Card>

      <Link href="/dashboard" className="inline-block text-sm font-semibold text-brand-navy hover:underline">← Back to dashboard</Link>
    </div>
  );
}
