import type { Metadata } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Freedom Offers — KPI Tracker",
  description: "Daily scorecard with automatic off-target alerts",
};

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/entry", label: "Enter KPIs" },
  { href: "/monthly", label: "Monthly" },
  { href: "/alerts", label: "Alerts" },
  { href: "/admin", label: "Admin" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col text-slate-900">
        <header className="sticky top-0 z-10 border-b border-brand-navy/15 bg-brand-navy text-white shadow-sm">
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
            <Link href="/dashboard" className="mr-5 flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-gold text-brand-navy">FO</span>
              <span>
                Freedom Offers <span className="font-normal text-white/60">· KPIs</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 overflow-x-auto">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
              <Link
                href="/tv"
                className="ml-1 whitespace-nowrap rounded-lg bg-brand-gold/90 px-3 py-1.5 text-sm font-semibold text-brand-navy transition hover:bg-brand-gold"
              >
                📺 Wall Display
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7">{children}</main>
      </body>
    </html>
  );
}
