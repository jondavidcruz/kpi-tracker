-- Track the "disconnected (unknown reason)" Chat alert so it fires once per drop.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dropAlertedAt" TIMESTAMP(3);
