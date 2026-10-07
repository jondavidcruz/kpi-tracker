"use client";
// Drop-in snippet chooser: picks a canned message, fills {name}/{rep}, and
// writes it into the target textarea/input (and subject field for emails).
type Snip = { id: string; name: string; kind: string; subject?: string; body: string };

export default function SnippetPicker({ snippets, targetId, subjectId, lead, rep }: { snippets: Snip[]; targetId: string; subjectId?: string; lead: string; rep: string }) {
  if (!snippets.length) return null;
  const fill = (t: string) => t.replaceAll("{name}", lead.split(" ")[0] || "there").replaceAll("{rep}", rep.split(" ")[0] || "us");
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const s = snippets.find((x) => x.id === e.target.value);
        if (!s) return;
        const ta = document.getElementById(targetId) as HTMLTextAreaElement | null;
        if (ta) ta.value = fill(s.body);
        if (subjectId && s.subject) {
          const su = document.getElementById(subjectId) as HTMLInputElement | null;
          if (su) su.value = fill(s.subject);
        }
        e.target.value = "";
      }}
      className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-500"
      title="Insert a saved template — it personalizes the name automatically"
    >
      <option value="">📋 snippet…</option>
      {snippets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
}
