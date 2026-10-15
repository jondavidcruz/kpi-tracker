import { db } from "@/lib/db";

// 🎬 Loom tutorial library (Jon 2026-10-15). Videos are stored as LINKS (Loom
// hosts them, or a Drive link) — NOT uploaded files — so they never touch Supabase
// storage. Metadata lives in a Resource side-store. Keep each clip under 5 minutes.
const CAT = "__loom_videos__";
export type Tutorial = { id: string; title: string; section: string; url: string; addedBy: string; addedAt: string };
export const TUTORIAL_SECTIONS = ["Acquisitions", "Dispositions", "Marketing", "General / Systems"] as const;

export async function readTutorials(): Promise<Tutorial[]> {
  const row = await db.resource.findFirst({ where: { category: CAT } }).catch(() => null);
  try { return row?.description ? JSON.parse(row.description) : []; } catch { return []; }
}
export async function writeTutorials(list: Tutorial[]) {
  const description = JSON.stringify(list.slice(0, 300));
  const row = await db.resource.findFirst({ where: { category: CAT } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "loom-videos", category: CAT, url: "", description } });
}

// The videos to CREATE, per department, from our actual process — so Jon knows
// what to film (and which to record live with the team on Friday).
export const TUTORIAL_CHECKLIST: Record<string, string[]> = {
  Acquisitions: [
    "Lead intake + speed-to-lead: calling a new lead in minutes",
    "The seller call — script walkthrough & objection handling",
    "Pulling comps: Regrid, REI AI, Propwire, Redfin/Zillow",
    "Underwriting a land deal (the calculator, MAO, exits)",
    "Making the offer + sending the PandaDoc",
    "Moving a lead through the pipeline + picking the stage",
    "Follow-up cadence + using Next Up / Tasks",
    "Logging your KPIs (Enter KPIs)",
  ],
  Dispositions: [
    "Building the offer packet (3–5 minutes)",
    "The buyer cascade — arming it + working the responses",
    "Vetting buyers + the buy-box",
    "iSpeedToLead walkthrough",
    "Posting to LinkedIn, Facebook, Craigslist",
    "The Deal Board — pricing parcels so we never lose money",
    "Closing coordination + escrow handoff",
  ],
  Marketing: [
    "Lead sourcing overview",
    "Direct REI — how it feeds the CRM",
    "Setting a buyer's buy-box / markets",
    "Content + outreach basics",
  ],
  "General / Systems": [
    "War Room tour — sidebar + where everything lives",
    "The iPhone app — install + notifications",
    "Requests + AI Champion — how to ask for help / submit ideas",
    "Schedule & Time — clocking in, time off",
  ],
};
