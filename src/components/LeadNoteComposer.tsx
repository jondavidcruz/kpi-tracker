"use client";
// ✍️ Full-page lead note composer — the SAME rich editor (bold / underline /
// bullets / attach) the quickview uses, so notes on the full lead page are smart
// too, not a one-line box (Jon 2026-10-24).
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import NoteComposer from "@/components/NoteComposer";
import { addCrmNoteAction } from "@/app/crm/actions";
import { uploadLeadFile } from "@/lib/upload-lead-file";

export default function LeadNoteComposer({ oppId, contactId }: { oppId: string; contactId: string }) {
  const [, start] = useTransition();
  const router = useRouter();
  return (
    <NoteComposer onSubmit={(html, file) => {
      // 📎 A file goes straight to Drive (uploadLeadFile) — never through a Vercel
      // function, so files over the 4.5MB cap work; text-only stays on the fast action.
      if (file) {
        start(async () => {
          const r = await uploadLeadFile({ oppId, contactId, file, asNote: true, body: html });
          if (!r.ok) alert(r.msg);
          router.refresh();
        });
        return;
      }
      const fd = new FormData();
      fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("body", html);
      start(async () => { await addCrmNoteAction(fd); });
    }} />
  );
}
