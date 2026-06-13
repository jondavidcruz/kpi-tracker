// Shared presentational building blocks for a cohesive, polished look.
import type { Status } from "@/lib/kpi";

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
          <h2 className="text-base font-semibold leading-tight tracking-tight text-slate-900">{title}</h2>
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
