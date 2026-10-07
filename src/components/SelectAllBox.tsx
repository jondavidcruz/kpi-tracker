"use client";
// Ticks/unticks every bulk checkbox in the list table (mass edits).
export default function SelectAllBox() {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500">
      <input type="checkbox" onChange={(e) => { document.querySelectorAll<HTMLInputElement>('input[name="ids"]').forEach((b) => { b.checked = e.target.checked; }); }} />
      select all shown
    </label>
  );
}
