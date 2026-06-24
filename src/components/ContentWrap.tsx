"use client";

import { usePathname } from "next/navigation";

// The main content is capped at a readable width on most pages, but the wide
// spreadsheet pages (Buyer Research / Vetted Buyers) use the full screen so there's
// far less left-right scrolling.
const FULL_WIDTH = ["/vetting", "/marketing"];

export default function ContentWrap({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const wide = FULL_WIDTH.some((p) => pathname === p || pathname.startsWith(p + "/"));
  return (
    <div className={`mx-auto w-full px-4 py-6 md:px-8 md:py-8 ${wide ? "max-w-none" : "max-w-[1320px]"}`}>
      {children}
    </div>
  );
}
