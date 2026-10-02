// Packet context extraction (Jon 2026-10-02): seller call notes are NOT printed
// in the packet — they're ANALYZED. Claude pulls only explicitly-stated facts
// (utilities, improvements, access, setbacks, species) and those fill the
// diligence rows as "Per seller: … — verify" plus short Site Highlights.
// Cached by notes-hash in DiligenceCache so regenerations don't re-bill.
import { fetchCached } from "@/lib/geo/fetchCached";

export type SellerFacts = {
  utilitiesWater: string;
  utilitiesSewer: string;
  electric: string;
  setbacks: string;
  species: string;
  highlights: string[]; // short, factual, sellable: "Cleared + filled 2023"
};

const EMPTY: SellerFacts = { utilitiesWater: "", utilitiesSewer: "", electric: "", setbacks: "", species: "", highlights: [] };

export async function extractSellerFacts(notes: string): Promise<SellerFacts> {
  const text = (notes ?? "").trim().slice(0, 4000);
  if (!text || text.length < 15 || !process.env.ANTHROPIC_API_KEY) return EMPTY;
  return fetchCached<SellerFacts>("sellerx", { text }, async () => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 600,
        system: `You extract land-deal facts from a wholesaler's seller-call notes for an offering packet. Return ONLY JSON:
{"utilitiesWater":"","utilitiesSewer":"","electric":"","setbacks":"","species":"","highlights":[]}
Rules: include ONLY facts the notes explicitly state (never guess or infer); each field a short phrase ("county water at street", "septic needed") or "" if not mentioned; highlights = up to 4 short factual selling points about the SITE (improvements, clearing, fill, access, survey, utilities) — no pricing, no seller's personal situation, no motivation/distress details.`,
        messages: [{ role: "user", content: text }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const j = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const raw = j.content?.find((c) => c.type === "text")?.text ?? "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return EMPTY;
    try {
      const p = JSON.parse(m[0]) as Partial<SellerFacts>;
      return {
        utilitiesWater: String(p.utilitiesWater ?? "").slice(0, 120),
        utilitiesSewer: String(p.utilitiesSewer ?? "").slice(0, 120),
        electric: String(p.electric ?? "").slice(0, 120),
        setbacks: String(p.setbacks ?? "").slice(0, 120),
        species: String(p.species ?? "").slice(0, 120),
        highlights: (Array.isArray(p.highlights) ? p.highlights : []).map((h) => String(h).slice(0, 90)).slice(0, 4),
      };
    } catch { return EMPTY; }
  });
}
