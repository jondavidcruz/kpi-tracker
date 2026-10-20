"use client";
// ✍️ GHL-style note composer (Jon 2026-10-20: "bigger box, bullets, bold, underline —
// not one line"). A contentEditable editor with a formatting toolbar. Emits sanitized
// HTML to onSubmit; the feed renders it with the same whitelist.
import { useRef, useState } from "react";

export default function NoteComposer({ onSubmit }: { onSubmit: (html: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const cmd = (c: string) => { document.execCommand(c, false); ref.current?.focus(); syncEmpty(); };
  const syncEmpty = () => setEmpty(!(ref.current?.innerText?.trim()));
  const add = () => {
    const text = ref.current?.innerText?.trim() || "";
    const html = ref.current?.innerHTML?.trim() || "";
    if (!text) return;
    onSubmit(html);
    if (ref.current) ref.current.innerHTML = "";
    setEmpty(true);
  };
  const Btn = ({ onClick, title, children, cls = "" }: { onClick: () => void; title: string; children: React.ReactNode; cls?: string }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title} className={`grid h-7 min-w-7 place-items-center rounded-md px-1.5 text-[12px] text-slate-600 hover:bg-slate-100 ${cls}`}>{children}</button>
  );
  return (
    <div className="rounded-xl border border-slate-200 bg-white focus-within:ring-1 focus-within:ring-brand-navy/30">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-2 py-1.5">
        <Btn onClick={() => cmd("bold")} title="Bold (Ctrl/Cmd+B)" cls="font-extrabold">B</Btn>
        <Btn onClick={() => cmd("underline")} title="Underline (Ctrl/Cmd+U)" cls="underline">U</Btn>
        <Btn onClick={() => cmd("italic")} title="Italic (Ctrl/Cmd+I)" cls="italic">I</Btn>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <Btn onClick={() => cmd("insertUnorderedList")} title="Bullet list">• List</Btn>
        <Btn onClick={() => cmd("insertOrderedList")} title="Numbered list">1. List</Btn>
        <button type="button" onClick={add} className="ml-auto rounded-lg bg-brand-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-navy-700">📝 Add note</button>
      </div>
      <div className="relative">
        {empty && <span className="pointer-events-none absolute left-3 top-2 text-sm text-slate-400">Write a note… use the toolbar for bold, underline &amp; bullets</span>}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={syncEmpty}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); add(); } }}
          className="min-h-[96px] max-h-72 overflow-y-auto px-3 py-2 text-sm leading-relaxed text-slate-800 outline-none [&_a]:text-indigo-600 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        />
      </div>
    </div>
  );
}
