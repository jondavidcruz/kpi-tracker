"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

// Fixed top-right dark-mode toggle. The chosen theme is stored in localStorage and
// applied pre-paint by a script in the root layout, so there's no flash on reload.
export default function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);

  const toggle = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
    setDark(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle dark mode"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="fixed right-16 top-3 z-50 grid h-9 w-9 place-items-center rounded-full bg-white text-slate-600 shadow-md ring-1 ring-slate-200 transition hover:bg-slate-50 md:right-3"
    >
      {dark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
