// Value formatting + parsing by KPI unit.
// Storage conventions: duration in SECONDS, percent as the number (100 = 100%),
// currency/count/ratio as plain numbers.

export type Unit = "count" | "duration" | "percent" | "currency" | "ratio";

/** Format a stored value for display. */
export function formatValue(unit: Unit, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  switch (unit) {
    case "duration": {
      const total = Math.round(value);
      const h = Math.floor(total / 3600);
      const m = Math.round((total % 3600) / 60);
      return `${h}:${m.toString().padStart(2, "0")}`;
    }
    case "percent":
      return `${round(value)}%`;
    case "currency":
      return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    case "ratio":
      return value.toFixed(2);
    case "count":
    default:
      return round(value).toLocaleString();
  }
}

/** Short unit suffix for input fields. */
export function inputSuffix(unit: Unit): string {
  switch (unit) {
    case "duration":
      return "h:mm";
    case "percent":
      return "%";
    case "currency":
      return "$";
    default:
      return "";
  }
}

/** Convert a stored value into the text shown in an entry input.
 *  Duration is shown as H:MM to match how the goal is displayed. */
export function toInputNumber(unit: Unit, value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (unit === "duration") {
    const total = Math.round(value);
    const h = Math.floor(total / 3600);
    const m = Math.round((total % 3600) / 60);
    return `${h}:${m.toString().padStart(2, "0")}`;
  }
  return String(value);
}

/** Convert raw input text back into a stored value. Returns null if blank/invalid.
 *  Duration accepts H:MM ("1:30"), bare minutes ("90"), or decimal hours via
 *  an explicit "h" suffix ("1.5h") — so the team can type it however feels natural. */
export function fromInput(unit: Unit, raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (unit === "duration") {
    // H:MM form, e.g. "1:30" or "0:45"
    const hm = trimmed.match(/^(\d+):([0-5]?\d)$/);
    if (hm) {
      const h = Number(hm[1]);
      const m = Number(hm[2]);
      return h * 3600 + m * 60;
    }
    // decimal-hours form, e.g. "1.5h"
    const hrs = trimmed.match(/^([\d.]+)\s*h$/i);
    if (hrs) {
      const v = Number(hrs[1]);
      return Number.isNaN(v) ? null : Math.round(v * 3600);
    }
    // bare number = minutes (e.g. "90")
    const mins = Number(trimmed.replace(/[,\s]/g, ""));
    return Number.isNaN(mins) ? null : Math.round(mins * 60);
  }

  const n = Number(trimmed.replace(/[$,%\s]/g, ""));
  if (Number.isNaN(n)) return null;
  return n;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
