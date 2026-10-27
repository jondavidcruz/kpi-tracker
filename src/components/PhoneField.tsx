"use client";
// 📞 Phone input that warns, live, when the number isn't a valid US number (Jon 2026-10-27:
// a shifted/partial number was texting the wrong place). Drop-in for a contact phone field.
import { useState } from "react";
import { phoneWarn } from "@/lib/phone";

export default function PhoneField({ name, defaultValue = "", className = "", placeholder }: {
  name: string; defaultValue?: string; className?: string; placeholder?: string;
}) {
  const [v, setV] = useState(defaultValue);
  const warn = phoneWarn(v);
  return (
    <span className="block">
      <input
        name={name} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder}
        inputMode="tel"
        className={`${className} ${warn ? "!border-red-300 !bg-red-50 !text-red-700" : ""}`}
      />
      {warn && <span className="mt-0.5 block text-[10px] font-semibold text-red-600">⚠️ {warn}</span>}
    </span>
  );
}
