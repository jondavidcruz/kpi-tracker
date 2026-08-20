import Link from "next/link";
import { LAND_DOCS, LAND_GROUPS, type LandGroup } from "@/lib/land-course-content";

export const dynamic = "force-dynamic";

// ── Tiny markdown renderer (headings, bold, bullets, numbered, tables, hr) ──
// Purpose-built for the course docs; keeps everything server-rendered + themed.
// Money/percent highlighter — the numbers that matter pop visually.
function hiNum(text: string): React.ReactNode {
  const parts = text.split(/(\$[\d,.]+(?:[kKMm])?(?:\s*[–\-]\s*\$?[\d,.]+[kKMm]?)?|\b\d+(?:\.\d+)?%|⅓|⅔|½|¼)/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i} className="rounded bg-emerald-50 px-0.5 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{p}</strong> : <span key={i}>{p}</span>,
  );
}

function inline(text: string, key: number): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return (
    <span key={key}>
      {parts.map((p, i) => (i % 2 === 1 ? <strong key={i} className="font-bold text-slate-900 dark:text-slate-100">{hiNum(p)}</strong> : <span key={i}>{hiNum(p)}</span>))}
    </span>
  );
}

function renderMd(md: string): React.ReactNode[] {
  const lines = md.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];

    // table block
    if (line.trim().startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s\-|:]+\|?$/)) {
      const header = line.trim().split("|").slice(1, -1).map((c) => c.trim());
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(lines[i].trim().split("|").slice(1, -1).map((c) => c.trim()));
        i++;
      }
      out.push(
        <div key={k++} className="my-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 dark:bg-slate-800"><tr>{header.map((h, j) => <th key={j} className="px-2.5 py-1.5 text-left font-bold text-slate-600 dark:text-slate-300">{inline(h, j)}</th>)}</tr></thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-t border-slate-100 dark:border-slate-800">
                  {r.map((c, ci) => <td key={ci} className="px-2.5 py-1.5 align-top text-slate-600 dark:text-slate-300">{inline(c, ci)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // bullet / numbered list block
    const isBullet = (s: string) => /^\s*[-*]\s+/.test(s);
    const isNum = (s: string) => /^\s*\d+[.)]\s+/.test(s);
    if (isBullet(line) || isNum(line)) {
      const items: string[] = [];
      const num = isNum(line);
      while (i < lines.length && (isBullet(lines[i]) || isNum(lines[i]))) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""));
        i++;
      }
      const cls = "my-0.5 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300";
      out.push(
        num
          ? <ol key={k++} className="my-2 list-decimal space-y-0.5 pl-6">{items.map((it, j) => <li key={j} className={cls}>{inline(it, j)}</li>)}</ol>
          : <ul key={k++} className="my-2 list-disc space-y-0.5 pl-6">{items.map((it, j) => <li key={j} className={cls}>{inline(it, j)}</li>)}</ul>,
      );
      continue;
    }

    if (/^---+\s*$/.test(line.trim())) { out.push(<hr key={k++} className="my-4 border-slate-200 dark:border-slate-700" />); i++; continue; }
    if (line.startsWith("### ")) { out.push(<h4 key={k++} className="mt-4 mb-1 text-[14px] font-extrabold text-slate-800 dark:text-slate-100">{inline(line.slice(4), 0)}</h4>); i++; continue; }
    if (line.startsWith("## ")) { out.push(<h3 key={k++} className="mt-5 mb-1.5 border-b border-slate-100 pb-1 text-[16px] font-extrabold text-brand-navy dark:border-slate-800 dark:text-slate-100">{inline(line.slice(3), 0)}</h3>); i++; continue; }
    if (line.startsWith("# ")) { out.push(<h2 key={k++} className="mt-2 mb-2 text-xl font-extrabold text-slate-900 dark:text-slate-100">{inline(line.slice(2), 0)}</h2>); i++; continue; }
    if (line.trim() === "") { i++; continue; }

    // paragraph: gather consecutive plain lines
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("#") && !isBullet(lines[i]) && !isNum(lines[i]) && !lines[i].trim().startsWith("|") && !/^---+\s*$/.test(lines[i].trim())) {
      para.push(lines[i]); i++;
    }
    out.push(<p key={k++} className="my-2 text-[13.5px] leading-relaxed text-slate-600 dark:text-slate-300">{inline(para.join(" "), 0)}</p>);
  }
  return out;
}

const GROUP_ORDER: LandGroup[] = ["john", "hunter", "tyson", "ops"];

export default async function LandCoursePage({ searchParams }: { searchParams: Promise<{ doc?: string }> }) {
  const sp = await searchParams;
  const active = LAND_DOCS.find((d) => d.slug === sp.doc) ?? LAND_DOCS[0];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">🌱 Land Course Library</h1>
          <p className="mt-1 text-sm text-slate-500">
            The three purchased systems, fully dissected — John Duong (infill lots) · Hunter P. (recreational land) · Tyson Smith (luxury infill).
          </p>
        </div>
        <Link href="/playbooks" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">← Playbooks</Link>
      </div>

      {/* The visual Master Plan — all 3 courses on one page (Jon's HTML, served verbatim) */}
      <a href="/playbooks/land-master-plan.html" target="_blank" rel="noopener noreferrer"
        className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-r from-slate-900 to-[#1e3a5f] p-5 text-white shadow-md transition hover:shadow-lg">
        <span className="text-4xl">🏔️</span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold">Land Master Plan — start here</span>
          <span className="block text-sm text-slate-300">All 3 systems on one visual page: the 10-second snapshot, each lane step-by-step, the golden rules, and what to do today.</span>
        </span>
        <span className="rounded-xl bg-white/15 px-4 py-2 text-sm font-bold">Open ↗</span>
      </a>

      {/* The visual one-pager — Jon's Master Plan */}
      <a href="/training/land-master-plan.html" target="_blank" rel="noopener noreferrer"
        className="mb-4 flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-emerald-50 p-4 shadow-sm transition hover:shadow-md dark:border-amber-700 dark:from-amber-950 dark:to-emerald-950">
        <span className="text-3xl">🏔️</span>
        <span className="min-w-0 flex-1">
          <span className="block font-extrabold text-slate-900 dark:text-slate-100">Land Master Plan — the visual one-pager</span>
          <span className="block text-[13px] text-slate-600 dark:text-slate-300">All 3 systems on one page: the 10-second snapshot, each lane's 4 steps, target ZIPs, buy boxes, offer rules, golden rules + today&apos;s action list.</span>
        </span>
        <span className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-[13px] font-bold text-white">Open ↗</span>
      </a>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Doc nav, grouped by instructor */}
        <nav className="shrink-0 space-y-3 lg:w-72">
          {GROUP_ORDER.map((g) => (
            <div key={g} className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
              <div className="px-1.5 pb-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{LAND_GROUPS[g].emoji} {LAND_GROUPS[g].label}</div>
              <div className="space-y-0.5">
                {LAND_DOCS.filter((d) => d.group === g).map((d) => (
                  <Link key={d.slug} href={`/playbooks/land?doc=${d.slug}`} className={`block rounded-lg px-2.5 py-1.5 text-[13px] font-medium ${d.slug === active.slug ? "bg-brand-navy text-white" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
                    {d.title}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Reader */}
        <article className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-7">
          <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600">{LAND_GROUPS[active.group].emoji} {LAND_GROUPS[active.group].label}</div>
          {renderMd(active.md)}
        </article>
      </div>
    </div>
  );
}
