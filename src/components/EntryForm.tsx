"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatValue, fromInput, inputSuffix, type Unit } from "@/lib/format";
import { statusClasses, statusVsGoal, type Status } from "@/lib/kpi";
import { measureDownloadMbps } from "@/lib/speedtest-client";
import { KpiLabel } from "@/lib/kpiIcons";

export interface EntryItem {
  kpiId: string;
  kpiKey: string; // stable slug, used to enable special inputs (e.g. speed test)
  name: string;
  emoji: string;
  unit: Unit;
  goalValue: number | null;
  goalKind: string;
  userId: string; // "" for team scope
  initial: string; // input-ready value (minutes for duration)
}

export interface EntryGroup {
  title: string;
  hint?: string;
  items: EntryItem[];
}

export default function EntryForm({
  groups,
  date,
  enteredBy,
  action,
}: {
  groups: EntryGroup[];
  date: string;
  enteredBy: string;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="enteredBy" value={enteredBy} />
      {groups.map((g) => (
        <section key={g.title} className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4">
            <h2 className="font-semibold text-lg">{g.title}</h2>
            {g.hint && <p className="text-sm text-slate-500">{g.hint}</p>}
          </div>
          <div className="divide-y divide-slate-100">
            {g.items.map((item) => (
              <Field key={`${item.kpiId}|${item.userId}`} item={item} />
            ))}
          </div>
        </section>
      ))}
      <SaveBar />
    </form>
  );
}

function Field({ item }: { item: EntryItem }) {
  const [raw, setRaw] = useState(item.initial);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState("");
  // Parse exactly the way the server does (handles duration H:MM, decimal hours,
  // bare minutes) so the live status dot matches what actually gets saved.
  const stored = fromInput(item.unit, raw);
  const status: Status =
    stored === null ? "none" : statusVsGoal(item.goalKind, stored, item.goalValue);
  const cls = statusClasses(status);
  const suffix = inputSuffix(item.unit);
  const isSpeed = item.kpiKey === "internet_speed";

  async function runSpeedTest() {
    setTesting(true);
    setTestMsg("Testing… (about 8 seconds)");
    try {
      const result = await measureDownloadMbps((live) =>
        setTestMsg(`Testing… ${Math.round(live)} Mbps`),
      );
      const rounded = Math.max(1, Math.round(result.mbps));
      setRaw(String(rounded));
      setTestMsg(
        result.accurate
          ? `Measured ${rounded} Mbps. Remember to Save.`
          : `Rough estimate: ${rounded} Mbps (backup method). Remember to Save.`,
      );
    } catch {
      setTestMsg("Test failed. Check your connection and try again.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="py-2">
      {/* Top-down row: label on the left, value on the right */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-700">
            <KpiLabel kpiKey={item.kpiKey} name={item.name} />
          </div>
          {item.goalValue !== null && (
            <div className="text-xs text-slate-400">goal {formatValue(item.unit, item.goalValue)}</div>
          )}
        </div>
        <div
          className={`flex w-36 shrink-0 items-center rounded-lg border-2 px-2.5 ${cls.border} ${cls.bg} focus-within:ring-2 focus-within:ring-slate-400`}
        >
          {item.unit === "currency" && <span className="text-slate-400">$</span>}
          <input
            name={`v|${item.kpiId}|${item.userId}`}
            inputMode={item.unit === "duration" ? "text" : "decimal"}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={item.unit === "duration" ? "1:30" : "—"}
            className={`w-full bg-transparent py-2 text-right text-lg font-semibold outline-none ${cls.text}`}
            autoComplete="off"
          />
          {suffix && item.unit !== "currency" && (
            <span className="ml-1 text-sm text-slate-400">{suffix}</span>
          )}
          <span className={`ml-2 h-2.5 w-2.5 shrink-0 rounded-full ${cls.dot}`} />
        </div>
      </div>
      {isSpeed && (
        <div className="mt-1.5 flex items-center justify-end gap-2">
          {testMsg && <span className="text-xs text-slate-500">{testMsg}</span>}
          <button
            type="button"
            onClick={runSpeedTest}
            disabled={testing}
            className="rounded-md bg-brand-navy px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-navy-2 disabled:opacity-60"
          >
            {testing ? "Testing…" : "⚡️ Run speed test"}
          </button>
        </div>
      )}
    </div>
  );
}

function SaveBar() {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur border-t border-slate-200 flex items-center justify-end gap-3">
      <span className="text-sm text-slate-500">
        {pending ? "Saving…" : "Changes save when you click."}
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save day"}
      </button>
    </div>
  );
}
