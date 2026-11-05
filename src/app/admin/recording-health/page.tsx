// 🎙 Recording & transcript health (Jon 2026-11-05 — "recordings stopped, no transcripts").
// The live recording diagnostic has always lived behind the CRON_SECRET-gated
// ?recdiag=1 endpoint, which nobody can open without the secret (it's hidden in Vercel).
// This surfaces the SAME data to the owner in the app, read-only, so we can see WHERE
// the pipeline breaks: is the Gemini key live? is Drive configured? are recordings
// filing at all? are transcripts attaching? — without needing the secret.
import { getCurrentUser, isOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

type RecMeta = { link?: string; transcript?: string; secs?: number; txErr?: string } | null;

function ago(d: Date): string {
  const h = (Date.now() - d.getTime()) / 3_600_000;
  if (h < 1) return `${Math.round(h * 60)}m ago`;
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default async function RecordingHealthPage() {
  const me = await getCurrentUser();
  if (!isOwner(me)) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 text-3xl">🔒</div>
        <h1 className="text-xl font-bold">Owner only</h1>
      </div>
    );
  }

  const { gdriveConfigured } = await import("@/lib/gdrive");
  const geminiOn = !!process.env.GEMINI_API_KEY;
  const driveOn = gdriveConfigured();

  // Last 30 filed recordings (🎙 call events)
  const recs = await db.crmEvent.findMany({
    where: { kind: "call", body: { startsWith: "🎙" } },
    orderBy: { at: "desc" }, take: 30,
    select: { at: true, actor: true, body: true, meta: true, contactId: true },
  }).catch(() => []);

  // Last 15 raw Telnyx call events (from the webhook breadcrumb store)
  const evRow = await db.resource.findFirst({ where: { category: "__telnyx_events__" } }).catch(() => null);
  let telnyx: Array<{ at?: string; ev?: string; from?: string; to?: string; direction?: string; cause?: string; answered?: boolean }> = [];
  try { telnyx = evRow?.description ? JSON.parse(evRow.description).slice(0, 15) : []; } catch { telnyx = []; }

  const withLink = recs.filter((r) => !!(r.meta as RecMeta)?.link).length;
  const withTranscript = recs.filter((r) => !!(r.meta as RecMeta)?.transcript).length;
  const d7 = Date.now() - 7 * 86_400_000;
  const last7 = recs.filter((r) => r.at.getTime() >= d7);
  const last7Transcribed = last7.filter((r) => !!(r.meta as RecMeta)?.transcript).length;
  const lastRec = recs[0] ?? null;
  const lastTranscribed = recs.find((r) => !!(r.meta as RecMeta)?.transcript) ?? null;

  const Pill = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${ok ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-red-50 text-red-700 ring-1 ring-red-200"}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-red-500"}`} />{label}
    </span>
  );

  // Plain-language verdict
  let verdict: { tone: "ok" | "warn" | "bad"; text: string };
  if (!recs.length) verdict = { tone: "bad", text: "No call recordings have ever filed. Recording isn't starting, or Telnyx isn't sending recording.saved — check that calls are being answered and recorded." };
  else if (!lastRec || lastRec.at.getTime() < Date.now() - 2 * 86_400_000) verdict = { tone: "bad", text: `Recordings STOPPED — the last one filed ${lastRec ? ago(lastRec.at) : "never"}. The pipeline was working before, so recording-start or the Telnyx webhook broke.` };
  else if (!geminiOn) verdict = { tone: "bad", text: "Recordings are filing, but the GEMINI_API_KEY is missing in Vercel — that's why there are NO transcripts. Add/renew the key and redeploy." };
  else if (last7.length > 0 && last7Transcribed === 0) verdict = { tone: "bad", text: `Recordings are filing but transcripts STOPPED — ${last7.length} recordings in the last 7 days, none transcribed. The Gemini key is set, so it's likely a model/quota error (the handler calls gemini-flash-latest with no fallback).` };
  else verdict = { tone: "ok", text: `Healthy — last recording ${ago(lastRec.at)}, last transcript ${lastTranscribed ? ago(lastTranscribed.at) : "never"}.` };

  return (
    <div className="space-y-6">
      <SectionTitle title="🎙 Recording & transcript health" subtitle="Where the call-recording pipeline stands right now — the ?recdiag data, in the app. Read-only." accent="bg-brand-gold" />

      <div className={`rounded-xl p-4 text-sm font-semibold ring-1 ${verdict.tone === "ok" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : verdict.tone === "warn" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-red-50 text-red-800 ring-red-200"}`}>
        {verdict.tone === "ok" ? "✅ " : "⚠️ "}{verdict.text}
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill ok={driveOn} label={driveOn ? "Google Drive connected" : "Google Drive NOT configured"} />
        <Pill ok={geminiOn} label={geminiOn ? "Gemini key set (transcription)" : "Gemini key MISSING — no transcripts"} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4 text-center"><div className="text-2xl font-extrabold text-slate-800">{last7.length}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Recordings · 7d</div></Card>
        <Card className="p-4 text-center"><div className={`text-2xl font-extrabold ${last7.length && !last7Transcribed ? "text-red-600" : "text-slate-800"}`}>{last7Transcribed}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Transcribed · 7d</div></Card>
        <Card className="p-4 text-center"><div className="text-sm font-extrabold text-slate-800">{lastRec ? ago(lastRec.at) : "never"}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last recording</div></Card>
        <Card className="p-4 text-center"><div className={`text-sm font-extrabold ${!lastTranscribed || lastTranscribed.at.getTime() < d7 ? "text-amber-600" : "text-slate-800"}`}>{lastTranscribed ? ago(lastTranscribed.at) : "never"}</div><div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last transcript</div></Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Last 30 recordings ({withLink} filed to Drive · {withTranscript} transcribed)</h2>
        <Card className="overflow-hidden p-0">
          {recs.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400">No 🎙 recordings found at all.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400"><tr>
                <th className="px-4 py-2 text-left font-bold">When</th><th className="px-3 py-2 text-left font-bold">Rep</th>
                <th className="px-3 py-2 text-center font-bold">Drive</th><th className="px-3 py-2 text-center font-bold">Transcript</th><th className="px-3 py-2 text-right font-bold">Length</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {recs.map((r, i) => {
                  const m = r.meta as RecMeta;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-2 text-slate-600">{ago(r.at)}</td>
                      <td className="px-3 py-2 text-slate-600">{r.actor || "—"}</td>
                      <td className="px-3 py-2 text-center">{m?.link ? "✅" : "—"}</td>
                      <td className="px-3 py-2 text-center">{m?.transcript ? "✅" : <span className="text-red-500" title={m?.txErr || "no transcript"}>✗{m?.txErr ? <span className="ml-1 text-[10px] font-normal text-red-400">{m.txErr.slice(0, 40)}</span> : ""}</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m?.secs ? `${Math.floor(m.secs / 60)}m ${m.secs % 60}s` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <div>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Last 15 raw call events (Telnyx webhook)</h2>
        <Card className="p-3">
          {telnyx.length === 0 ? (
            <div className="p-3 text-sm text-slate-400">No recent Telnyx call events captured.</div>
          ) : (
            <div className="space-y-1">
              {telnyx.map((e, i) => (
                <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg bg-slate-50 px-3 py-1.5 text-[12px]">
                  <span className="font-mono text-slate-400">{e.at ? new Date(e.at).toLocaleString() : "—"}</span>
                  <span className="font-bold text-slate-700">{e.ev || "—"}</span>
                  <span className="text-slate-500">{e.direction || "—"}</span>
                  <span className="text-slate-400">{e.from || "?"} → {e.to || "?"}</span>
                  {e.cause && <span className="text-amber-700">cause: {e.cause}</span>}
                  <span className={e.answered ? "text-emerald-600" : "text-slate-400"}>{e.answered ? "answered" : "no-answer"}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
