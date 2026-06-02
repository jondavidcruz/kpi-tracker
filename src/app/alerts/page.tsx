import { setAlertStatus } from "@/app/actions";
import { db } from "@/lib/db";
import { friendlyDate } from "@/lib/date";
import { formatValue, type Unit } from "@/lib/format";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "open", label: "Open" },
  { key: "ack", label: "Acknowledged" },
  { key: "resolved", label: "Resolved" },
];

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ?? "open";

  const [alerts, counts] = await Promise.all([
    db.alert.findMany({
      where: { status },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      include: { kpi: true, user: true },
      take: 200,
    }),
    Promise.all(
      TABS.map(async (t) => [t.key, await db.alert.count({ where: { status: t.key } })] as const),
    ).then((e) => Object.fromEntries(e) as Record<string, number>),
  ]);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Alerts"
        subtitle="Off-target KPIs flagged automatically"
        accent="bg-red-400"
      />

      <div className="flex gap-2">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={`/alerts?status=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              status === t.key
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
            }`}
          >
            {t.label} <span className="tabular-nums">({counts[t.key] ?? 0})</span>
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {alerts.map((a) => {
          const hard = a.severity === "hard";
          const unit = a.kpi.unit as Unit;
          const behind = Math.max(0, a.expected - a.actual);
          return (
            <Card
              key={a.id}
              className={`border-l-4 ${hard ? "border-l-red-500" : "border-l-amber-400"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                      hard ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {hard ? "MONEY KPI" : "ACTIVITY"}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-800">
                      {a.kpi.emoji} {a.message}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                      <span>{friendlyDate(a.date)}</span>
                      <span>·</span>
                      <span>{a.user ? a.user.name : "Team"}</span>
                      {behind > 0 && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600 tabular-nums">
                          gap {formatValue(unit, behind)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {status !== "ack" && <StatusButton id={a.id} to="ack" label="Acknowledge" />}
                  {status !== "resolved" && <StatusButton id={a.id} to="resolved" label="Resolve" primary />}
                  {status === "resolved" && <StatusButton id={a.id} to="open" label="Reopen" />}
                </div>
              </div>
            </Card>
          );
        })}
        {alerts.length === 0 && (
          <Card className="p-12 text-center text-slate-400">No {status} alerts. 🎉</Card>
        )}
      </div>
    </div>
  );
}

function StatusButton({
  id,
  to,
  label,
  primary,
}: {
  id: string;
  to: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <form action={setAlertStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={to} />
      <button
        className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
          primary
            ? "bg-slate-900 text-white hover:bg-slate-700"
            : "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
