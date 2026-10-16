import { db } from "@/lib/db";

// 📋 Onboarding progress tracker (Jon 2026-10-16: "a separate section so I can
// see what's been completed — put it in the team roster"). Progress is stored
// SERVER-SIDE in a Resource side-store (no schema change) keyed by userId, so
// Jon sees every new hire's completion from any device — unlike the per-browser
// localStorage checklist. Auto milestones (account / welcome email / assessment
// / signed agreement / certified) are derived live; the training milestones are
// manual checkboxes saved here.
const CAT = "__onboarding_progress__";

export type OnbStore = Record<string, { steps?: Record<string, boolean>; welcomeSentAt?: string }>;

// Manual training milestones per track (mirror the Onboarding bootcamp gates).
export const ONB_STEPS: Record<string, { key: string; label: string }[]> = {
  acquisitions: [
    { key: "videos", label: "Watched all training videos + took notes" },
    { key: "glossary", label: "Passed glossary check (ARV, MAO, novation…)" },
    { key: "scripts", label: "Memorized the seller call scripts" },
    { key: "process", label: "Can explain the full deal flow" },
    { key: "underwriting", label: "Learned the deal math (ARV/MAO/novation)" },
    { key: "script_cert", label: "Script certification — role-play ⭐-rated in Call Scoring" },
  ],
  dispositions: [
    { key: "dev_sourcing", label: "Worked the Developer Sourcing Track (all 5 modules)" },
    { key: "glossary", label: "Learned the language + Lux Blueprint" },
    { key: "scripts", label: "Memorized the buyer / developer scripts" },
    { key: "buyresearch", label: "Learned the Buyer Research tool (every buy-box field)" },
    { key: "process", label: "Can explain the dispositions deal flow" },
    { key: "buybox_cert", label: "Gatekeeper + buy-box certification (⭐-rated)" },
  ],
};
export function stepsForPosition(position?: string | null): { key: string; label: string }[] {
  return position === "dispositions" ? ONB_STEPS.dispositions : ONB_STEPS.acquisitions;
}

export async function getOnboardingStore(): Promise<OnbStore> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  if (!row?.description) return {};
  try { return JSON.parse(row.description) as OnbStore; } catch { return {}; }
}

async function writeStore(store: OnbStore): Promise<void> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  const description = JSON.stringify(store);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "onboarding-progress", category: CAT, url: "", description } });
}

export async function setOnboardingStep(userId: string, key: string, done: boolean): Promise<void> {
  if (!userId || !key) return;
  const store = await getOnboardingStore();
  const entry = store[userId] ?? {};
  const steps = { ...(entry.steps ?? {}) };
  if (done) steps[key] = true; else delete steps[key];
  store[userId] = { ...entry, steps };
  await writeStore(store);
}

export async function markWelcomeSent(userId: string): Promise<void> {
  if (!userId) return;
  const store = await getOnboardingStore();
  store[userId] = { ...(store[userId] ?? {}), welcomeSentAt: new Date().toISOString() };
  await writeStore(store);
}

// A single milestone line in the roster tracker.
export type Milestone = { key: string; label: string; done: boolean; auto: boolean };

/** Build the full milestone list (auto-derived + manual) for one hire. */
export function buildMilestones(opts: {
  position?: string | null;
  welcomeSentAt?: string;
  assessmentDone: boolean;
  hasAgreement: boolean;
  certified: boolean;
  manual: Record<string, boolean>;
}): Milestone[] {
  const steps = stepsForPosition(opts.position);
  const auto: Milestone[] = [
    { key: "account", label: "War Room account created", done: true, auto: true },
    { key: "welcome", label: "Welcome email sent", done: !!opts.welcomeSentAt, auto: true },
    { key: "assessment", label: "Behavioral assessment completed", done: opts.assessmentDone, auto: true },
  ];
  const manual: Milestone[] = steps.map((s) => ({ key: s.key, label: s.label, done: !!opts.manual[s.key], auto: false }));
  const closing: Milestone[] = [
    { key: "agreement", label: "Signed agreement on file", done: opts.hasAgreement, auto: true },
    { key: "certified", label: "Certified — full access granted", done: opts.certified, auto: true },
  ];
  return [...auto, ...manual, ...closing];
}
