-- Per-member HR document uploads (signed agreements). Bytes stored in-DB.
CREATE TABLE "TeamDoc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Signed agreement',
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" INTEGER NOT NULL DEFAULT 0,
    "data" BYTEA NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamDoc_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TeamDoc_userId_idx" ON "TeamDoc"("userId");
