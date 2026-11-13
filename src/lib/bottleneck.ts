// 🩺 Weekly bottleneck analysis (Jon 2026-11-13) — the ONE place that diagnoses where
// the land-flipping machine leaks, across all three levers:
//   MARKETING      — are we pulling the right markets? are leads coming in / responding?
//   ACQUISITIONS   — where do leads die before they become an offer?
//   DISPOSITIONS   — why ~105 vetted buyers but almost nothing SOLD to them?
// It composes the engines that already exist (buildLeaks, getDispoVelocity,
// getBuyerCoverage) and adds the one thing nobody had computed: the
// vetted → sent-to → responded → offered → sold-to BUYER funnel. Runs server-side on
// prod (so it never breaks on a local-creds problem), feeds the /bottleneck page, and
// the Friday ?bottleneck=1 cron (leadership-ops chat + email + the live page link).
import { db } from "./db";
import { getSettings } from "./data";
import { sendEmailTo } from "./notify";
import { postToSpace } from "./chat-spaces";
import { APP_URL } from "./site";
import { buildLeaks, buildLeaksNarrative, type Leaks } from "./diagnostics";
import { getDispoVelocity, type DispoVelocity } from "./dispo-velocity";
import { getBuyerCoverage, type Coverage } from "./buyer-coverage";

export type Light = "red" | "yellow" | "green";

/** Of our VETTED buyers, how far down the send→sold funnel do they actually get?
 *  This is the 105-buyers-0-sales question made measurable. Measured from the
 *  DealSend cascade ledger — a deal closed OUTSIDE the cascade (manual buyer) won't
 *  show in soldTo, so we surface that caveat rather than overclaim. */
export interface BuyerGap {
  vetted: number;      // vetStage vetted|active, not a jv_partner, not archived (the "~105")
  sentTo: number;      // vetted buyers who have EVER been sent a deal
  neverSent: number;   // vetted − sentTo (the dead weight, if any)
  responded: number;   // vetted buyers who ever replied to a send
  offered: number;     // vetted buyers who ever made an offer / LOI / closed
  soldTo: number;      // vetted buyers with a DealSend outcome = closed
  soldAny: number;     // ANY buyer (incl. since-archived) with outcome = closed
  anySentTo: number;   // distinct buyers in the whole send ledger (incl. non-vetted)
  pctEverSent: number; // sentTo / vetted
}

export interface LeverCard {
  key: "marketing" | "acquisitions" | "dispositions";
  title: string;
  light: Light;
  headline: string;   // the number behind the verdict
  bullets: string[];
  actions: string[];  // 3 fixes tied to the model
  wow: string | null; // what changed vs last week
}

/** A compact weekly snapshot — stored so we can show week-over-week deltas. */
export interface Snap {
  date: string;
  leadsWeek: number;
  acqWorstPct: number;    // worst acquisitions leak %, this week
  dispoSent: number;      // buyer sends, last 90d
  dispoOffers: number;    // offers back, last 90d
  vetted: number;
  everSent: number;       // vetted buyers ever sent a deal
  soldAny: number;        // buyers closed (whole ledger)
}

export interface Bottleneck {
  today: string;
  acqWeek: Leaks;
  dispo: DispoVelocity;
  coverage: Coverage;
  gap: BuyerGap;
  marketReplyPct: number | null; // Direct REI reply rate across campaigns, if available
  levers: LeverCard[];
  biggestKey: LeverCard["key"];
  verdict: string;        // one-sentence "closer to SOLD than last week?"
  closer: boolean | null; // true/false/null(first run)
  prevDate: string | null;
}

const LIGHT_RANK: Record<Light, number> = { red: 0, yellow: 1, green: 2 };
const pct = (n: number) => `${Math.round(n * 100)}%`;

// ── the NEW piece: the vetted-buyer funnel ──────────────────────────────────
async function buildBuyerGap(): Promise<BuyerGap> {
  // Vetted = usable supply. Pull ids + type and exclude only explicit jv_partners in
  // JS (a Prisma `not` would also drop rows with a null type — we don't want that).
  const vettedRows = await db.marketContact
    .findMany({ where: { archivedAt: null, vetStage: { in: ["vetted", "active"] } }, select: { id: true, type: true } })
    .catch(() => [] as { id: string; type: string | null }[]);
  const vettedIds = new Set(vettedRows.filter((r) => (r.type ?? "") !== "jv_partner").map((r) => r.id));

  const sends = await db.dealSend
    .findMany({ select: { buyerId: true, respondedAt: true, outcome: true } })
    .catch(() => [] as { buyerId: string; respondedAt: Date | null; outcome: string }[]);

  const sentIds = new Set<string>(), respIds = new Set<string>(), offerIds = new Set<string>(), soldIds = new Set<string>();
  for (const s of sends) {
    if (!s.buyerId) continue;
    sentIds.add(s.buyerId);
    if (s.respondedAt || (s.outcome && s.outcome !== "no_reply")) respIds.add(s.buyerId);
    if (s.outcome === "offer" || s.outcome === "loi" || s.outcome === "closed") offerIds.add(s.buyerId);
    if (s.outcome === "closed") soldIds.add(s.buyerId);
  }
  const inVetted = (set: Set<string>) => [...vettedIds].filter((id) => set.has(id)).length;
  const vetted = vettedIds.size;
  const sentTo = inVetted(sentIds);
  return {
    vetted,
    sentTo,
    neverSent: Math.max(0, vetted - sentTo),
    responded: inVetted(respIds),
    offered: inVetted(offerIds),
    soldTo: inVetted(soldIds),
    soldAny: soldIds.size,
    anySentTo: sentIds.size,
    pctEverSent: vetted > 0 ? sentTo / vetted : 0,
  };
}

// ── marketing reply signal (Direct REI), best-effort ────────────────────────
async function marketReplyRate(): Promise<number | null> {
  try {
    const { directReiCampaignPerf } = await import("./directrei");
    const res = (await directReiCampaignPerf()) as { rows?: Array<Record<string, unknown>> } | null;
    const rows = res?.rows;
    if (!Array.isArray(rows) || !rows.length) return null;
    let sent = 0, replied = 0;
    for (const r of rows) {
      sent += Number(r.sent) || 0;
      replied += Number(r.replied) || 0;
    }
    return sent > 0 ? replied / sent : null;
  } catch { return null; }
}

// ── verdict builders (one per lever) ────────────────────────────────────────
function marketingCard(leadsWeek: number, cov: Coverage, replyPct: number | null): Omit<LeverCard, "wow"> {
  const gaps = cov.topGaps.length;
  let light: Light = "green";
  if (leadsWeek === 0 || (replyPct != null && replyPct < 0.01)) light = "red";
  else if (gaps > 0 || (replyPct != null && replyPct < 0.03) || leadsWeek < 10) light = "yellow";

  const headline = leadsWeek === 0
    ? "No new leads logged this week — the top of the machine is dry."
    : `${leadsWeek.toLocaleString()} new leads this week${replyPct != null ? ` · ${pct(replyPct)} seller reply rate` : ""} · ${gaps} buy-box coverage gap${gaps === 1 ? "" : "s"}.`;

  const bullets: string[] = [];
  if (replyPct != null) bullets.push(`Sellers are replying to ${pct(replyPct)} of our texts across campaigns — low reply rate = saturated or wrong market, not a bad message.`);
  bullets.push(`Open dispo demand: ${cov.dealCount} deals vs ${cov.buyerCount} vetted buyers of supply${cov.unvettedDevs ? ` (+${cov.unvettedDevs} developers not vetted yet)` : ""}.`);
  if (gaps > 0) bullets.push(`We're sourcing parcels we can't place: ${cov.topGaps.slice(0, 3).join("; ")}.`);

  const actions = [
    "Pull where you WIN, not where it's easy: low-wholesaler-saturation, waterfront, and builder-heavy counties — rank them on /markets before the next pull.",
    "Buy-box match BEFORE you pull: stop sourcing price/acre bands with no buyer (the coverage gaps above) — source to a buyer that's already waiting.",
    "Feed vetted buyers' buy-boxes back into the pull list (/lead-sourcing) so every lead we pay for has a home.",
  ];
  return { key: "marketing", title: "🎯 Marketing — where we pull", light, headline, bullets, actions };
}

function acquisitionsCard(l: Leaks): Omit<LeverCard, "wow"> {
  const n = buildLeaksNarrative(l);
  const wl = l.worstLeak;
  const sc = (k: string) => l.stages.find((s) => s.key === k)?.count ?? 0;
  const offers = sc("offers");
  let light: Light = "green";
  if (l.leads === 0) light = "yellow";
  else if ((wl && wl.lostPct >= 70) || (l.leads >= 5 && offers === 0)) light = "red";
  else if (wl && wl.lostPct >= 40) light = "yellow";

  const headline = l.leads === 0
    ? "No KPIs logged this week — can't see the funnel. Get the daily log going."
    : wl && wl.lostPct >= 1
      ? `Biggest drop is ${wl.from} → ${wl.to}: losing ${Math.round(wl.lostPct)}% there (this week).`
      : "Funnel is fairly even this week — no single dominant leak.";

  const bullets = l.stages
    .map((s) => `${s.label}: ${s.count.toLocaleString()}${s.convFromPrev != null ? ` (${Math.round(s.convFromPrev * 100)}% of prev)` : ""}`);
  const actions = n.actions.slice(0, 3);
  while (actions.length < 3) actions.push("Keep every lead logged + on a multi-touch follow-up so the leak can't hide — Michelle's offers-out is the #1 lever.");
  return { key: "acquisitions", title: "📞 Acquisitions — lead → offer", light, headline, bullets, actions: actions.slice(0, 3) };
}

function dispositionsCard(d: DispoVelocity, g: BuyerGap): Omit<LeverCard, "wow"> {
  let light: Light = "green";
  let headline: string;
  const bullets: string[] = [
    `Of ${g.vetted} vetted buyers: ${g.sentTo} ever sent a deal → ${g.responded} replied → ${g.offered} made an offer → ${g.soldTo} bought.`,
    `Last 90 days: ${d.funnel.sent} buyer sends on ${d.dealsMarketed} deals → ${d.funnel.responded} responses → ${d.funnel.offers} offers → ${d.funnel.won} won.`,
    "Sold-to is measured from the cascade send ledger — a deal closed with a buyer found outside the cascade won't show here (log those sends so this stays honest).",
  ];
  let actions: string[];

  if (g.vetted > 0 && g.pctEverSent < 0.25) {
    // ACTIVATION leak — the likely 105/0 story.
    light = "red";
    headline = `Only ${g.sentTo} of ${g.vetted} vetted buyers (${pct(g.pctEverSent)}) have EVER been sent a deal — the list isn't the problem, distribution is.`;
    actions = [
      "Buyer-first: on every new contract, rank ALL vetted buyers whose buy-box matches and send to every one of them — not just the 2-3 you know.",
      "Run the 48-hour cascade on every signed deal so no in-box vetted buyer gets skipped — arm it the day it goes under contract.",
      `Re-verify the ${g.vetted} are truly vetted (full contact + confirmed buy-box). If they've never bought and never been contacted, they may be cold — demote them so the number reflects reality.`,
    ];
  } else if (d.funnel.sent > 0 && g.soldAny === 0) {
    // CONVERSION leak — buyers get deals, nobody closes.
    light = "red";
    headline = `Buyers are getting deals (${d.funnel.sent} sends / ${d.dealsMarketed} deals) but ${g.soldAny} have closed — the leak is price/match, not reach.`;
    actions = [
      "Anchor the price on every send: lead with comps and a firm number, not 'make an offer' — a blank ask trains buyers to ignore us.",
      "Match the buy-box before you send: blasting mismatched buyers burns the list and kills reply rate. Send a deal only to buyers who buy that product.",
      "For parcels builders won't take, pivot to novation / rec-land buyers instead of forcing a cash developer.",
    ];
  } else if (d.dealsMarketed > 0 && d.dealsWithOffer === 0) {
    light = "red";
    headline = `${d.dealsMarketed} deals went out to buyers but drew 0 offers — nothing is coming back.`;
    actions = [
      "Re-anchor pricing to the real comps and re-send — a dead send list usually means the number is off.",
      "Widen the matched buyer pool (cascade more vetted buyers per deal) and rotate sending numbers so texts land.",
      "Novation / rec-land fallback for anything a cash builder passed on.",
    ];
  } else if (g.soldAny > 0 || d.funnel.won > 0) {
    light = g.offered > 0 && d.funnel.offers > 0 ? "green" : "yellow";
    headline = `${g.soldAny} buyer${g.soldAny === 1 ? " has" : "s have"} closed and ${g.offered} vetted buyers are making offers — keep the cascade tight.`;
    actions = [
      "Keep anchoring price and matching buy-box on every send — it's working, protect it.",
      "Double down on the buyers who actually bought/offered; demote the ones who've gone dark after 2+ sends.",
      "Keep sold sends logged so this dashboard reflects real sales, not just cascade activity.",
    ];
  } else {
    light = "yellow";
    headline = `Not enough dispo activity to diagnose — ${d.funnel.sent} sends logged in 90 days.`;
    actions = [
      "Get every signed deal into the cascade so there's a send ledger to measure.",
      "Confirm the vetted buyer list has real buy-boxes so matching can run.",
      "Anchor price + match buy-box from the first send.",
    ];
  }
  return { key: "dispositions", title: "🤝 Dispositions — contract → SOLD", light, headline, bullets, actions };
}

// ── week-over-week history (Resource "__bottleneck_history__") ───────────────
export async function readBottleneckHistory(): Promise<Snap[]> {
  try {
    const row = await db.resource.findFirst({ where: { category: "__bottleneck_history__" } });
    if (row?.description) { const v = JSON.parse(row.description); if (Array.isArray(v)) return v as Snap[]; }
  } catch { /* none */ }
  return [];
}

export function snapOf(b: Bottleneck): Snap {
  return {
    date: b.today,
    leadsWeek: b.acqWeek.leads,
    acqWorstPct: b.acqWeek.worstLeak ? Math.round(b.acqWeek.worstLeak.lostPct) : 0,
    dispoSent: b.dispo.funnel.sent,
    dispoOffers: b.dispo.funnel.offers,
    vetted: b.gap.vetted,
    everSent: b.gap.sentTo,
    soldAny: b.gap.soldAny,
  };
}

async function appendSnap(snap: Snap): Promise<void> {
  const hist = await readBottleneckHistory();
  const next = [...hist.filter((h) => h.date !== snap.date), snap].slice(-26);
  const payload = JSON.stringify(next);
  const row = await db.resource.findFirst({ where: { category: "__bottleneck_history__" } });
  if (row) await db.resource.update({ where: { id: row.id }, data: { description: payload } });
  else await db.resource.create({ data: { title: "bottleneck-history", category: "__bottleneck_history__", url: "", description: payload } });
}

const delta = (cur: number, prev: number, invert = false): string | null => {
  const d = cur - prev;
  if (d === 0) return "flat vs last week";
  const up = d > 0;
  const good = invert ? !up : up;
  return `${good ? "▲" : "▼"} ${up ? "+" : ""}${d.toLocaleString()} vs last week`;
};

/** Build the full three-lever diagnostic for `today`. */
export async function buildBottleneck(today: string): Promise<Bottleneck> {
  const [acqWeek, dispo, coverage, gap, marketReplyPct, hist] = await Promise.all([
    buildLeaks(today, "week"),
    getDispoVelocity(90),
    getBuyerCoverage(),
    buildBuyerGap(),
    marketReplyRate(),
    readBottleneckHistory(),
  ]);
  const prev = hist.filter((h) => h.date < today).slice(-1)[0] ?? null;

  const mk = marketingCard(acqWeek.leads, coverage, marketReplyPct);
  const aq = acquisitionsCard(acqWeek);
  const dp = dispositionsCard(dispo, gap);

  const levers: LeverCard[] = [
    { ...mk, wow: prev ? delta(acqWeek.leads, prev.leadsWeek) : null },
    { ...aq, wow: prev ? delta(acqWeek.worstLeak ? Math.round(acqWeek.worstLeak.lostPct) : 0, prev.acqWorstPct, true) : null },
    { ...dp, wow: prev ? (delta(gap.sentTo, prev.everSent) ?? delta(gap.soldAny, prev.soldAny)) : null },
  ];

  // Biggest bottleneck = the reddest lever; dispositions wins ties (it's the north star).
  const order: LeverCard["key"][] = ["dispositions", "acquisitions", "marketing"];
  const biggestKey = [...levers].sort((a, b) =>
    LIGHT_RANK[a.light] - LIGHT_RANK[b.light] || order.indexOf(a.key) - order.indexOf(b.key)
  )[0].key;

  // Closer to SOLD than last week? Weigh sold + offers + buyers activated.
  let closer: boolean | null = null;
  let verdict: string;
  if (!prev) {
    verdict = "First run — this is your baseline. Next Friday you'll see whether we moved closer to SOLD.";
  } else {
    const nowScore = gap.soldAny * 100 + gap.offered * 10 + gap.sentTo + dispo.funnel.offers * 5;
    const prevScore = prev.soldAny * 100 + 0 + prev.everSent + prev.dispoOffers * 5;
    closer = nowScore >= prevScore;
    verdict = closer
      ? `Yes — closer to SOLD than last week: buyers activated ${gap.sentTo} (was ${prev.everSent}), closes ${gap.soldAny} (was ${prev.soldAny}).`
      : `No — we slipped vs last week: buyers activated ${gap.sentTo} (was ${prev.everSent}), closes ${gap.soldAny} (was ${prev.soldAny}). Fix the red lever above first.`;
  }

  return { today, acqWeek, dispo, coverage, gap, marketReplyPct, levers, biggestKey, verdict, closer, prevDate: prev?.date ?? null };
}

// ── Friday delivery: leadership-ops chat + email + history write ─────────────
const EMOJI: Record<Light, string> = { red: "🔴", yellow: "🟡", green: "🟢" };

export async function sendBottleneckReport(today: string): Promise<{ posted: boolean; emailed: boolean }> {
  const b = await buildBottleneck(today);
  const biggest = b.levers.find((l) => l.key === b.biggestKey)!;
  const link = `${APP_URL}/bottleneck`;

  // ── Google Chat (one screen) ──
  const chatLines = [
    `🩺 *War Room Bottleneck — ${today}*`,
    ``,
    `*Biggest leak:* ${biggest.title} ${EMOJI[biggest.light]}`,
    `${biggest.headline}`,
    ``,
    ...b.levers.map((l) => `${EMOJI[l.light]} *${l.title}* — ${l.headline}${l.wow ? `  _(${l.wow})_` : ""}`),
    ``,
    `*Fix this weekend (${biggest.title}):*`,
    ...biggest.actions.map((a, i) => `${i + 1}. ${a}`),
    ``,
    b.verdict,
    `Full live diagnostic → ${link}`,
  ];
  const posted = await postToSpace("bottleneck", chatLines.join("\n")).catch(() => false);

  // ── Email (C-suite) ──
  const settings = await getSettings();
  let to = (settings.payrollEmails || "").split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) {
    const cs = await db.user.findMany({ where: { active: true, role: { in: ["admin", "manager"] } }, select: { email: true } });
    to = cs.map((u) => u.email).filter(Boolean);
  }
  const leverHtml = b.levers.map((l) => `
    <div style="border-left:4px solid ${l.light === "red" ? "#dc2626" : l.light === "yellow" ? "#d97706" : "#059669"};background:#f8fafc;border-radius:8px;padding:10px 12px;margin:8px 0;">
      <div style="font-weight:800;">${EMOJI[l.light]} ${l.title}</div>
      <div style="color:#334155;font-size:14px;margin:3px 0;">${l.headline}${l.wow ? ` <span style="color:#94a3b8;">(${l.wow})</span>` : ""}</div>
      <ul style="margin:6px 0 0;padding-left:18px;color:#059669;font-size:13px;">${l.actions.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
    </div>`).join("");
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:640px;margin:0 auto;color:#0b1f3a;">
    <h2 style="margin:0 0 2px;">🩺 War Room Bottleneck — ${today}</h2>
    <p style="color:#64748b;margin:0 0 12px;">Where the machine leaks across marketing, acquisitions, and dispositions. C-suite only.</p>
    <div style="background:#fff7f7;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;margin:0 0 12px;">
      <div style="font-weight:800;color:#b91c1c;">🚨 Biggest leak: ${biggest.title}</div>
      <div style="color:#7f1d1d;margin:4px 0;">${escapeHtml(biggest.headline)}</div>
    </div>
    ${leverHtml}
    <div style="background:#f1f5f9;border-radius:8px;padding:10px 12px;margin-top:10px;font-weight:700;color:${b.closer === false ? "#b91c1c" : "#047857"};">${escapeHtml(b.verdict)}</div>
    <p style="color:#94a3b8;font-size:13px;margin-top:12px;">Open the full live diagnostic → <a href="${link}">${link}</a></p>
  </div>`;
  const emailed = to.length ? await sendEmailTo(to, `🩺 War Room Bottleneck — ${today}`, html) : false;

  await appendSnap(snapOf(b)).catch(() => { /* non-fatal */ });
  return { posted, emailed };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
