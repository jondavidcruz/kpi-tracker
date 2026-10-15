import { getCurrentUser, isManager } from "@/lib/auth";
import { Card, SectionTitle } from "@/components/ui";
import { readTutorials, TUTORIAL_SECTIONS, TUTORIAL_CHECKLIST } from "@/lib/tutorials";
import { addTutorialAction, removeTutorialAction } from "./tutorials-actions";

export const dynamic = "force-dynamic";

// 🎬 Loom Tutorials — short (<5 min) walkthroughs per section so the team can
// self-serve instead of asking Jon. Videos are stored as LINKS (Loom/Drive) so
// they never use Supabase storage (Jon 2026-10-15).
export default async function TutorialsPage({ searchParams }: { searchParams: Promise<{ added?: string; err?: string }> }) {
  const me = await getCurrentUser();
  if (!me) return <Card className="p-10 text-center text-slate-400">Sign in to view tutorials.</Card>;
  const sp = await searchParams;
  const canEdit = isManager(me);
  const videos = await readTutorials();

  return (
    <div className="space-y-5">
      <SectionTitle title="🎬 Loom Tutorials" subtitle="Short walkthroughs (keep each under 5 minutes) for every section — so the team can learn a process without pulling Jon aside." accent="bg-violet-500" />

      {sp.added && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">✓ Tutorial added.</div>}
      {sp.err && <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-800 ring-1 ring-red-200">Need a title and a valid video link (https://…).</div>}

      {canEdit && (
        <Card className="border-l-4 border-violet-500 p-4">
          <div className="mb-1 text-sm font-extrabold text-slate-800">➕ Add a tutorial</div>
          <div className="mb-2 text-[11px] text-slate-500">Record it in Loom (or Drive), copy the <b>share link</b>, and paste it here — no file upload, so it never touches our storage. <b>Keep each clip under 5 minutes.</b></div>
          <form action={addTutorialAction} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col"><span className="mb-0.5 text-[11px] font-semibold text-slate-500">Title</span><input name="title" required placeholder="Pulling comps on Regrid" className="w-60 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
            <label className="flex flex-col"><span className="mb-0.5 text-[11px] font-semibold text-slate-500">Section</span>
              <select name="section" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" defaultValue="Acquisitions">
                {TUTORIAL_SECTIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="flex flex-col"><span className="mb-0.5 text-[11px] font-semibold text-slate-500">Loom / video link</span><input name="url" required placeholder="https://www.loom.com/share/…" className="w-72 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" /></label>
            <button className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700">Add</button>
          </form>
        </Card>
      )}

      {/* Uploaded videos by section */}
      {TUTORIAL_SECTIONS.map((section) => {
        const vids = videos.filter((v) => v.section === section);
        return (
          <Card key={section} className="p-4">
            <div className="mb-2 text-sm font-extrabold text-slate-800">{section} <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{vids.length}</span></div>
            {vids.length === 0 ? (
              <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-400">No videos here yet.</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {vids.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                    <a href={v.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm font-semibold text-violet-700 hover:underline">▶ {v.title}</a>
                    <span className="shrink-0 text-[10px] text-slate-400">{v.addedAt}</span>
                    {canEdit && <form action={removeTutorialAction}><input type="hidden" name="id" value={v.id} /><button className="text-[11px] font-bold text-slate-300 hover:text-red-600" title="Remove">✕</button></form>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}

      {/* 📋 What to record — the checklist, so Jon knows what to film Friday */}
      {canEdit && (
        <Card className="p-4">
          <div className="mb-1 text-sm font-extrabold text-slate-800">📋 Videos to create (record these)</div>
          <div className="mb-3 text-[11px] text-slate-500">The clips to film — based on our process. A section shows ✅ once it has a video; the rest are still to record (good list for a Friday team recording session).</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {Object.entries(TUTORIAL_CHECKLIST).map(([section, items]) => (
              <div key={section}>
                <div className="mb-1 text-xs font-bold text-slate-600">{section}</div>
                <ul className="space-y-1 text-[13px]">
                  {items.map((it) => {
                    const done = videos.some((v) => v.section === section && v.title.toLowerCase().includes(it.split("—")[0].split(":")[0].trim().toLowerCase().slice(0, 12)));
                    return <li key={it} className={`flex items-start gap-1.5 ${done ? "text-emerald-600" : "text-slate-600"}`}><span>{done ? "✅" : "⬜"}</span> {it}</li>;
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
