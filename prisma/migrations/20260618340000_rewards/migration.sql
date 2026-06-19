-- Team + individual rewards.
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'team',
    "userId" TEXT NOT NULL DEFAULT '',
    "goal" TEXT NOT NULL DEFAULT '',
    "reward" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT '🎁',
    "achieved" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Reward_scope_userId_idx" ON "Reward"("scope", "userId");
