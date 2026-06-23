"use client";

import { useState } from "react";

type Rep = { name: string; role: string; skills: string[] };
const MODES = [
  { key: "lesson", label: "📋 Lesson plan" },
  { key: "exercises", label: "🏋️ Exercises & drills" },
  { key: "ideas", label: "💡 Coaching ideas" },
  { key: "roleplay", label: "🎭 Role-play scenario" },
  { key: "feedback", label: "🔍 Review a call" },
];

export default function AICoach({ reps }: { reps: Rep[] }) {
  const [repName, setRepName] = useState(reps[0]?.name ?? "");
  const [skill, setSkill] = useState("");
  const [mode, setMode] = useState("lesson");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");

  const rep = reps.find((r) => r.name === repName);
  const skillOptions = rep?.skills ?? [];

  async function run(m: string) {
    setMode(m);
    setLoading(true);
    setReply("");
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rep: repName, role: rep?.role ?? "", skill: skill || skillOptions[0] || "", mode: m, context }),
      });
      const data = await res.json();
      setReply(data.reply ?? data.error ?? "No response.");
    } catch {
      setReply("Couldn't reach the AI coach — try again.");
    } finally {
      setLoading(false);
    }
  }

  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";
  return (
    <div className="rounded-2xl bg-brand-navy p-4 text-white ring-1 ring-brand-navy">
      <div className="mb-1 text-base font-bold">🤖 AI Training Designer</div>
      <p className="mb-3 text-xs text-white/60">Pick a rep + topic, then generate training you can run this week — a lesson plan, practice exercises, coaching ideas (when to audit calls vs. other methods), a role-play scenario, or feedback on a real call.</p>
      <div className="flex flex-wrap gap-2">
        <select value={repName} onChange={(e) => { setRepName(e.target.value); setSkill(""); }} className={sel}>
          {reps.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
        <select value={skill} onChange={(e) => setSkill(e.target.value)} className={sel}>
          <option value="">{skillOptions.length ? "— focus skill —" : "(no focus set — type below)"}</option>
          {skillOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="or type a skill / situation" className={`${sel} min-w-44 flex-1`} />
      </div>
      <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2} placeholder="Optional: paste a call transcript or describe the situation (for 'Review a call')" className={`${sel} mt-2 w-full text-slate-800`} />
      <div className="mt-2 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.key} onClick={() => run(m.key)} disabled={loading} className="rounded-lg bg-white/10 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-50">{m.label}</button>
        ))}
      </div>
      {(loading || reply) && (
        <div className="mt-3 rounded-xl bg-white p-4 text-sm text-slate-700">
          {loading ? <span className="text-slate-400">Coaching {repName}…</span> : <div className="whitespace-pre-wrap leading-relaxed">{reply}</div>}
        </div>
      )}
    </div>
  );
}
