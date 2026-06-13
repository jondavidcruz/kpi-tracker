// Shared presentational building blocks for a cohesive, polished look.
import type { Status } from "@/lib/kpi";

// Strip a leading emoji from a heading so titles read clean (the colored accent
// bar carries the visual marker now).
function stripEmoji(s: string): string {
  return s.replace(/^(?:\p{Extended_Pictographic}|️|‍)+\s*/u, "");
}

const PILL_TONES = {
  good: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  watch: "bg-amber-50 text-amber-700 ring-amber-200",
  bad: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/** A small status pill — replaces colored dots / emoji status markers. */
export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: keyof typeof PILL_TONES;
}) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${PILL_TONES[tone]}`}>
      {children}
    </span>
  );
}

/** A refined metric card: label, big tabular value, optional hint + icon. */
export function MetricCard({
  label,
  value,
  hint,
  hintTone = "neutral",
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  hintTone?: "good" | "bad" | "neutral";
  icon?: React.ReactNode;
}) {
  const hc = hintTone === "good" ? "text-emerald-600" : hintTone === "bad" ? "text-red-600" : "text-slate-400";
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {hint && <div className={`mt-0.5 text-xs ${hc}`}>{hint}</div>}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  accent = "bg-slate-300",
  right,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span className={`h-5 w-1 rounded-full ${accent}`} />
        <div>
          <h2 className="text-base font-semibold leading-tight tracking-tight text-slate-900">{stripEmoji(title)}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Legend() {
  const items = [
    { c: "bg-emerald-500", t: "On goal" },
    { c: "bg-amber-500", t: "Close" },
    { c: "bg-red-500", t: "Behind" },
    { c: "bg-slate-300", t: "Tracked" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
      {items.map((i) => (
        <span key={i.t} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${i.c}`} />
          {i.t}
        </span>
      ))}
    </div>
  );
}

/** Progress toward a goal, with an optional expected-pace marker. */
export function ProgressBar({
  pct,
  status,
  paceMarker,
}: {
  pct: number;
  status: Status;
  paceMarker?: number; // 0..100, draws a vertical tick
}) {
  const fill =
    status === "hit"
      ? "bg-emerald-500"
      : status === "close"
        ? "bg-amber-500"
        : status === "miss"
          ? "bg-red-500"
          : "bg-slate-300";
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-200">
      <div
        className={`absolute inset-y-0 left-0 rounded-full ${fill} transition-all`}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
      {paceMarker !== undefined && (
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-600/70"
          style={{ left: `${Math.max(0, Math.min(100, paceMarker))}%` }}
          title="expected pace"
        />
      )}
    </div>
  );
}

export function SummaryStat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  tone?: "slate" | "emerald" | "amber" | "red";
}) {
  const map = {
    slate: "text-slate-800",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-red-600",
  } as const;
  return (
    <div className="text-center">
      <div className={`text-2xl font-extrabold tabular-nums ${map[tone]}`}>{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}
