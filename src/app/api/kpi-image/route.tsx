import { ImageResponse } from "next/og";

export const runtime = "edge";

// 🖼 EOD KPI scoreboard as an IMAGE for the Google Chat KPI room (Jon
// 2026-10-08: "post a picture of the KPIs, highlight who missed, with
// Marie's justifications"). Public URL guarded by an HMAC of the date —
// Chat can fetch it, nobody can enumerate anything else with it.
async function hmac(date: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(process.env.CRON_SECRET ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(date));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 20);
}

type Row = { name: string; position: string; misses: Array<{ kpi: string; actual: string; expected: string; excused: boolean; reason: string }> };

export async function GET(req: Request) {
  const url = new URL(req.url);
  const d = url.searchParams.get("d") ?? "";
  const sig = url.searchParams.get("sig") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || sig !== (await hmac(d))) return new Response("nope", { status: 403 });
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://kpi-tracker-lovat.vercel.app";
  const data = (await fetch(`${base}/api/cron?eodjson=1&d=${d}&secret=${process.env.CRON_SECRET}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null)) as { rows?: Row[] } | null;
  const rows = data?.rows ?? [];
  const clean = rows.filter((r) => r.misses.length === 0);
  const missed = rows.filter((r) => r.misses.length > 0);

  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: "#0b1f3a", color: "#fff", padding: 36, fontSize: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div style={{ fontSize: 34, fontWeight: 800 }}>📊 Freedom Offers — EOD KPIs</div>
          <div style={{ fontSize: 22, color: "#94a3b8" }}>{d}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 22, gap: 14 }}>
          {missed.map((r) => (
            <div key={r.name} style={{ display: "flex", flexDirection: "column", background: "#1e293b", borderLeft: "10px solid #ef4444", borderRadius: 14, padding: "14px 20px" }}>
              <div style={{ display: "flex", fontSize: 26, fontWeight: 800 }}>🔴 {r.name} — behind on {r.misses.length}</div>
              {r.misses.slice(0, 5).map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                  <div style={{ display: "flex", fontSize: 21, color: "#fca5a5" }}>{m.kpi}: {m.actual} / {m.expected}{m.excused ? "  (excused)" : ""}</div>
                  {m.reason ? <div style={{ display: "flex", fontSize: 18, color: "#cbd5e1", fontStyle: "italic" }}>↳ {m.reason.slice(0, 110)}</div> : <div style={{ display: "flex", fontSize: 18, color: "#f59e0b", fontStyle: "italic" }}>↳ no reason given yet</div>}
                </div>
              ))}
            </div>
          ))}
          {clean.length > 0 && (
            <div style={{ display: "flex", background: "#064e3b", borderLeft: "10px solid #10b981", borderRadius: 14, padding: "14px 20px", fontSize: 24, fontWeight: 700 }}>
              ✅ On target: {clean.map((r) => r.name).join(" · ")}
            </div>
          )}
          {rows.length === 0 && <div style={{ display: "flex", fontSize: 24, color: "#94a3b8" }}>No KPI data for this day.</div>}
        </div>
        <div style={{ display: "flex", marginTop: "auto", fontSize: 16, color: "#64748b" }}>War Room · kpi-tracker-lovat.vercel.app/report</div>
      </div>
    ),
    { width: 1000, height: Math.max(360, 180 + missed.reduce((n, r) => n + 60 + Math.min(r.misses.length, 5) * 58, 0) + (clean.length ? 80 : 0)) },
  );
}
