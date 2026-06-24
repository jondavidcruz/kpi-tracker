-- BYOK: each rep can save their own Gemini API key for call transcription.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "geminiKey" TEXT NOT NULL DEFAULT '';
