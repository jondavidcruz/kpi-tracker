// Client-side download speed measurement, built to track speedtest.net closely.
//
// Why the old test under-reported: it downloaded a single 3MB payload from our
// own Vercel function. On any decent connection that finishes in well under a
// second, which is mostly TCP slow-start (the connection never reaches full
// speed), over one stream (one TCP connection can't saturate a modern line),
// from a serverless function (its own throughput ceiling), far from the PH.
//
// This engine does what real speed tests do:
//   - downloads from Cloudflare's speed-test endpoint (speed.cloudflare.com),
//     served from their nearest PoP — including Manila/Cebu for the PH team
//   - 4 parallel streams to saturate the connection
//   - runs time-boxed (~8s), counting bytes as they stream in
//   - throws away the warm-up window and measures steady-state throughput
//   - falls back to our own /api/speedtest if Cloudflare is unreachable
//     (e.g. blocked network) — clearly marked as a rough estimate.

const STREAMS = 4;
const DURATION_MS = 8_000; // total test window
const WARMUP_MS = 1_500; // ignore bytes before this (TCP slow start)
const BYTES_PER_STREAM = 200_000_000; // ask big; the time box aborts the rest

export interface SpeedResult {
  mbps: number;
  /** false when Cloudflare was unreachable and we used the rough fallback */
  accurate: boolean;
}

/**
 * Measure download speed in Mbps. `onProgress` fires every ~200ms with the
 * current steady-state estimate so the UI can tick live.
 */
export async function measureDownloadMbps(
  onProgress?: (mbps: number) => void,
): Promise<SpeedResult> {
  try {
    const mbps = await runParallelTest(onProgress);
    return { mbps, accurate: true };
  } catch {
    const mbps = await runFallbackTest(onProgress);
    return { mbps, accurate: false };
  }
}

async function runParallelTest(onProgress?: (mbps: number) => void): Promise<number> {
  const ctrl = new AbortController();
  const t0 = performance.now();
  let bytesTotal = 0; // all bytes, any time
  let bytesAfterWarmup = 0;
  let warmupAt = 0; // timestamp when warmup ended

  const readStream = async (i: number) => {
    const url = `https://speed.cloudflare.com/__down?bytes=${BYTES_PER_STREAM}&r=${i}-${t0}`;
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok || !res.body) throw new Error(`stream ${i}: ${res.status}`);
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const now = performance.now();
      bytesTotal += value.length;
      if (now - t0 >= WARMUP_MS) {
        if (warmupAt === 0) warmupAt = now;
        bytesAfterWarmup += value.length;
      }
    }
  };

  // Kick off all streams; swallow the AbortError each throws at the time box.
  const streams = Promise.allSettled(Array.from({ length: STREAMS }, (_, i) => readStream(i)));

  // Progress ticker + the time box itself.
  await new Promise<void>((resolve) => {
    const tick = setInterval(() => {
      const now = performance.now();
      if (onProgress && warmupAt > 0 && now > warmupAt + 300) {
        const secs = (now - warmupAt) / 1000;
        onProgress(round1((bytesAfterWarmup * 8) / secs / 1_000_000));
      }
      if (now - t0 >= DURATION_MS) {
        clearInterval(tick);
        ctrl.abort();
        resolve();
      }
    }, 200);
  });
  await streams;

  const end = performance.now();
  // Steady-state: bytes after warm-up over that window. If the connection is so
  // slow nothing arrived post-warmup, fall back to the whole-test average.
  if (warmupAt > 0 && end - warmupAt > 500 && bytesAfterWarmup > 0) {
    return round1((bytesAfterWarmup * 8) / ((end - warmupAt) / 1000) / 1_000_000);
  }
  if (bytesTotal === 0) throw new Error("no data received");
  return round1((bytesTotal * 8) / ((end - t0) / 1000) / 1_000_000);
}

/** Fallback when Cloudflare is unreachable: a PARALLEL, time-boxed loop of
 *  3MB pulls from our own API. The old single-shot version capped around
 *  30 Mbps on fast lines (Marie: 36 here vs 631 on speedtest.net — Jon
 *  2026-10-08); six concurrent looping streams get within real range. */
async function runFallbackTest(onProgress?: (mbps: number) => void): Promise<number> {
  const DUR = 8_000, WARM = 1_200;
  const t0 = performance.now();
  let bytesTotal = 0, after = 0, warmAt = 0;
  const worker = async () => {
    while (performance.now() - t0 < DUR) {
      const res = await fetch(`/api/speedtest?t=${Date.now()}-${Math.random()}`, { cache: "no-store" });
      if (!res.ok) break;
      const reader = res.body?.getReader();
      if (!reader) { const buf = await res.arrayBuffer(); bytesTotal += buf.byteLength; continue; }
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const now = performance.now();
        bytesTotal += value.length;
        if (now - t0 >= WARM) { if (!warmAt) warmAt = now; after += value.length; }
        if (now - t0 > DUR) { try { await reader.cancel(); } catch { /* done */ } break; }
      }
    }
  };
  const tick = setInterval(() => {
    if (onProgress && warmAt && performance.now() > warmAt + 300) {
      onProgress(round1((after * 8) / ((performance.now() - warmAt) / 1000) / 1_000_000));
    }
  }, 300);
  await Promise.allSettled(Array.from({ length: 6 }, worker));
  clearInterval(tick);
  const end = performance.now();
  if (warmAt && after > 0 && end - warmAt > 500) return round1((after * 8) / ((end - warmAt) / 1000) / 1_000_000);
  if (!bytesTotal) throw new Error("no data received");
  return round1((bytesTotal * 8) / ((end - t0) / 1000) / 1_000_000);
}

function round1(n: number): number {
  return Math.max(0.1, Math.round(n * 10) / 10);
}
