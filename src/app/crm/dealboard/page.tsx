import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import Link from "next/link";
import DealBoard from "@/components/DealBoard";
import { readBoards, createDealBoardAction, deleteDealBoardAction } from "./actions";

export const dynamic = "force-dynamic";

// 🗂 Deal Board — a freeform whiteboard for dispositions (Jon 2026-10-14): lay
// out a buyer's multi-parcel, multi-seller deal and price each parcel.
export default async function DealBoardPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const me = await getCurrentUser();
  const allowed = !!me && (isManager(me) || ["acquisitions", "cc_lm", "dispositions"].includes(me.position ?? ""));
  if (!allowed) return <Card className="p-10 text-center text-slate-400">The Deal Board is for dispositions + managers.</Card>;
  const sp = await searchParams;
  const map = await readBoards();
  const list = Object.values(map).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const current = (sp.b && map[sp.b]) || list[0] || null;

  return (
    <div className="space-y-3">
      <SectionTitle title="🗂 Deal Board" subtitle="A whiteboard for dispositions — draw and type freely to lay out a buyer's parcels across sellers, pull in what each seller wants, and price every parcel above it so no deal loses money." accent="bg-brand-gold" />
      {/* board tabs + create */}
      <Card className="flex flex-wrap items-center gap-2 p-2.5">
        {list.map((b) => (
          <span key={b.id} className={`flex items-center gap-1 rounded-full px-1 ${current?.id === b.id ? "bg-brand-navy" : "bg-slate-100"}`}>
            <Link href={`/crm/dealboard?b=${b.id}`} className={`rounded-full px-3 py-1.5 text-xs font-bold ${current?.id === b.id ? "text-white" : "text-slate-600 hover:text-slate-900"}`}>{b.name}</Link>
            {current?.id === b.id && list.length > 1 && (
              <form action={deleteDealBoardAction}><input type="hidden" name="id" value={b.id} /><button className="pr-2 text-[11px] font-bold text-white/60 hover:text-white" title="Delete board">✕</button></form>
            )}
          </span>
        ))}
        <form action={createDealBoardAction} className="flex items-center gap-1">
          <input name="name" placeholder="New board name (e.g. buyer name)…" className="w-56 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" />
          <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700">＋ New board</button>
        </form>
      </Card>
      {current ? (
        <DealBoard key={current.id} board={current} />
      ) : (
        <Card className="p-10 text-center text-sm text-slate-400">No boards yet — name one above (usually the buyer&apos;s name) and hit <b>New board</b> to start laying out the deal.</Card>
      )}
    </div>
  );
}
