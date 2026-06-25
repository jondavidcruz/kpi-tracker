// A true funnel: each stage is a trapezoid that tapers toward the next, so the
// shape narrows top → bottom like a real funnel. Conversion % shown per stage.
export default function DealFunnel({ stages }: { stages: { label: string; count: number; source: string }[] }) {
  if (stages.length === 0) return null;
  const W = 440;        // funnel width band
  const OX = 140;       // left offset — wide enough that source labels never clip
  const STAGE_H = 54;
  const H = stages.length * STAGE_H + 6;
  const cx = OX + W / 2;
  const top = Math.max(1, stages[0].count);
  // Widths must NEVER widen going down — a funnel narrows. Clamp each stage to be no
  // wider than the one above it, even when a later stage was logged with a higher count
  // (e.g. more conversations than leads, since leads carry over across months).
  let prevW = 1;
  const widths = stages.map((s) => { const w = Math.max(0.16, Math.min(prevW, s.count / top)); prevW = w; return w; });

  return (
    <svg viewBox={`0 0 690 ${H}`} className="w-full" role="img" aria-label="Deal funnel: leads through closed">
      <defs>
        <linearGradient id="funnelFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1f4e79" />
          <stop offset="1" stopColor="#0b1f3a" />
        </linearGradient>
      </defs>
      {stages.map((s, i) => {
        const wTop = widths[i] * W;
        const wBot = (i < stages.length - 1 ? widths[i + 1] : widths[i] * 0.88) * W;
        const y = i * STAGE_H + 3;
        const yb = y + STAGE_H - 6;
        const pts = `${cx - wTop / 2},${y} ${cx + wTop / 2},${y} ${cx + wBot / 2},${yb} ${cx - wBot / 2},${yb}`;
        const prev = i > 0 ? stages[i - 1].count : null;
        const conv = prev && prev > 0 ? Math.round((s.count / prev) * 100) : null;
        const midY = y + (STAGE_H - 6) / 2;
        return (
          <g key={s.label}>
            <polygon points={pts} fill="url(#funnelFill)" />
            <text x={cx} y={midY - 3} textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="600">{s.label}</text>
            <text x={cx} y={midY + 15} textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="700">{Math.round(s.count).toLocaleString()}</text>
            <text x={OX - 16} y={midY + 4} textAnchor="end" className="fill-slate-500" fontSize="11">{s.source}</text>
            {conv != null && <text x={OX + W + 14} y={midY + 4} textAnchor="start" className="fill-slate-500" fontSize="11" fontWeight="700">{conv}%</text>}
          </g>
        );
      })}
    </svg>
  );
}
