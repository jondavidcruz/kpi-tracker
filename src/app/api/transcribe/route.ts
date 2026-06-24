import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // transcription can take a while

// Files up to this size transcribe (small → inline; larger → Gemini File API).
// Bounded so we don't try to buffer something enormous in a serverless function.
const MAX_BYTES = 200 * 1024 * 1024;
const TOO_BIG = "That recording is over 200 MB — please trim or compress it first.";

// Accepts an audio file, transcribes it via Gemini, returns the text. The audio
// is held in memory only and never written to the database or disk.
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let buf: Buffer;
  let mime = "audio/mpeg";
  const ctype = request.headers.get("content-type") || "";

  if (ctype.includes("application/json")) {
    // Preferred path: the file went straight to storage; we fetch it here
    // (server→storage has no body limit) and transcribe.
    let url = "";
    try { url = String((await request.json())?.url || ""); } catch { /* ignore */ }
    if (!url) return NextResponse.json({ error: "No recording URL." }, { status: 400 });
    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: "Couldn't read the uploaded recording." }, { status: 400 });
    buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 400 });
    mime = res.headers.get("content-type") || "audio/mpeg";
  } else {
    // Fallback: small files posted directly (works under Vercel's ~4.5 MB limit).
    let file: File | null = null;
    try {
      const form = await request.formData();
      const f = form.get("audio");
      if (f instanceof File) file = f;
    } catch {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    if (!file) return NextResponse.json({ error: "No audio file received." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: TOO_BIG }, { status: 400 });
    buf = Buffer.from(await file.arrayBuffer());
    mime = file.type || "audio/mpeg";
  }

  const result = await transcribeAudio(buf, mime, me.geminiKey || undefined);
  if (!result.configured) return NextResponse.json({ error: "Transcription isn't set up — add your own Gemini key in My Account, or have an admin set GEMINI_API_KEY in Vercel." });
  if (result.error) return NextResponse.json({ error: result.error });
  return NextResponse.json({ transcript: result.text });
}
