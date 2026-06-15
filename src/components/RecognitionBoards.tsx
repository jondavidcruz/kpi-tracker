import type { Champion, AiChampion } from "@/lib/awards";

const medal = (i: number) => ["🥇", "🥈", "🥉"][i] ?? "🏅";
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export default function RecognitionBoards({
  champions, aiChampions, variant = "light",
}: { champions: Champion[]; aiChampions: AiChampion[]; variant?: "light" | "dark" }) {
  const dark = variant === "dark";
  const panel = dark ? "rounded-2xl bg-white/5 p-5 ring-1 ring-white/10" : "rounded-2xl bg-white p-5 ring-1 ring-slate-200/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
  const head = dark ? "text-white" : "text-slate-700";
  const sub = dark ? "text-white/50" : "text-slate-400";
  const row = dark ? "bg-white/5" : "bg-slate-50";
  const name = dark ? "text-white" : "text-slate-800";
  const meta = dark ? "text-brand-gold-soft" : "text-slate-500";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Top performers */}
      <div className={panel}>
        <h3 className={`mb-3 text-sm font-bold ${head}`}>🏆 Top Performer Hall of Fame</h3>
        {champions.length === 0 ? (
          <p className={`text-sm ${sub}`}>Builds up every Monday — last week&apos;s standouts get logged automatically.</p>
        ) : (
          <ul className="space-y-1.5">
            {champions.slice(0, 6).map((c, i) => (
              <li key={c.rep} className={`flex items-center gap-2 rounded-lg ${row} px-3 py-2`}>
                <span className="text-lg">{medal(i)}</span>
                <span className={`flex-1 font-semibold ${name}`}>{c.rep} {c.reigning && "👑"}</span>
                {c.streak > 1 && <span className="text-xs font-semibold text-orange-500">🔥 {c.streak}-wk</span>}
                <span className={`text-sm font-bold ${meta}`}>{c.wins} win{c.wins === 1 ? "" : "s"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* AI champions */}
      <div className={panel}>
        <h3 className={`mb-3 text-sm font-bold ${head}`}>🤖 AI Champions</h3>
        {aiChampions.length === 0 ? (
          <p className={`text-sm ${sub}`}>No proven AI processes yet — build one and earn a bonus.</p>
        ) : (
          <ul className="space-y-1.5">
            {aiChampions.slice(0, 6).map((c, i) => (
              <li key={c.rep} className={`flex items-center gap-2 rounded-lg ${row} px-3 py-2`}>
                <span className="text-lg">{medal(i)}</span>
                <span className={`flex-1 font-semibold ${name}`}>{c.rep}</span>
                {c.reward > 0 && <span className="text-xs font-semibold text-emerald-500">{money(c.reward)}</span>}
                <span className={`text-sm font-bold ${meta}`}>{c.count} proven</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
