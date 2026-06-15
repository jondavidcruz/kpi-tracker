import { addRecording, deleteRecording } from "@/app/actions";
import { Card } from "@/components/ui";

const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

type Rec = { id: string; title: string; url: string; meetingDate: string; postedToChat: boolean; createdAt: Date };

export default function RecordingsCard({
  meeting, recordings, fmtWhen,
}: { meeting: "monday" | "leadership"; recordings: Rec[]; fmtWhen: (d: Date) => string }) {
  return (
    <div id="recordings" className="scroll-mt-4">
      <Card className="p-6">
        <h3 className="mb-1 text-sm font-bold text-slate-700">🎥 Meeting recordings (Fathom)</h3>
        <p className="mb-3 text-xs text-slate-500">File each meeting&apos;s Fathom link to review later. Tick &ldquo;post to Chat&rdquo; to drop it in the team Google Chat. (Auto-filing via Fathom→Zapier is also supported.)</p>

        <form action={addRecording} className="grid grid-cols-1 gap-2 sm:grid-cols-6">
          <input type="hidden" name="meeting" value={meeting} />
          <input name="title" placeholder="e.g. Team Meeting — June 15, 2026" className={`${inputCls} sm:col-span-2`} required />
          <input name="url" placeholder="Fathom share link…" className={`${inputCls} sm:col-span-2`} required />
          <input type="date" name="meetingDate" className={`${inputCls} sm:col-span-1`} />
          <button className="rounded-lg bg-brand-navy px-3 py-2 text-sm font-semibold text-white hover:bg-brand-navy-700 sm:col-span-1">+ File link</button>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 sm:col-span-6"><input type="checkbox" name="postToChat" /> Post this recording to the team Google Chat now</label>
        </form>

        {recordings.length > 0 && (
          <ul className="mt-4 space-y-2">
            {recordings.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200">
                <a href={r.url} target="_blank" rel="noopener noreferrer" className="flex-1 font-semibold text-brand-navy hover:underline">🎬 {r.title} ↗</a>
                <span className="text-[11px] text-slate-400">{r.meetingDate || fmtWhen(r.createdAt)}</span>
                {r.postedToChat && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">posted</span>}
                <form action={deleteRecording}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="meeting" value={meeting} />
                  <button className="text-xs font-medium text-slate-400 hover:text-red-600">Delete</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
