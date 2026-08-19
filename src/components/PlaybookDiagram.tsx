// How-it-works diagrams for the Playbooks — for visual learners.
// Each exit = the party flow (SVG) + "follow the money" (a dollar walk with
// real example numbers) so nobody has to read a paragraph to get the mechanics.
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

// "Follow the money" — a left-to-right dollar walk with big example numbers.
type MoneyTile = { emoji: string; label: string; value: string; tone?: "navy" | "gold" | "green" | "red" | "muted" };
function MoneyWalk({ tiles, punch }: { tiles: MoneyTile[]; punch: string }) {
  const toneCls: Record<string, string> = {
    navy: "border-indigo-200 bg-indigo-50 text-brand-navy",
    gold: "border-amber-300 bg-amber-50 text-amber-800",
    green: "border-emerald-300 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-600",
    muted: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return (
    <div className="mt-2 rounded-xl bg-white p-3 ring-1 ring-slate-200">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">💵 Follow the money — example numbers</div>
      <div className="flex flex-wrap items-stretch gap-1.5">
        {tiles.map((t, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span className={`flex min-w-[110px] flex-col justify-center rounded-xl border-2 px-3 py-2 text-center ${toneCls[t.tone ?? "muted"]}`}>
              <span className="text-[10.5px] font-semibold leading-tight opacity-80">{t.emoji} {t.label}</span>
              <span className="text-[17px] font-extrabold leading-tight tabular-nums">{t.value}</span>
            </span>
            {i < tiles.length - 1 && <span className="text-lg font-bold text-slate-300">→</span>}
          </span>
        ))}
      </div>
      <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-bold text-emerald-800">🎯 {punch}</div>
    </div>
  );
}

export default function PlaybookDiagram({ kind }: { kind: string }) {
  const wrap = (title: string, note: string, svg: React.ReactNode, money?: React.ReactNode) => (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">How it works</div>
      <div className="overflow-x-auto"><svg viewBox="0 0 720 150" className="min-w-[520px] w-full" role="img" aria-label={title}>{svg}</svg></div>
      <div className="mt-1 text-[12px] text-slate-500">{note}</div>
      {money}
    </div>
  );

  if (kind === "assignment") return wrap("Assignment flow", "One closing. You never take title — you assign your contract to the end buyer and your fee shows on the settlement statement.", (<>
    <Box x={20} y={50} w={170} label="SELLER" sub="signs with you" />
    <Arrow x1={190} x2={275} y={72} label="contract @ $530k" />
    <Box x={275} y={50} w={190} label="FREEDOM OFFERS" sub="holds the contract" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <Arrow x1={465} x2={550} y={72} label="assign @ $550k" color={GOLD} />
    <Box x={550} y={50} w={150} label="END BUYER" sub="closes + pays" />
    <text x={360} y={128} textAnchor="middle" fontSize="12" fontWeight="700" fill={GREEN}>1 closing · your assignment fee is visible on the HUD</text>
  </>), (
    <MoneyWalk
      tiles={[
        { emoji: "🏠", label: "End buyer pays", value: "$550,000", tone: "navy" },
        { emoji: "👤", label: "Seller walks with", value: "$530,000", tone: "muted" },
        { emoji: "💰", label: "OUR FEE", value: "$20,000", tone: "green" },
      ]}
      punch="One escrow. The $20k fee prints right on the settlement statement."
    />
  ));

  if (kind === "double_close") return wrap("Double close flow", "Two back-to-back closings. You buy (A→B), then immediately sell (B→C). Neither side sees your profit; you pay closing costs twice.", (<>
    <Box x={15} y={50} w={150} label="SELLER" />
    <Arrow x1={165} x2={250} y={72} label="A → B buy $520k" />
    <Box x={250} y={44} w={200} label="FREEDOM OFFERS" sub="briefly takes title" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <Arrow x1={450} x2={540} y={72} label="B → C sell $560k" color={GREEN} />
    <Box x={540} y={50} w={160} label="END BUYER" />
    <text x={360} y={124} textAnchor="middle" fontSize="12" fontWeight="700" fill={GOLD}>2 closings · 2 sets of closing costs · your spread stays private</text>
  </>), (
    <MoneyWalk
      tiles={[
        { emoji: "🏠", label: "End buyer pays (B→C)", value: "$560,000", tone: "navy" },
        { emoji: "👤", label: "Seller gets (A→B)", value: "$520,000", tone: "muted" },
        { emoji: "🧾", label: "Closing ×2 (we cover seller sides)", value: "−$16,000", tone: "red" },
        { emoji: "💰", label: "OUR SPREAD", value: "$24,000", tone: "green" },
      ]}
      punch="Costs come out of the spread — the double close buys privacy, not free money."
    />
  ));

  if (kind === "subject_to") return wrap("Subject-to flow", "You take title but leave the seller's existing loan in place — you don't assume it, you just make the payments to keep it current.", (<>
    <Box x={20} y={50} w={190} label="SELLER" sub="existing loan stays" />
    <Arrow x1={210} x2={300} y={72} label="deed / title" />
    <Box x={300} y={44} w={200} label="FREEDOM OFFERS" sub="takes title" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <line x1={400} y1={100} x2={400} y2={122} stroke={GREEN} strokeWidth={2} />
    <polygon points={`400,131 395,122 405,122`} fill={GREEN} />
    <Box x={300} y={131} w={200} label="LENDER" sub="we make the payments" fill="#ecfdf5" stroke="#a7f3d0" text={GREEN} />
    <text x={620} y={72} textAnchor="middle" fontSize="11" fill={SLATE}>+ seller note</text>
  </>), (
    <MoneyWalk
      tiles={[
        { emoji: "🏦", label: "Loan stays in place", value: "$380k · $2,100/mo", tone: "muted" },
        { emoji: "⬇️", label: "End buyer's down TO US", value: "$25,000", tone: "navy" },
        { emoji: "⬇️", label: "Down we owe the seller", value: "$0", tone: "muted" },
        { emoji: "💰", label: "OUR MARGIN", value: "$25,000 + fee", tone: "green" },
      ]}
      punch="We assign the terms — our money = assignment fee + the down-payment markup."
    />
  ));

  if (kind === "novation") return wrap("Novation flow", "You get it under contract and market it. Instead of assigning, you substitute a NEW agreement between the seller and the end buyer — title conveys directly to them; you keep the spread.", (<>
    <Box x={15} y={50} w={150} label="SELLER" />
    <Arrow x1={165} x2={250} y={72} label="contract" />
    <Box x={250} y={44} w={200} label="FREEDOM OFFERS" sub="markets / lists it" fill="#eef2ff" stroke="#c7d2fe" text={NAVY} />
    <Arrow x1={450} x2={540} y={72} label="novate" color={GOLD} />
    <Box x={540} y={50} w={160} label="END BUYER" />
    <line x1={90} y1={94} x2={620} y2={94} stroke={LINE} strokeWidth={1.5} strokeDasharray="5 4" />
    <text x={360} y={112} textAnchor="middle" fontSize="11" fontWeight="700" fill={SLATE}>new agreement: Seller ⇄ End Buyer — title conveys directly</text>
    <text x={360} y={130} textAnchor="middle" fontSize="12" fontWeight="700" fill={GREEN}>your fee = end-buyer price − seller&apos;s net</text>
  </>), (
    <MoneyWalk
      tiles={[
        { emoji: "🏷️", label: "Retail buyer pays (MLS)", value: "$600,000", tone: "navy" },
        { emoji: "🧾", label: "Commission + closing", value: "−$39,000", tone: "red" },
        { emoji: "👤", label: "Seller's max payout", value: "$531,000", tone: "muted" },
        { emoji: "💰", label: "OUR FEE", value: "$30,000", tone: "green" },
      ]}
      punch="Retail price on the MLS is why novation usually beats a cash offer for the seller."
    />
  ));

  // Side-by-side exit comparison — pick the lane visually, no reading required.
  if (kind === "exit_compare") {
    const cols = [
      {
        emoji: "🤝", name: "Assignment", tone: "border-indigo-200 bg-indigo-50",
        rows: [["⚡ Speed", "30–45 days"], ["💵 Seller price", "Deepest discount"], ["🔒 Fee privacy", "On the HUD (visible)"], ["🧾 Closings", "1"], ["💰 Typical fee", "$10–20k"]],
        best: "Fast cash deal, buyer lined up",
      },
      {
        emoji: "📋", name: "Novation", tone: "border-emerald-200 bg-emerald-50",
        rows: [["⚡ Speed", "3–6 months (MLS)"], ["💵 Seller price", "HIGHEST payout"], ["🔒 Fee privacy", "Private"], ["🧾 Closings", "1 (retail)"], ["💰 Typical fee", "Biggest spread"]],
        best: "Seller wants top dollar & can wait",
      },
      {
        emoji: "🔁", name: "Double close", tone: "border-amber-200 bg-amber-50",
        rows: [["⚡ Speed", "Same as cash"], ["💵 Seller price", "Same as assignment"], ["🔒 Fee privacy", "Fully private"], ["🧾 Closings", "2 (costs ×2)"], ["💰 Typical fee", "Spread − 2× closing"]],
        best: "Big spread you don't want seen",
      },
    ];
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Pick your exit — side by side</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {cols.map((c) => (
            <div key={c.name} className={`rounded-xl border-2 p-3 ${c.tone}`}>
              <div className="text-center text-2xl">{c.emoji}</div>
              <div className="text-center text-sm font-extrabold text-slate-800">{c.name}</div>
              <div className="mt-2 space-y-1">
                {c.rows.map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-2 rounded-md bg-white/70 px-2 py-1">
                    <span className="text-[10.5px] font-semibold text-slate-500">{k}</span>
                    <span className="text-right text-[11.5px] font-bold text-slate-700">{v}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 rounded-lg bg-white px-2 py-1.5 text-center text-[11px] font-bold text-slate-600">👉 {c.best}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
