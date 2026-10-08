// 🔀 Pipeline streamlining (Jon approved 2026-10-08): merged stages map to
// their survivors. Used by the one-time migration AND the GHL importer, so a
// re-import can never resurrect a retired stage key.

// Both acquisitions pipelines (AQM: Michelle + JrAQ: Nick) share one template.
export const ACQ_STAGE_ALIASES: Record<string, string> = {
  apt_missed: "apt_set_process_offer_call",          // missed = badge/task, not a column
  developer_comp_offer: "comp_to_offer_24_hrs",      // the comp flow is ONE stage now
  comp_review_aqm: "comp_to_offer_24_hrs",
  nurture_hot_0_30d: "nurture",                      // one NURTURE — follow-up date says when
  nurture_warm_31_90d: "nurture",
  nurture_cold_91_120d: "nurture",
  nurture_process_120d: "nurture",
  ghosted_offer_expired: "nurture",
  nurture_contract: "contract_sent_f_u",
  contract_apt_missed: "contract_apt_set_sign",
};

// 🏆 DS: Signed Go Close — 10 → 7.
export const DS_STAGE_ALIASES: Record<string, string> = {
  off_market_21_30_days: "on_market",                // age badges express time, not columns
  on_market_90_120_days: "on_market",
  reduction_needed: "on_market",                     // tagged "reduction-needed" instead
  escrow_closed_95: "deal_won_100",                  // escrow closed = paid = won
};

export const ACQ_STAGES = [
  { key: "new_call_1_min", label: "🏁 NEW (Call <1 min)" },
  { key: "10_days_of_hell_qualify", label: "📞 10 DAYS OF HELL: Qualify" },
  { key: "process_call_f_u", label: "📲 PROCESS CALL F/U" },
  { key: "apt_set_process_offer_call", label: "📅 APT SET (Process/Offer Call)" },
  { key: "comp_to_offer_24_hrs", label: "🎯 COMP → OFFER (24 hrs)" },
  { key: "offer_call_asap", label: "🔫 OFFER CALL (ASAP)" },
  { key: "verbal_offer_negotiate", label: "⚓ VERBAL OFFER (Negotiate)" },
  { key: "contract_sent_f_u", label: "📩 CONTRACT SENT F/U" },
  { key: "contract_apt_set_sign", label: "📅 CONTRACT APT SET (Sign)" },
  { key: "contract_signed_dispo", label: "📝 CONTRACT SIGNED (Dispo)" },
  { key: "nurture", label: "⏳ NURTURE" },
];

export const DS_STAGES = [
  { key: "new_photos_day_1_4", label: "📸 NEW / PHOTOS (Day 1-4)" },
  { key: "delayed_lien", label: "🛑 DELAYED/LIEN" },
  { key: "on_market", label: "📣 ON MARKET" },
  { key: "escrow_opened_70", label: "🟡 ESCROW OPENED (70%)" },
  { key: "closing_scheduled_90", label: "🚦 CLOSING SCHEDULED (90%)" },
  { key: "deal_won_100", label: "💰 DEAL WON (100%)" },
  { key: "deal_died", label: "🪦 DEAL DIED" },
];
