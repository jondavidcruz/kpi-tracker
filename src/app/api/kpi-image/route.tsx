import { ImageResponse } from "next/og";

export const runtime = "edge";

// 🖼 EOD KPI scoreboard image v2 (Jon 2026-10-09): EVERY rep's full day —
// green ✓ rows for met KPIs, red rows for misses with the written reason.
async function hmac(date: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.CRON_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

type KpiRow = { kpi: string; actual: string; expected: string; met: boolean; excused: boolean; reason: string };
type Row = { name: string; position: string; kpis: KpiRow[]; missCount: number };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const d = url.searchParams.get("d") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || sig !== (await hmac(d))) return new Response("nope", { status: 403 });
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://kpi-tracker-lovat.vercel.app";
  const data = (await fetch(`${base}/api/cron?eodjson=1&d=${d}&secret=${process.env.CRON_SECRET}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as { rows?: Row[] } | null;
  const rows = (data?.rows ?? []).sort((a, b) => b.missCount - a.missCount);
  const height = Math.max(400, 150 + rows.reduce((n, r) => n + 70 + r.kpis.length * 34 + r.kpis.filter((k) => !k.met && k.reason).length * 26, 0));

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0b1f3a", color: "#fff", padding: 32, fontSize: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div style={{ fontSize: 32, fontWeight: 800 }}>📊 Freedom Offers — EOD KPIs</div>
          <div style={{ fontSize: 20, color: "#94a3b8" }}>{d}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 18, gap: 12 }}>
          {rows.map((r) => (
            <div key={r.name} style={{ display: "flex", flexDirection: "column", background: "#16233b", borderLeft: `8px solid ${r.missCount ? "#ef4444" : "#10b981"}`, borderRadius: 12, padding: "12px 18px" }}>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 800 }}>
                {r.missCount ? "🔴" : "✅"} {r.name} {r.missCount ? `— behind on ${r.missCount}` : "— all on target"}
              </div>
              {r.kpis.map((k, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 19, marginTop: 5, color: k.met ? "#86efac" : "#fca5a5" }}>
                    {k.met ? "✓" : "✗"} {k.kpi}: {k.actual}{k.expected ? ` / ${k.expected}` : ""}{k.excused ? " (excused)" : ""}
                  </div>
                  {!k.met && k.reason ? <div style={{ display: "flex", fontSize: 16, color: "#cbd5e1", fontStyle: "italic", marginLeft: 22 }}>↳ {k.reason.slice(0, 105)}</div> : null}
                </div>
              ))}
            </div>
          ))}
          {rows.length === 0 && <div style={{ display: "flex", fontSize: 22, color: "#94a3b8" }}>No KPI data for this day.</div>}
        </div>
        <div style={{ display: "flex", marginTop: "auto", paddingTop: 14, fontSize: 15, color: "#64748b" }}>War Room · kpi-tracker-lovat.vercel.app/report</div>
      </div>
    ),
    { width: 1000, height },
  );
}
