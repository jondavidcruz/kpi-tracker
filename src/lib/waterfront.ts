// 🌊 Waterfront detection (Jon 2026-10-28, Jonathan Duong call): target waterfront land —
// wealthy buyers aren't affected by rising rates and keep building. Flags a lead whose Land
// Details say it's on/near water so the team markets those first. Pure + client-safe.
const WATER = /waterfront|water ?front|water view|lake ?front|lake|creek|river ?front|riverfront|\briver\b|pond|canal|\bgulf\b|ocean ?front|oceanfront|\bbay\b|bayfront|intracoastal|\bmarsh\b|\binlet\b|waterway/i;

export function isWaterfront(formData: unknown): boolean {
  const fd = (formData ?? null) as Record<string, unknown> | null;
  const land = (fd?.land ?? null) as Record<string, unknown> | null;
  if (!land) return false;
  const feats = Array.isArray(land.features) ? (land.features as unknown[]).map(String).join(" ") : String(land.features ?? "");
  const text = [land.special, land.develop, land.build, land.hazard].map((v) => String(v ?? "")).join(" ");
  return WATER.test(feats + " " + text);
}
