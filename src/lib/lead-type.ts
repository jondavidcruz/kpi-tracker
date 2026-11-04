// 🏷 Lead-type badge (Jon 2026-10-21): every opportunity card shows what KIND of
// lead it is — our three main types — so the team can tell them apart at a glance.
// Sellers split into land vs property. Client-safe: pure functions only.
export type LeadKind = "seller" | "seller_land" | "seller_property" | "buyer_agent" | "developer";

export type LeadBadge = { label: string; cls: string };

export function leadTypeBadge(kind: LeadKind): LeadBadge {
  switch (kind) {
    case "buyer_agent": return { label: "🧑‍💼 Agent", cls: "bg-sky-100 text-sky-700 ring-sky-200" };
    case "developer": return { label: "🏗 Developer", cls: "bg-violet-100 text-violet-700 ring-violet-200" };
    case "seller_land": return { label: "⛰️ Seller", cls: "bg-amber-100 text-amber-800 ring-amber-200" };
    case "seller_property": return { label: "🏠 Seller", cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" };
    default: return { label: "🧑 Seller", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  }
}

/** Seller land vs property, from the land-intake block or a land pipeline name. */
export function sellerKind(formData: unknown, pipeline?: string): LeadKind {
  const fd = formData as { land?: unknown; propertyType?: string } | null;
  const land = fd?.land;
  const hasLand = !!land && typeof land === "object" && Object.keys(land as object).length > 0;
  if (hasLand || /\bland\b/i.test(pipeline ?? "")) return "seller_land";
  return "seller_property";
}

// 🏷 ONE lead badge, no doubles (Jon 2026-11-04): a land seller used to show BOTH
// "⛰️ Seller" and a separate "🏞 Land" chip. We now collapse role + land/home into a
// single compact badge. `role` is seller / agent / developer; `kind` is the resolved
// land|home (manual override honored upstream via resolveLeadKind). For a developer or
// agent the kind is irrelevant. For a seller, land/home carries the "Seller" meaning —
// every card on a seller board is a seller, so the word is redundant with the icon.
export function unifiedLeadBadge(role: LeadKind, kind: "land" | "home" | ""): LeadBadge {
  if (role === "buyer_agent") return { label: "🧑‍💼 Agent", cls: "bg-sky-100 text-sky-700 ring-sky-200" };
  if (role === "developer") return { label: "🏗 Developer", cls: "bg-violet-100 text-violet-700 ring-violet-200" };
  if (kind === "land" || role === "seller_land") return { label: "🏞 Land", cls: "bg-lime-100 text-lime-700 ring-lime-200" };
  if (kind === "home" || role === "seller_property") return { label: "🏡 House", cls: "bg-orange-100 text-orange-700 ring-orange-200" };
  return { label: "🧑 Seller", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
}
