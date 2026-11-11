import { db } from "@/lib/db";
import { verifyBookToken } from "@/lib/book-token";
import BookingClient from "@/components/BookingClient";

export const dynamic = "force-dynamic";

// 📅 Public, no-login self-booking page (Jon 2026-11-11): a seller taps a time and we book the call
// + send them a calendar invite. Reached via the signed link reps paste into a text/email.

// PT offset (−8 PST / −7 PDT) for a given day, read from Intl so DST is automatic.
function ptOffset(at: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" })
    .formatToParts(at).find((p) => p.type === "timeZoneName")?.value || "GMT-8";
  const m = s.match(/GMT([+-]\d+)/);
  return m ? parseInt(m[1], 10) : -8;
}

type Slot = { iso: string; label: string };
type Day = { heading: string; slots: Slot[] };

function nextSlots(): Day[] {
  const HOURS = [9, 11, 14, 16]; // 9a, 11a, 2p, 4p Pacific
  const fmtYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
  const fmtHead = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "long", month: "short", day: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" });
  const days: Day[] = [];
  for (let i = 1; i <= 12 && days.length < 6; i++) {
    const probe = new Date(Date.now() + i * 86_400_000);
    const [y, m, d] = fmtYmd.format(probe).split("-").map(Number);
    const noon = new Date(Date.UTC(y, m - 1, d, 12));
    const dow = noon.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    const off = ptOffset(noon);
    const slots: Slot[] = HOURS.map((h) => {
      const at = new Date(Date.UTC(y, m - 1, d, h - off));
      return { iso: at.toISOString(), label: fmtTime.format(at) };
    });
    days.push({ heading: fmtHead.format(noon), slots });
  }
  return days;
}

export default async function BookPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const oppId = verifyBookToken(token);
  const opp = oppId ? await db.crmOpportunity.findUnique({ where: { id: oppId }, select: { assignedTo: true, contact: { select: { name: true, address: true } } } }) : null;

  if (!oppId || !opp) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">⌛</div>
        <h1 className="text-xl font-bold text-slate-800">This link isn&apos;t valid</h1>
        <p className="mt-2 text-sm text-slate-500">It may have expired. Just reply to our last message and we&apos;ll get you a new time.</p>
      </div>
    );
  }

  const rep = (opp.assignedTo || "our team").split(" ")[0];
  const first = (opp.contact?.name || "there").split(" ")[0];
  const address = opp.contact?.address || "your property";
  return (
    <div className="mx-auto mt-8 max-w-lg px-4 pb-20">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-1 text-3xl">📅</div>
        <h1 className="text-2xl font-black text-slate-800">Pick a time for your call</h1>
        <p className="mt-1 text-sm text-slate-500">
          Hi {first}! Choose a time that works and {rep} will call you about <b>{address}</b>. Times are Pacific.
        </p>
        <BookingClient token={token} days={nextSlots()} rep={rep} />
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400">Prefer a different time? Just reply to our last text or email.</p>
    </div>
  );
}
