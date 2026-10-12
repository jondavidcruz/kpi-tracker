import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Playfair (logo serif) loads via a plain <link> below instead of next/font:
// Turbopack's build-time Google fetch for it is flaky on Vercel ("queries have
// exactly one entry") and killed deploys. A runtime stylesheet can't.

export const metadata: Metadata = {
  title: "Freedom Offers War Room",
  description: "Freedom Offers War Room — KPIs, deals, schedule, and the team's second brain",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "War Room" },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`} style={{ ["--font-display" as string]: `"Playfair Display"` }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet" />
        {/* Kill any leftover service worker + caches from the old PWA build so new
            deploys always show up (no more "I don't see the changes"). */}
        {/* Register the push-only service worker (v2 — it has NO fetch handler,
            so it can never serve stale builds; it also clears old caches). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(window.caches&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})}).catch(function(){})}if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}}catch(e){}`,
          }}
        />
        {/* Apply saved dark-mode preference before first paint (no flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full text-slate-900">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
