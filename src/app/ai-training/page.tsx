import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

// The AI lineup — which system to reach for. Kept visual: big glyphs, meters, chips.
const TOOLS: {
  name: string; emoji: string; color: string; tagline: string;
  strengths: string[]; reach: string;
}[] = [
  {
    name: "Claude", emoji: "🟠", color: "#D97706",
    tagline: "The deep worker — writing, analysis, long documents",
    strengths: ["✍️ Best writing quality", "📄 Reads huge contracts/PDFs", "🧠 Careful multi-step reasoning", "💻 Builds tools & automations"],
    reach: "Seller emails, contract questions, call-transcript analysis, anything you'd proofread twice",
  },
  {
    name: "ChatGPT", emoji: "🟢", color: "#059669",
    tagline: "The all-rounder — fast answers, voice, images",
    strengths: ["🗣️ Great voice mode on the go", "🖼️ Makes & reads images", "⚡ Quick everyday questions", "🌐 Web browsing built in"],
    reach: "Quick lookups while driving, turning a photo of a doc into text, brainstorm buddy",
  },
  {
    name: "Gemini", emoji: "🔵", color: "#2563EB",
    tagline: "The Google native — lives inside Gmail, Docs & Meet",
    strengths: ["📧 Summarize Gmail threads", "📹 Meet recordings → notes", "📊 Works inside Sheets", "🎬 Understands video"],
    reach: "Anything already in Google-land: meeting recaps, doc drafts, sheet formulas",
  },
  {
    name: "Perplexity", emoji: "🟣", color: "#7C3AED",
    tagline: "The researcher — answers with sources you can check",
    strengths: ["🔎 Live web research", "📚 Cites every claim", "🏘️ Market / county lookups", "✅ Easy to verify"],
    reach: "County rules, market stats, 'is this company legit?' — anything you'd Google for an hour",
  },
];

// Anatomy of a great prompt — the 5 building blocks, each with a land-biz example.
const PROMPT_BLOCKS: { n: number; name: string; emoji: string; what: string; example: string }[] = [
  { n: 1, name: "Role", emoji: "🎭", what: "Tell it WHO to be", example: "You are a land-wholesaling acquisitions coach…" },
  { n: 2, name: "Task", emoji: "🎯", what: "Say EXACTLY what you want", example: "…rewrite my follow-up text to this seller…" },
  { n: 3, name: "Context", emoji: "📦", what: "Paste what it needs to know", example: "…here's the thread so far + the county + our offer…" },
  { n: 4, name: "Format", emoji: "📐", what: "Say what the answer looks like", example: "…keep it under 3 sentences, friendly, no jargon…" },
  { n: 5, name: "Example", emoji: "🪞", what: "Show one you like", example: "…here's a text that worked great last month: …" },
];

const HABITS: { emoji: string; title: string; tip: string }[] = [
  { emoji: "🔁", title: "Iterate — don't settle", tip: "First answer weak? Say what's wrong and ask again. \"Shorter.\" \"Warmer.\" \"More specific.\" Each round gets better." },
  { emoji: "🪞", title: "Feed it examples", tip: "Paste your best email / script / summary and say \"match this style.\" It copies quality instantly." },
  { emoji: "📋", title: "Ask for a format", tip: "Table, checklist, script, bullet summary — name the shape you want and you'll get something usable, not an essay." },
  { emoji: "🧾", title: "Verify money facts", tip: "AI can sound confident and be wrong. Numbers, laws, comps — confirm against the source before acting." },
  { emoji: "🧵", title: "One job per chat", tip: "New task = new chat. Mixing five topics in one thread confuses it (and you)." },
  { emoji: "🎤", title: "Talk instead of type", tip: "On your phone, use voice mode — describe the situation like you'd brief a teammate. Faster than typing." },
];

export default function AiTrainingPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionTitle
        title="🤖 AI Training"
        subtitle="Get dangerous with Claude, ChatGPT, Gemini & friends — which one to send in, and how to talk to it."
        accent="bg-brand-gold"
      />

      {/* ── The lineup ── */}
      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500">1 · Pick your player</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <Card key={t.name} className="p-4" >
              <div className="flex items-baseline gap-2">
                <span className="text-2xl">{t.emoji}</span>
                <span className="text-lg font-extrabold" style={{ color: t.color }}>{t.name}</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-700 dark:text-slate-200">{t.tagline}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.strengths.map((s) => (
                  <span key={s} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[12px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">{s}</span>
                ))}
              </div>
              <p className="mt-2 text-[12px] text-slate-500"><span className="font-bold">Reach for it:</span> {t.reach}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Which Claude card (Jon's visual) ── */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-500">2 · Which Claude do I send in?</h2>
          <a href="/training/which-claude.html" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Open full screen ↗</a>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm dark:border-slate-700">
          <iframe src="/training/which-claude.html" title="Which Claude — visual model card" className="h-[1550px] w-full" style={{ background: "#E6E2D0" }} />
        </div>
      </section>

      {/* ── Prompt anatomy ── */}
      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500">3 · Anatomy of a great prompt</h2>
        <Card className="p-4">
          <div className="grid gap-2 sm:grid-cols-5">
            {PROMPT_BLOCKS.map((b) => (
              <div key={b.n} className="rounded-xl border-2 border-slate-200 p-3 text-center dark:border-slate-700">
                <div className="text-2xl">{b.emoji}</div>
                <div className="mt-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">{b.n}. {b.name}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{b.what}</div>
                <div className="mt-1.5 rounded-lg bg-slate-50 px-2 py-1.5 text-left text-[11px] italic text-slate-500 dark:bg-slate-800">{b.example}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm dark:bg-emerald-950">
            <span className="font-bold text-emerald-800 dark:text-emerald-200">Put together, that's one message:</span>{" "}
            <span className="italic text-emerald-700 dark:text-emerald-300">&ldquo;You&apos;re a land-acquisitions coach. Rewrite my follow-up text to this seller. Here&apos;s the thread + our offer. Keep it under 3 sentences, friendly. Here&apos;s one that worked before: …&rdquo;</span>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-950">
              <div className="text-xs font-extrabold uppercase text-red-600">🚫 Weak</div>
              <p className="mt-1 text-sm italic text-red-800 dark:text-red-200">&ldquo;write a text to a seller&rdquo;</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-800 dark:bg-emerald-950">
              <div className="text-xs font-extrabold uppercase text-emerald-600">✅ Strong</div>
              <p className="mt-1 text-sm italic text-emerald-800 dark:text-emerald-200">Role + task + the actual thread + format + an example that worked</p>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Pro habits ── */}
      <section>
        <h2 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-500">4 · Six habits of the AI-powered</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HABITS.map((h) => (
            <Card key={h.title} className="p-4">
              <div className="text-2xl">{h.emoji}</div>
              <div className="mt-1 text-sm font-extrabold text-slate-800 dark:text-slate-100">{h.title}</div>
              <p className="mt-1 text-[13px] leading-snug text-slate-600 dark:text-slate-300">{h.tip}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Safety ── */}
      <section>
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950">
          <div className="text-sm font-extrabold text-amber-900 dark:text-amber-200">🔒 The one hard rule</div>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Never paste <strong>passwords, seller SSNs/IDs, bank details, or our full lead lists</strong> into any AI chat.
            Names, addresses, and deal context for a task you&apos;re working are fine — credentials and bulk personal data are not.
            When unsure, ask Jon or Marie first.
          </p>
        </div>
      </section>
    </div>
  );
}
