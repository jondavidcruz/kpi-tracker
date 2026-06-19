-- Lead context on a scored call: which property/seller + callback number.
ALTER TABLE "CallScore" ADD COLUMN IF NOT EXISTS "address" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallScore" ADD COLUMN IF NOT EXISTS "sellerName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "CallScore" ADD COLUMN IF NOT EXISTS "sellerPhone" TEXT NOT NULL DEFAULT '';
