import { db } from "@/lib/db";
import { getCurrentUser, isManager, isAdmin } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { readCerts } from "@/lib/certs";
import { awardCertAction, sendCertAction, removeCertAction } from "./cert-actions";

export const dynamic = "force-dynamic";

// 🎓 Team certificates (Jon 2026-10-08): printable recognition for completing
// the full A→Z process in their seat — part of the trial-period ladder. New
// acquisitions reps earn it by getting a contract signed on their own.
// certifiedOn: the day they actually earned it (Jon can correct any of these —
// defaults to the issue date). started: real start date with the company when
// known; otherwise falls back to their War Room account date.
// Grandfathered veterans who keep the Mastery cert regardless. New reps (incl.
// Nick + Kyle) must EARN it by closing a deal (Jon 2026-10-16: "remove Nick's
// certification until he closes a deal") — that's handled dynamically below.
const CERTS: Array<{ first: string; title: string; track: string; criteria: string; started?: string; certifiedOn?: string }> = [
  { first: "michelle", title: "Certified Acquisitions Specialist", track: "Acquisitions", criteria: "Mastered the full seller journey — first call to signed contract" },
  { first: "sharyn", title: "Certified Dispositions Specialist", track: "Dispositions", criteria: "Mastered the 24-hour dispo machine — comp to closed" },
  { first: "marie", title: "Certified Dispositions Specialist", track: "Dispositions", criteria: "Mastered the 24-hour dispo machine — comp to closed" },
];
const TRACK_CERT: Record<string, { title: string; track: string; criteria: string }> = {
  acquisitions: { title: "Certified Acquisitions Specialist", track: "Acquisitions", criteria: "Completed the A→Z acquisitions process independently — first contract signed solo" },
  cc_lm: { title: "Certified Acquisitions Specialist", track: "Acquisitions", criteria: "Completed the A→Z acquisitions process independently — first contract signed solo" },
  dispositions: { title: "Certified Dispositions Specialist", track: "Dispositions", criteria: "Mastered the 24-hour dispo machine — comp to closed" },
};

function tenure(from: Date): string {
  const months = Math.max(1, Math.round((Date.now() - from.getTime()) / (30.44 * 86400_000)));
  return months >= 12 ? `${Math.floor(months / 12)} year${months >= 24 ? "s" : ""} ${months % 12 ? `${months % 12} mo` : ""}`.trim() : `${months} month${months === 1 ? "" : "s"}`;
}

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ awarded?: string; sent?: string; senterr?: string }> }) {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return <Card className="p-10 text-center text-slate-400">Certificates are issued by leadership.</Card>;
  const sp = await searchParams;
  const owner = isAdmin(me);
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, name: true, createdAt: true, position: true } });
  const certMap = await readCerts();
  // 🏅 Certified = closed a deal (Jon 2026-10-16). Build the set of reps who have
  // a closed Deal (matched by first name) + their first-close date. Any rep NOT
  // grandfathered earns their Mastery cert the moment their first deal closes.
  const closedDeals = await db.deal.findMany({ where: { soldDate: { not: "" } }, select: { assignedTo: true, soldDate: true } }).catch(() => [] as { assignedTo: string; soldDate: string }[]);
  const firstCloseByFirst = new Map<string, string>();
  for (const d of closedDeals) {
    const f = (d.assignedTo || "").trim().split(/\s+/)[0]?.toLowerCase();
    if (!f) continue;
    const cur = firstCloseByFirst.get(f);
    if (!cur || (d.soldDate && d.soldDate < cur)) firstCloseByFirst.set(f, d.soldDate || "");
  }
  const byFirst = new Map(users.map((u) => [u.name.trim().split(/\s+/)[0].toLowerCase(), u]));
  // Real joined dates live on the roster (TeamProfile.startDate) — the War Room
  // account date is only the fallback (Jon 2026-10-08: "the joined date was wrong").
  const profiles = await db.teamProfile.findMany({ select: { userId: true, startDate: true } });
  const startByUser = new Map(profiles.filter((p) => p.userId && p.startDate).map((p) => [p.userId as string, p.startDate]));
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  // Reps (not already grandfathered) who EARNED the Mastery cert by closing a deal.
  const staticFirsts = new Set(CERTS.map((c) => c.first));
  const earnedCerts = users
    .filter((u) => {
      const f = u.name.trim().split(/\s+/)[0].toLowerCase();
      return !staticFirsts.has(f) && firstCloseByFirst.has(f) && TRACK_CERT[u.position ?? ""];
    })
    .map((u) => {
      const f = u.name.trim().split(/\s+/)[0].toLowerCase();
      const t = TRACK_CERT[u.position ?? ""];
      return { first: f, title: t.title, track: t.track, criteria: t.criteria, started: undefined as string | undefined, certifiedOn: firstCloseByFirst.get(f) || today };
    });

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <SectionTitle title="🎓 Team Certificates" subtitle="Recognition for mastering the process + a certificate for every deal closed. Print (Cmd+P) for PDFs, or hit Send to email them straight to the person." accent="bg-brand-gold" />
      </div>

      {sp.awarded && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 print:hidden">✓ Certificate awarded.</div>}
      {sp.sent && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 print:hidden">✉️ Certificate(s) emailed to {decodeURIComponent(sp.sent)}.</div>}
      {sp.senterr && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200 print:hidden">Couldn&apos;t send: {sp.senterr === "noemail" ? "no email on file" : sp.senterr === "nocerts" ? "they have no certificates yet" : "send failed"}.</div>}

      {/* 🎖 Owner tools: award a custom cert + per-person manage/send (Jon 2026-10-15) */}
      {owner && (
        <Card className="p-4 print:hidden">
          <div className="mb-2 text-sm font-extrabold text-slate-800">🎖 Award a certificate</div>
          <form action={awardCertAction} className="mb-3 flex flex-wrap items-end gap-2">
            <label className="flex flex-col"><span className="mb-0.5 text-[11px] font-semibold text-slate-500">Who</span>
              <select name="userId" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" required>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col"><span className="mb-0.5 text-[11px] font-semibold text-slate-500">Certificate title</span><input name="title" required placeholder="Top Closer — October" className="w-56 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
            <label className="flex flex-col"><span className="mb-0.5 text-[11px] font-semibold text-slate-500">What they did (optional)</span><input name="detail" placeholder="Closed 3 deals in a single month" className="w-72 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
            <button className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Award</button>
          </form>
          <div className="space-y-1.5">
            {users.map((u) => { const cs = certMap[u.id] ?? []; return (
              <div key={u.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs ring-1 ring-slate-100">
                <span className="font-bold text-slate-700">{u.name}</span>
                <span className="text-slate-400">{cs.length} cert{cs.length === 1 ? "" : "s"}{cs.filter((c) => c.kind === "deal").length ? ` · ${cs.filter((c) => c.kind === "deal").length} 🏆 deal` : ""}</span>
                {cs.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 ring-1 ring-slate-200">{c.title}
                    <form action={removeCertAction}><input type="hidden" name="userId" value={u.id} /><input type="hidden" name="id" value={c.id} /><button className="text-[10px] font-bold text-slate-300 hover:text-red-600" title="Remove">✕</button></form>
                  </span>
                ))}
                {cs.length > 0 && <form action={sendCertAction} className="ml-auto"><input type="hidden" name="userId" value={u.id} /><button className="rounded-lg bg-brand-navy px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90">✉️ Send to {u.name.split(" ")[0]}</button></form>}
              </div>
            ); })}
          </div>
        </Card>
      )}

      {/* 🏆 Earned certificates (deal closes + custom awards) — printable */}
      {users.flatMap((u) => (certMap[u.id] ?? []).map((c) => (
        <div key={c.id} className="mx-auto max-w-3xl break-after-page">
          <div className="relative overflow-hidden rounded-sm border-[6px] border-double border-amber-700/70 bg-[#fffdf5] px-10 py-12 text-center shadow-lg">
            <div className="pointer-events-none absolute inset-3 rounded-sm border border-amber-700/30" />
            <div className="font-serif text-xs uppercase tracking-[0.5em] text-amber-800/70" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>Freedom Offers</div>
            <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">Certificate of Achievement</div>
            <div className="mt-6 text-sm italic text-slate-500">This certifies that</div>
            <div className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900" style={{ fontFamily: "var(--font-display), Georgia, serif" }}>{u.name}</div>
            <div className="mx-auto mt-3 h-px w-48 bg-amber-700/40" />
            <div className="mt-4 text-lg font-bold text-amber-900">{c.kind === "deal" ? "🏆 " : ""}{c.title}</div>
            {c.detail && <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">{c.detail}</div>}
            <div className="mt-10 flex items-end justify-between px-6">
              <div className="text-left">
                <div className="-mb-1 text-3xl text-slate-800" style={{ fontFamily: '"Snell Roundhand", "Savoye LET", "Brush Script MT", "Segoe Script", cursive', transform: "rotate(-2deg)" }}>Jonathan Cruz</div>
                <div className="h-px w-44 bg-slate-400" />
                <div className="mt-1 text-[11px] font-semibold text-slate-500">Jonathan Cruz · President, Freedom Offers LLC</div>
              </div>
              <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-amber-700/60 text-center"><div><div className="text-[8px] font-bold uppercase tracking-widest text-amber-800">Earned</div><div className="text-xl">🎖</div></div></div>
              <div className="text-right"><div className="h-px w-44 bg-slate-400" /><div className="mt-1 text-[11px] font-semibold text-slate-500">Issued {c.issuedOn}</div></div>
            </div>
          </div>
        </div>
      )))}

      {[...CERTS, ...earnedCerts].map((c) => {
        const u = byFirst.get(c.first);
        if (!u) return null;
        const startRaw = c.started ?? startByUser.get(u.id) ?? "";
        const startDate = startRaw ? new Date(startRaw + "T12:00:00Z") : u.createdAt;
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
              <div className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-slate-600">{c.criteria} — earned through {tenure(startDate)} of proven work on the Freedom Offers {c.track} team.</div>
              <div className="mt-4 flex items-center justify-center gap-6 text-[11px] font-semibold text-slate-500">
                <span>📅 Joined Freedom Offers · {startDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</span>
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
        🪜 The ladder for new acquisitions reps: survive the ramp → run the A→Z process solo → <b>close their first deal</b> → the Certified Specialist certificate generates automatically, and the team celebrates it. (No certificate until that first close.)
      </Card>
    </div>
  );
}
