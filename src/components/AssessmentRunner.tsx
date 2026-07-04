"use client";

import { useState } from "react";
import { submitAssessment } from "@/app/actions";
import { WORK_STYLES_WORDS, WORD_SURVEY_GROUPS } from "@/lib/assessment";

type View = "menu" | "work" | "word";

export default function AssessmentRunner({ token, name, doneWork, doneWord }: { token: string; name: string; doneWork: boolean; doneWord: boolean }) {
  const [view, setView] = useState<View>("menu");

  if (view === "work") return <WorkStyles token={token} onBack={() => setView("menu")} />;
  if (view === "word") return <WordSurvey token={token} onBack={() => setView("menu")} />;

  const allDone = doneWork && doneWord;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-brand-navy p-6 text-white">
        <div className="text-sm font-semibold text-brand-gold-soft">Freedom Offers</div>
        <h1 className="mt-1 text-2xl font-bold">Welcome{name ? `, ${name.split(" ")[0]}` : ""} 👋</h1>
        <p className="mt-2 text-sm text-white/80">Two short assessments (about 5 minutes each). There are no right or wrong answers — just answer honestly and go with your gut. It helps us understand how you naturally work best.</p>
      </div>

      {allDone ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="text-4xl">🎉</div>
          <h2 className="mt-2 text-lg font-bold text-emerald-800">All done — thank you!</h2>
          <p className="mt-1 text-sm text-emerald-700">Your responses have been sent to the team. You can close this window.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Card title="1 · How You Work Best" desc="Check the words that describe you. Quick and intuitive." done={doneWork} onStart={() => setView("work")} />
          <Card title="2 · Quick Word Pick" desc="For each group, pick what's most and least like you." done={doneWord} onStart={() => setView("word")} />
        </div>
      )}
    </div>
  );
}

function Card({ title, desc, done, onStart }: { title: string; desc: string; done: boolean; onStart: () => void }) {
  return (
    <div className={`rounded-2xl border p-5 ${done ? "border-emerald-200 bg-emerald-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800">{title}</h3>
        {done && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">✓ Done</span>}
      </div>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>
      <button onClick={onStart} className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold ${done ? "bg-slate-100 text-slate-600 hover:bg-slate-200" : "bg-brand-navy text-white hover:bg-brand-navy-700"}`}>
        {done ? "Retake" : "Start"}
      </button>
    </div>
  );
}

const chip = (on: boolean) => `select-none rounded-lg border px-3 py-2 text-sm font-medium transition ${on ? "border-brand-navy bg-brand-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`;

// ---- Instrument 1: Work Styles (two passes through the adjective bank) ----
function WorkStyles({ token, onBack }: { token: string; onBack: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [expected, setExpected] = useState<string[]>([]);
  const [natural, setNatural] = useState<string[]>([]);
  const cur = step === 1 ? expected : natural;
  const setCur = step === 1 ? setExpected : setNatural;
  const toggle = (w: string) => setCur((s) => (s.includes(w) ? s.filter((x) => x !== w) : [...s, w]));

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-600">← Back</button>
      <div className="rounded-xl bg-slate-50 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">How You Work Best · Step {step} of 2</div>
        <h2 className="mt-1 font-bold text-slate-800">{step === 1 ? "Check the words that describe how you feel you're EXPECTED to act at work." : "Now check the words that describe the REAL you — how you actually are."}</h2>
        <p className="mt-1 text-xs text-slate-500">Pick as many or as few as fit. Go with your first instinct.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {WORK_STYLES_WORDS.map(({ w }) => (
          <button key={w} type="button" onClick={() => toggle(w)} className={chip(cur.includes(w))}>{w}</button>
        ))}
      </div>
      {step === 1 ? (
        <button onClick={() => setStep(2)} className="rounded-lg bg-brand-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-navy-700">Next →</button>
      ) : (
        <form action={submitAssessment}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="instrument" value="work_styles" />
          <input type="hidden" name="expected" value={JSON.stringify(expected)} />
          <input type="hidden" name="natural" value={JSON.stringify(natural)} />
          <button className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Submit ✓</button>
        </form>
      )}
    </div>
  );
}

// ---- Instrument 2: Word Survey (forced choice: most + least per group) ----
function WordSurvey({ token, onBack }: { token: string; onBack: () => void }) {
  const [most, setMost] = useState<(string | null)[]>(WORD_SURVEY_GROUPS.map(() => null));
  const [least, setLeast] = useState<(string | null)[]>(WORD_SURVEY_GROUPS.map(() => null));
  const set = (arr: (string | null)[], i: number, w: string | null) => arr.map((x, j) => (j === i ? w : x));
  const pickMost = (i: number, w: string) => { setMost((m) => set(m, i, w)); setLeast((l) => (l[i] === w ? set(l, i, null) : l)); };
  const pickLeast = (i: number, w: string) => { setLeast((l) => set(l, i, w)); setMost((m) => (m[i] === w ? set(m, i, null) : m)); };
  const complete = most.every(Boolean) && least.every(Boolean);

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-slate-400 hover:text-slate-600">← Back</button>
      <div className="rounded-xl bg-slate-50 p-4">
        <div className="text-xs font-bold uppercase tracking-wide text-slate-400">Quick Word Pick</div>
        <h2 className="mt-1 font-bold text-slate-800">In each group, tap the word that&apos;s <span className="text-emerald-700">MOST</span> like you and the one that&apos;s <span className="text-red-600">LEAST</span> like you.</h2>
      </div>
      <div className="space-y-3">
        {WORD_SURVEY_GROUPS.map((group, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {group.map(({ w }) => (
                <div key={w} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">{w}</span>
                  <span className="flex gap-1">
                    <button type="button" onClick={() => pickMost(i, w)} className={`h-7 w-9 rounded text-[11px] font-bold ${most[i] === w ? "bg-emerald-600 text-white" : "bg-white text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"}`}>Most</button>
                    <button type="button" onClick={() => pickLeast(i, w)} className={`h-7 w-9 rounded text-[11px] font-bold ${least[i] === w ? "bg-red-600 text-white" : "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50"}`}>Least</button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form action={submitAssessment}>
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="instrument" value="word_survey" />
        <input type="hidden" name="most" value={JSON.stringify(most)} />
        <input type="hidden" name="least" value={JSON.stringify(least)} />
        <button disabled={!complete} className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">{complete ? "Submit ✓" : `Pick most + least in all ${WORD_SURVEY_GROUPS.length} groups`}</button>
      </form>
    </div>
  );
}
