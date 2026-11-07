import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isManager } from "@/lib/auth";
import { PNL_DATA_CAT, type PnlMonth, type PnlStore, type PnlLine, type PnlCat } from "@/lib/pnl-sheet";

const CATS = new Set(["payroll", "software", "dues", "realEstate", "controllable"]);

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 📗 P&L data store (Jon 2026-11-07). The REAL Freedom Offers figures must NOT live in this PUBLIC
// repo — they live here, in the private Supabase DB (Resource "__pnl_data__"), read by /expenses.
// GET  → the stored P&L (owner/manager only).
// POST → replace the stored P&L { year, asOf, sheetModified, months:[{month,revenue,expenses,...}] }.
//        Used by the owner (in-app) and by the monthly "Monthly P&L Sync" task after it re-parses
//        the Excel sheet. Numbers travel straight into the private DB — nothing is published.

function cleanMonth(m: Record<string, unknown>): PnlMonth | null {
  const month = String(m.month ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(month)) return null;
  const n = (k: string) => { const v = Number(m[k]); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0; };
  const revenue = n("revenue"), expenses = n("expenses");
  const netProfit = m.netProfit != null && Number.isFinite(Number(m.netProfit)) ? Math.round(Number(m.netProfit) * 100) / 100 : Math.round((revenue - expenses) * 100) / 100;
  const rawLines = Array.isArray(m.lines) ? m.lines : [];
  const lines: PnlLine[] = rawLines.map((l) => {
    const o = l as Record<string, unknown>;
    const cat = String(o.cat ?? "");
    const actual = Number(o.actual); const label = String(o.label ?? "").trim().slice(0, 80);
    if (!CATS.has(cat) || !label || !Number.isFinite(actual)) return null;
    return { cat: cat as PnlCat, label, actual: Math.round(actual * 100) / 100 };
  }).filter((l): l is PnlLine => !!l);
  let budget: Partial<Record<PnlCat, number>> | undefined;
  if (m.budget && typeof m.budget === "object") {
    const b = m.budget as Record<string, unknown>; budget = {};
    for (const c of ["payroll", "software", "dues", "realEstate", "controllable"] as PnlCat[]) { const v = Number(b[c]); if (Number.isFinite(v)) budget[c] = Math.round(v * 100) / 100; }
  }
  return { month, revenue, expenses, netProfit, payroll: n("payroll"), software: n("software"), dues: n("dues"), realEstate: n("realEstate"), controllable: n("controllable"), lines, ...(budget ? { budget } : {}) };
}

export async function GET() {
  const me = await getCurrentUser();
  if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  const row = await db.resource.findFirst({ where: { category: PNL_DATA_CAT } }).catch(() => null);
  let store: PnlStore | null = null;
  try { if (row?.description) store = JSON.parse(row.description); } catch { store = null; }
  return NextResponse.json({ ok: true, store });
}

export async function POST(req: Request) {
  // Auth: an owner/manager session (in-app) OR the shared secret (so the monthly "Monthly P&L Sync"
  // cloud task can update headlessly). Same pattern as the nightly research ingest.
  const url = new URL(req.url);
  const secret = process.env.CRON_SECRET;
  const given = url.searchParams.get("secret") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const bySecret = !!secret && given === secret;
  if (!bySecret) {
    const me = await getCurrentUser();
    if (!me || !isManager(me)) return NextResponse.json({ error: "managers only" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { year?: number; asOf?: string; sheetModified?: string; months?: Record<string, unknown>[] };
  const months = Array.isArray(body.months) ? body.months.map(cleanMonth).filter((m): m is PnlMonth => !!m) : [];
  if (!months.length) return NextResponse.json({ ok: false, error: "no valid months" }, { status: 400 });
  const year = Number(body.year) || Number(months[0].month.slice(0, 4));
  const store: PnlStore = {
    year, asOf: (body.asOf || new Date().toISOString().slice(0, 10)).slice(0, 10),
    sheetModified: String(body.sheetModified || "").slice(0, 40), months,
  };
  const description = JSON.stringify(store);
  const row = await db.resource.findFirst({ where: { category: PNL_DATA_CAT } }).catch(() => null);
  if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
  else await db.resource.create({ data: { title: "pnl-data", category: PNL_DATA_CAT, url: "", description } });
  return NextResponse.json({ ok: true, saved: months.length, year });
}
