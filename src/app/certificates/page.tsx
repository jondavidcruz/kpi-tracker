import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// 🎓 Team certificates (Jon 2026-10-08): printable recognition for completing
// the full A→Z process in their seat — part of the trial-period ladder. New
// acquisitions reps earn it by getting a contract signed on their own.
// certifiedOn: the day they actually earned it (Jon can correct any of these —
// defaults to the issue date). started: real start date with the company when
// known; otherwise falls back to their War Room account date.
const CERTS: Array<{ first: string; title: string; track: string; criteria: string; started?: string; certifiedOn?: string }> = [
  { first: "michelle", title: "Certified Acquisitions Specialist", track: "Acquisitions", criteria: "Mastered the full seller journey — first call to signed contract" },
  { first: "nick", title: "Certified Acquisitions Specialist", track: "Acquisitions", criteria: "Completed the A→Z acquisitions process independently — first contract signed solo" },
  { first: "sharyn", title: "Certified Dispositions Specialist", track: "Dispositions", criteria: "Mastered the 24-hour dispo machine — comp to closed" },
  { first: "marie", title: "Certified Dispositions Specialist", track: "Dispositions", criteria: "Mastered the 24-hour dispo machine — comp to closed" },
];

function tenure(from: Date): string {
  const months = Math.max(1, Math.round((Date.now() - from.getTime()) / (30.44 * 86400_000)));
  return months >= 12 ? `${Math.floor(months / 12)} year${months >= 24 ? "s" : ""} ${months % 12 ? `${months % 12} mo` : ""}`.trim() : `${months} month${months === 1 ? "" : "s"}`;
}

export default async function CertificatesPage() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return <Card className="p-10 text-center text-slate-400">Certificates are issued by leadership.</Card>;
  const users = await db.user.findMany({ where: { active: true }, select: { name: true, createdAt: true } });
  const byFirst = new Map(users.map((u) => [u.name.trim().split(/\s+/)[0].toLowerCase(), u]));
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionTitle title="🎓 Team Certificates" subtitle="Printable recognition for mastering the full A→Z process. Print (Cmd+P) → each certificate lands on its own page — save as PDF and send it to them." accent="bg-brand-gold" />
      </div>

      {CERTS.map((c) => {
        const u = byFirst.get(c.first);
        if (!u) return null;
        return (
          <div key={c.first} className="mx-auto max-w-3xl break-after-page">
            <div className="relative overflow-hidden rounded-sm border-[6px] border-double border-amber-700/70 bg-[#fffdf5] px-10 py-12 text-center shadow-lg">
              <div className="pointer-events-none absolute inset-3 rounded-sm border border-amber-700/30" />
              <div className="font-serif text-xs uppercase tracking-[0.5em] text-amber-800/70" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Freedom Offers</div>
              <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Certificate of Mastery</div>
              <div className="mt-6 text-sm italic text-slate-500">This certifies that</div>
              <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{u.name}</div>
              <div className="mx-auto mt-3 h-px w-48 bg-amber-700/40" />
              <div className="mt-4 text-lg font-bold text-amber-900">{c.title}</div>
              <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">{c.criteria} — earned through {tenure(u.createdAt)} of proven work on the Freedom Offers {c.track} team.</div>
              <div className="mt-4 flex items-center justify-center gap-6 text-[11px] font-semibold text-slate-500">
                <span>📅 Joined Freedom Offers · {c.started ?? u.createdAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                <span className="text-amber-700/50">✦</span>
                <span>🏅 Certified · {c.certifiedOn ?? today}</span>
              </div>
              <div className="mt-10 flex items-end justify-between px-6">
                <div className="text-left">
                  <div className="-mb-1 text-3xl text-slate-800" style={{ fontFamily: '"Snell Roundhand", "Savoye LET", "Brush Script MT", "Segoe Script", cursive', transform: "rotate(-2deg)" }}>Jonathan Cruz</div>
                  <div className="h-px w-44 bg-slate-400" />
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">Jonathan Cruz · President, Freedom Offers LLC</div>
                </div>
                <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-amber-700/60 text-center">
                  <div>
                    <div className="text-[8px] font-bold uppercase tracking-widest text-amber-800">Certified</div>
                    <div className="text-xl">🏅</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="h-px w-44 bg-slate-400" />
                  <div className="mt-1 text-[11px] font-semibold text-slate-500">Issued {today}</div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <Card className="p-4 text-xs text-slate-500 print:hidden">
        🪜 The ladder for new acquisitions reps (iPhone trial period): survive the ramp → run the A→Z process solo → first signed contract → certified, and the team celebrates it. Nick earned his in month two.
      </Card>
    </div>
  );
}
