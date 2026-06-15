-- EOS Issues List + To-Dos (IDS)
CREATE TABLE IF NOT EXISTS "Issue" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "raisedBy" TEXT NOT NULL DEFAULT '',
    "owner" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "scope" TEXT NOT NULL DEFAULT 'leadership',
    "status" TEXT NOT NULL DEFAULT 'open',
    "solveNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Issue_status_idx" ON "Issue"("status");

CREATE TABLE IF NOT EXISTS "ToDo" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT '',
    "dueDate" TEXT NOT NULL DEFAULT '',
    "done" BOOLEAN NOT NULL DEFAULT false,
    "fromIssue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ToDo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ToDo_done_idx" ON "ToDo"("done");
