import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import NavBar from "@/components/NavBar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Freedom Offers KPI Tracker",
  description: "Daily scorecard with automatic off-target alerts",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col text-slate-900">
        <NavBar />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-7">{children}</main>
      </body>
    </html>
  );
}
