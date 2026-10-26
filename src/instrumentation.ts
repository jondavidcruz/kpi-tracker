// 🔧 TEMPORARY (Jon 2026-10-26): capture the REAL server-side error behind the novation
// "Connection closed" (Next hides server-component/serialization errors from the client).
// onRequestError fires for render/serialization errors even when the client only sees a
// stream abort. We stash the last few into a Resource row so /api/crm/oppdiag?errors=1 can
// read them. DELETE this file once the crash is fixed.
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string } | undefined,
): Promise<void> {
  try {
    const { db } = await import("@/lib/db");
    const e = err as { message?: string; stack?: string; digest?: string };
    const entry = {
      at: new Date().toISOString(),
      path: request?.path ?? "",
      msg: String(e?.message ?? err).slice(0, 2000),
      digest: e?.digest ?? "",
      stack: String(e?.stack ?? "").slice(0, 4000),
    };
    const row = await db.resource.findFirst({ where: { category: "__server_errors__" } }).catch(() => null);
    let arr: unknown[] = [];
    try { arr = row?.description ? JSON.parse(row.description) : []; } catch { arr = []; }
    arr.unshift(entry);
    arr = arr.slice(0, 12);
    const description = JSON.stringify(arr);
    if (row) await db.resource.update({ where: { id: row.id }, data: { description } });
    else await db.resource.create({ data: { title: "server-errors", category: "__server_errors__", url: "", description } });
  } catch { /* best-effort */ }
}
