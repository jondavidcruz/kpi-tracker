// 🎨 One source of truth for per-section colors (Jon 2026-10-29: "same colours on the full
// view as the Quick Notes view"). Keyed by section key; accepts "form:land" or "land".
export type SectionColor = { tint: string; active: string; dot: string; border: string; text: string };

const MAP: Record<string, SectionColor> = {
  property: { tint: "bg-amber-50/60", active: "bg-amber-700 text-white", dot: "bg-amber-700", border: "border-amber-400", text: "text-amber-800" },   // 🏡 Home = brown
  land: { tint: "bg-green-50/70", active: "bg-green-700 text-white", dot: "bg-green-600", border: "border-green-500", text: "text-green-800" },        // 🏞 Land = green
  financial: { tint: "bg-yellow-50/70", active: "bg-yellow-600 text-white", dot: "bg-yellow-500", border: "border-yellow-400", text: "text-yellow-800" }, // 💰 Financials = gold
  closing: { tint: "bg-violet-50/70", active: "bg-violet-700 text-white", dot: "bg-violet-600", border: "border-violet-500", text: "text-violet-800" },// 📝 Closing = purple
  buyers: { tint: "bg-orange-50/70", active: "bg-orange-600 text-white", dot: "bg-orange-500", border: "border-orange-400", text: "text-orange-800" }, // 🤝 Buyers = orange
  files: { tint: "bg-sky-50/70", active: "bg-sky-700 text-white", dot: "bg-sky-600", border: "border-sky-400", text: "text-sky-800" },                 // 📎 Files = sky
  contact: { tint: "bg-rose-50/60", active: "bg-rose-600 text-white", dot: "bg-rose-500", border: "border-rose-400", text: "text-rose-800" },          // 👤 Contact = rose
  tasks: { tint: "bg-emerald-50/60", active: "bg-emerald-600 text-white", dot: "bg-emerald-500", border: "border-emerald-400", text: "text-emerald-800" }, // ✅ Tasks = emerald
  appts: { tint: "bg-pink-50/60", active: "bg-pink-600 text-white", dot: "bg-pink-500", border: "border-pink-400", text: "text-pink-800" },            // 📅 Appts = pink
  sms: { tint: "bg-blue-50/60", active: "bg-blue-600 text-white", dot: "bg-blue-500", border: "border-blue-400", text: "text-blue-800" },              // 💬 SMS = blue
  email: { tint: "bg-red-50/50", active: "bg-red-700 text-white", dot: "bg-red-600", border: "border-red-400", text: "text-red-800" },                 // ✉️ Email = red
  notes: { tint: "bg-amber-50/50", active: "bg-amber-500 text-white", dot: "bg-amber-400", border: "border-amber-300", text: "text-amber-700" },       // 📝 Notes = yellow
  dev_buybox: { tint: "bg-green-50/70", active: "bg-green-700 text-white", dot: "bg-green-600", border: "border-green-500", text: "text-green-800" },
  agent_profile: { tint: "bg-orange-50/70", active: "bg-orange-600 text-white", dot: "bg-orange-500", border: "border-orange-400", text: "text-orange-800" },
};

const DEFAULT: SectionColor = { tint: "", active: "bg-brand-navy text-white", dot: "bg-slate-400", border: "border-slate-200", text: "text-slate-700" };

export function sectionColor(key: string): SectionColor {
  return MAP[key.replace(/^form:/, "")] ?? DEFAULT;
}
