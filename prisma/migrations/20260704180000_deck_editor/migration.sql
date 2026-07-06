-- Deck editor: owner-uploaded title/team slide images + custom slides.
ALTER TABLE "Settings" ADD COLUMN "titleSlideUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "teamSlideUrl" TEXT NOT NULL DEFAULT '';

CREATE TABLE "DeckSlide" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'image',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeckSlide_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeckSlide_sortOrder_idx" ON "DeckSlide"("sortOrder");
