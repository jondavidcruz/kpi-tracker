"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { formatValue, inputSuffix, type Unit } from "@/lib/format";
import { statusClasses, statusVsGoal, type Status } from "@/lib/kpi";

export interface EntryItem {
  kpiId: string;
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
  const numeric =
    raw.trim() === "" ? null : Number(raw.replace(/[$,%\s]/g, ""));
  // For duration the input is minutes; convert to seconds to compare with goal.
  const stored =
    numeric === null ? null : item.unit === "duration" ? numeric * 60 : numeric;
  const status: Status =
    stored === null ? "none" : statusVsGoal(item.goalKind, stored, item.goalValue);
  const cls = statusClasses(status);
  const suffix = inputSuffix(item.unit);

  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-slate-700">
          {item.emoji} {item.name}
        </span>
        {item.goalValue !== null && (
          <span className="text-xs text-slate-400">
            goal {formatValue(item.unit, item.goalValue)}
          </span>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border-2 px-3 ${cls.border} ${cls.bg} focus-within:ring-2 focus-within:ring-slate-400`}
      >
        {item.unit === "currency" && <span className="text-slate-400 mr-1">$</span>}
        <input
          name={`v|${item.kpiId}|${item.userId}`}
          inputMode="decimal"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="—"
          className={`w-full bg-transparent py-2.5 text-xl font-semibold outline-none ${cls.text}`}
          autoComplete="off"
        />
        {suffix && item.unit !== "currency" && (
          <span className="text-slate-400 text-sm ml-1">{suffix}</span>
        )}
        <span className={`ml-2 h-2.5 w-2.5 rounded-full ${cls.dot}`} />
      </div>
    </label>
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
