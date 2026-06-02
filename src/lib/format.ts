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
      return "min";
    case "percent":
      return "%";
    case "currency":
      return "$";
    default:
      return "";
  }
}

/** Convert a stored value into the number shown in an entry input. */
export function toInputNumber(unit: Unit, value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (unit === "duration") return String(Math.round(value / 60)); // seconds -> minutes
  return String(value);
}

/** Convert raw input text back into a stored value. Returns null if blank/invalid. */
export function fromInput(unit: Unit, raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed.replace(/[$,%\s]/g, ""));
  if (Number.isNaN(n)) return null;
  if (unit === "duration") return Math.round(n * 60); // minutes -> seconds
  return n;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
