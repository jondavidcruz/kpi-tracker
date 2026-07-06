// Simple, flat how-it-works diagrams for the Playbooks — for visual learners.
const NAVY = "#0b1f3a", GOLD = "#b8862f", SLATE = "#475569", GREEN = "#047857", LINE = "#94a3b8";

function Box({ x, y, w, label, sub, fill = "#f1f5f9", stroke = "#cbd5e1", text = SLATE }: { x: number; y: number; w: number; label: string; sub?: string; fill?: string; stroke?: string; text?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={sub ? 56 : 44} rx={10} fill={fill} stroke={stroke} strokeWidth={1.5} />
      <text x={x + w / 2} y={sub ? y + 24 : y + 27} textAnchor="middle" fontSize="15" fontWeight="700" fill={text}>{label}</text>
      {sub && <text x={x + w / 2} y={y + 42} textAnchor="middle" fontSize="11" fill={text} opacity="0.8">{sub}</text>}
    </g>
  );
}
function Arrow({ x1, x2, y, label, color = NAVY }: { x1: number; x2: number; y: number; label?: string; color?: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2 - 8} y2={y} stroke={color} strokeWidth={2} />
      <polygon points={`${x2},${y} ${x2 - 9},${y - 5} ${x2 - 9},${y + 5}`} fill={color} />
      {label && <text x={(x1 + x2) / 2} y={y - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill={color}>{label}</text>}
    </g>
  );
}

export default function PlaybookDiagram({ kind }: { kind: string }) {
  const wrap = (title: string, note: string, svg: React.ReactNode) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">How it works</div>
      <div className="overflow-x-auto"><svg viewBox="0 0 720 150" className="min-w-[520px] w-full" role="img" aria-label={title}>{svg}</svg></div>
      <div className="mt-1 text-[12px] text-slate-500">{note}</div>
    </div>
  );

  if (kind === "assignment") return wrap("Assignment flow", "One closing. You never take title — you assign your contract to the end buyer and your fee shows on the settlement statement.", (<>
    <Box x={20} y={50} w={170} label="SELLER" sub="signs with you" />
    <Arrow x1={190} x2={275} y={72} label="contract" />
    <Box x={275} y={50} w={190} label="FREEDOM OFFERS" sub="holds the contract" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <Arrow x1={465} x2={550} y={72} label="assign + fee" color={GOLD} />
    <Box x={550} y={50} w={150} label="END BUYER" sub="closes + pays" />
    <text x={360} y={128} textAnchor="middle" fontSize="12" fontWeight="700" fill={GREEN}>1 closing · your assignment fee is visible on the HUD</text>
  </>));

  if (kind === "double_close") return wrap("Double close flow", "Two back-to-back closings. You buy (A→B), then immediately sell (B→C). Neither side sees your profit; you pay closing costs twice.", (<>
    <Box x={15} y={50} w={150} label="SELLER" />
    <Arrow x1={165} x2={250} y={72} label="A → B (buy)" />
    <Box x={250} y={44} w={200} label="FREEDOM OFFERS" sub="briefly takes title" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <Arrow x1={450} x2={540} y={72} label="B → C (sell)" color={GREEN} />
    <Box x={540} y={50} w={160} label="END BUYER" />
    <text x={360} y={124} textAnchor="middle" fontSize="12" fontWeight="700" fill={GOLD}>2 closings · 2 sets of closing costs · your spread stays private</text>
  </>));

  if (kind === "subject_to") return wrap("Subject-to flow", "You take title but leave the seller's existing loan in place — you don't assume it, you just make the payments to keep it current.", (<>
    <Box x={20} y={50} w={190} label="SELLER" sub="existing loan stays" />
    <Arrow x1={210} x2={300} y={72} label="deed / title" />
    <Box x={300} y={44} w={200} label="FREEDOM OFFERS" sub="takes title" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <line x1={400} y1={100} x2={400} y2={122} stroke={GREEN} strokeWidth={2} />
    <polygon points={`400,131 395,122 405,122`} fill={GREEN} />
    <Box x={300} y={131} w={200} label="LENDER" sub="we make the payments" fill="#ecfdf5" stroke="#a7f3d0" text={GREEN} />
    <text x={620} y={72} textAnchor="middle" fontSize="11" fill={SLATE}>+ seller note</text>
  </>));

  if (kind === "novation") return wrap("Novation flow", "You get it under contract and market it. Instead of assigning, you substitute a NEW agreement between the seller and the end buyer — title conveys directly to them; you keep the spread.", (<>
    <Box x={15} y={50} w={150} label="SELLER" />
    <Arrow x1={165} x2={250} y={72} label="contract" />
    <Box x={250} y={44} w={200} label="FREEDOM OFFERS" sub="markets / lists it" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <Arrow x1={450} x2={540} y={72} label="novate" color={GOLD} />
    <Box x={540} y={50} w={160} label="END BUYER" />
    <line x1={90} y1={94} x2={620} y2={94} stroke={LINE} strokeWidth={1.5} strokeDasharray="5 4" />
    <text x={360} y={112} textAnchor="middle" fontSize="11" fontWeight="700" fill={SLATE}>new agreement: Seller ⇄ End Buyer — title conveys directly</text>
    <text x={360} y={130} textAnchor="middle" fontSize="12" fontWeight="700" fill={GREEN}>your fee = end-buyer price − seller&apos;s net</text>
  </>));

  return null;
}
