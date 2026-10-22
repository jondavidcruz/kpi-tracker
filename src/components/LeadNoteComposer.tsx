"use client";
// ✍️ Full-page lead note composer — the SAME rich editor (bold / underline /
// bullets / attach) the quickview uses, so notes on the full lead page are smart
// too, not a one-line box (Jon 2026-10-24).
import { useTransition } from "react";
import NoteComposer from "@/components/NoteComposer";
import { addCrmNoteAction } from "@/app/crm/actions";

export default function LeadNoteComposer({ oppId, contactId }: { oppId: string; contactId: string }) {
  const [, start] = useTransition();
  return (
    <NoteComposer onSubmit={(html, file) => {
      const fd = new FormData();
      fd.set("oppId", oppId); fd.set("contactId", contactId); fd.set("body", html);
      if (file) fd.set("file", file);
      start(async () => { await addCrmNoteAction(fd); });
    }} />
  );
}
