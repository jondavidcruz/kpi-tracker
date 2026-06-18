import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // transcription can take a while

const MAX_BYTES = 18 * 1024 * 1024; // inline Gemini request cap (~20MB total)

// Accepts an audio file, transcribes it via Gemini, returns the text. The audio
// is held in memory only and never written to the database or disk.
export async function POST(request: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("audio");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No audio file received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That recording is over 18 MB — please trim or compress it first." }, { status: 400 });

  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  const mime = file.type || "audio/mpeg";
  const result = await transcribeAudio(base64, mime);
  if (!result.configured) return NextResponse.json({ error: "Transcription isn't set up yet — an admin needs to add GEMINI_API_KEY in Vercel." });
  if (result.error) return NextResponse.json({ error: result.error });
  return NextResponse.json({ transcript: result.text });
}
