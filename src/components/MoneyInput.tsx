"use client";
// 💵 Deal-value input that always shows "$13,000" (Jon 2026-11-04). People type "13k" or
// "13000"; this shows a clean, $-prefixed, comma-grouped amount and reformats on blur. It
// submits the formatted text under `name`; the server (parseLooseMoney) reads it back to a
// number, so "13k" and "$13,000" both save as 13000.
import { useState } from "react";
import { parseLooseMoney, fmtDollars } from "@/lib/money";

export default function MoneyInput({ name, defaultValue, className, placeholder = "$0" }: {
  name: string; defaultValue: number | null | undefined; className?: string; placeholder?: string;
}) {
  const [text, setText] = useState(defaultValue != null ? fmtDollars(defaultValue) : "");
  return (
    <input
      name={name}
      value={text}
      inputMode="decimal"
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { const n = parseLooseMoney(text); setText(n != null ? fmtDollars(n) : ""); }}
      className={className}
    />
  );
}
