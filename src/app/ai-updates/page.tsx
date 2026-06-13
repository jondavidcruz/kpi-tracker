import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { setSuggestionStatus } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";
import type { Suggestion } from "@prisma/client";

export const dynamic = "force-dynamic";

const impactCls: Record<string, string> = {
  high: "bg-emerald-100 text-emerald-700",
  med: "bg-amber-100 text-amber-700",
  low: "bg-slate-100 text-slate-500",
};
const catCls = "bg-sky-100 text-sky-700";

export default async function AiUpdatesPage() {
  const me = await getCurrentUser();
  if (!isManager(me)) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Managers only</h1>
        <Link href="/dashboard" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Back</Link>
      </Card>
    );
  }

  const all = await db.suggestion.findMany({ orderBy: { createdAt: "desc" } });
  const proposed = all.filter((s) => s.status === "proposed");
  const accepted = all.filter((s) => s.status === "accepted");
  const archive = all.filter((s) => s.status === "declined" || s.status === "done");

  return (
    <div className="space-y-7">
      <SectionTitle
        title="🤖 AI Updates"
        subtitle="Improvements the assistant recommends for the tracker. You decide — nothing is auto-applied."
        accent="bg-violet-400"
      />

      {/* Proposed — needs a decision */}
      <section>
        <h2 className="mb-2 text-sm font-bold text-slate-700">💡 Recommended for review ({proposed.length})</h2>
        {proposed.length === 0 ? (
          <Card className="p-8 text-center text-slate-400">No new recommendations right now. New ideas show up here as the tracker is analyzed.</Card>
        ) : (
          <div className="space-y-3">
            {proposed.map((s) => <SuggestionCard key={s.id} s={s} stage="proposed" />)}
          </div>
        )}
      </section>

      {/* Accepted — greenlit to build */}
      {accepted.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-slate-700">✅ Accepted — queued to build ({accepted.length})</h2>
          <div className="space-y-3">
            {accepted.map((s) => <SuggestionCard key={s.id} s={s} stage="accepted" />)}
          </div>
        </section>
      )}

      {/* Archive */}
      {archive.length > 0 && (
        <details className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <summary className="cursor-pointer text-sm font-semibold text-slate-600">📁 Declined / done ({archive.length})</summary>
          <div className="mt-3 space-y-2">
            {archive.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 ring-1 ring-slate-100">
                <span className="text-sm text-slate-600">
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${s.status === "done" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>{s.status === "done" ? "DONE" : "DECLINED"}</span>
                  {s.title}
                </span>
                <form action={setSuggestionStatus}>
                  <input type="hidden" name="id" value={s.id} />
                  <input type="hidden" name="status" value="proposed" />
                  <button className="text-xs font-semibold text-slate-400 hover:text-slate-700">Reopen</button>
                </form>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SuggestionCard({ s, stage }: { s: Suggestion; stage: "proposed" | "accepted" }) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {s.category && <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${catCls}`}>{s.category}</span>}
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${impactCls[s.impact] ?? impactCls.med}`}>{s.impact.toUpperCase()} IMPACT</span>
        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">EFFORT {s.effort}</span>
      </div>
      <p className="mt-2 font-semibold text-slate-800">{s.title}</p>
      {s.rationale && <p className="mt-1 text-sm text-slate-600">{s.rationale}</p>}

      <form action={setSuggestionStatus} className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <input type="hidden" name="id" value={s.id} />
        {stage === "proposed" ? (
          <>
            <button name="status" value="accepted" className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">✓ Accept</button>
            <button name="status" value="declined" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100">Decline</button>
            <span className="ml-2 text-xs text-slate-400">Accepting just flags it for me to build — tell me when you want it done.</span>
          </>
        ) : (
          <>
            <button name="status" value="done" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">Mark done</button>
            <button name="status" value="declined" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100">Decline</button>
          </>
        )}
      </form>
    </Card>
  );
}
