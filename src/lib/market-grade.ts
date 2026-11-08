// 🏅 Market / list quality grade (Jon 2026-11-08). Rate each market or explored area A–D by how well
// it actually PRODUCES — inbound seller leads generated + land deals closed there — so we know which
// lists are good enough to invest in DIRECT MAIL (today it's only text / call / email; direct mail is
// the next spend once a market proves out). Optionally factors the response rate when we know how many
// leads we pulled from that area. Pure + client-safe (no server imports).

export type Grade = "A" | "B" | "C" | "D" | "—";
export type MarketGrade = { grade: Grade; label: string; color: string; reason: string };

/** Grade a market/area from what it produced. deals = land deals CLOSED there (proven); leads =
 *  inbound seller leads generated there; pulled = how many we pulled (optional → response rate). */
export function gradeMarket(input: { leads: number; deals: number; pulled?: number | null }): MarketGrade {
  const leads = Math.max(0, input.leads || 0);
  const deals = Math.max(0, input.deals || 0);
  const pulled = input.pulled != null && input.pulled > 0 ? input.pulled : null;
  const rate = pulled ? leads / pulled : null;
  const rateStr = rate != null ? ` · ${(rate * 100).toFixed(1)}% of ${pulled} pulled` : "";

  // A — proven: we've CLOSED a land deal here. The strongest signal a list is worth direct mail.
  if (deals >= 1) return { grade: "A", label: "A · proven — closed here", color: "#10b981", reason: `${deals} deal${deals > 1 ? "s" : ""} closed · ${leads} lead${leads === 1 ? "" : "s"}${rateStr}` };
  // B — strong response (lots of inbound, or a solid response rate on what we pulled).
  if (leads >= 8 || (rate != null && rate >= 0.04 && leads >= 4)) return { grade: "B", label: "B · strong response", color: "#22c55e", reason: `${leads} leads${rateStr}` };
  // C — some response.
  if (leads >= 3) return { grade: "C", label: "C · some response", color: "#f59e0b", reason: `${leads} leads${rateStr}` };
  // D — weak (a trickle).
  if (leads >= 1) return { grade: "D", label: "D · weak", color: "#f97316", reason: `${leads} lead${leads > 1 ? "s" : ""}${rateStr}` };
  // — untested (never produced / nothing pulled yet).
  return { grade: "—", label: pulled ? "— no response yet" : "— untested", color: "#64748b", reason: pulled ? `0 of ${pulled} pulled responded` : "no leads yet" };
}

/** A/B markets have proven inbound response → worth the direct-mail investment. */
export function directMailReady(g: Grade): boolean { return g === "A" || g === "B"; }
