"use client";
// 📎 Upload a document to a lead's Drive folder, WITH visible feedback. Sends the file
// BYTES straight to Drive (resumable session) instead of through a Vercel function —
// the function caps request bodies at ~4.5MB and returned a non-JSON 413 on real-world
// files ("the server sent a bad response"), which is why uploads failed (Jon 2026-10-27).
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadLeadFile } from "@/lib/upload-lead-file";

export default function DocUploadForm({ oppId, contactId }: { oppId: string; contactId: string }) {
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, setPending] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    const docType = String(fd.get("docType") ?? "");
    if (!(file instanceof File) || file.size === 0) { setRes({ ok: false, msg: "Pick a file first." }); return; }
    setPending(true); setRes(null);
    const j = await uploadLeadFile({ oppId, contactId, file, docType });
    setRes(j);
    if (j.ok) { formRef.current?.reset(); router.refresh(); }
    setPending(false);
  };

  return (
    <div className="mb-2">
      <form ref={formRef} onSubmit={onSubmit} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="oppId" value={oppId} />
        <input type="hidden" name="contactId" value={contactId} />
        <select name="docType" defaultValue="" className="rounded-lg border border-slate-200 px-1.5 py-1 text-[10px] font-semibold text-slate-600" title="What kind of document is this?">
          <option value="">Type (auto)…</option>
          <option>Purchase Agreement</option>
          <option>Assignment Agreement</option>
          <option>Listing Agreement</option>
          <option>Disclosure Agreement</option>
          <option>Offer Packet</option>
          <option>Addendum</option>
          <option>Miscellaneous</option>
        </select>
        <input type="file" name="file" required disabled={pending} className="min-w-0 flex-1 text-[10px] text-slate-500 file:mr-1.5 file:rounded-lg file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-[10px] file:font-bold file:text-slate-600" />
        <button disabled={pending} className="rounded-lg bg-brand-navy px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50">{pending ? "uploading…" : "⬆ to Drive"}</button>
      </form>
      {res && (
        <div className={`mt-1 rounded-lg px-2 py-1 text-[10px] font-semibold ${res.ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
          {res.ok ? res.msg : `⚠️ ${res.msg}`}
        </div>
      )}
    </div>
  );
}
