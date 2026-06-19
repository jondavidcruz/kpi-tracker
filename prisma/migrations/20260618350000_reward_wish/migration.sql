-- Team reward wishlist submissions.
CREATE TABLE "RewardWish" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RewardWish_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RewardWish_createdAt_idx" ON "RewardWish"("createdAt");
