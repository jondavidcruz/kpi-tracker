-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Kpi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL DEFAULT '',
    "cadence" TEXT NOT NULL,
    "goalValue" REAL,
    "goalKind" TEXT NOT NULL DEFAULT 'at_least',
    "computed" BOOLEAN NOT NULL DEFAULT false,
    "formula" TEXT,
    "definition" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO "new_Kpi" ("active", "cadence", "category", "computed", "definition", "emoji", "formula", "goalKind", "goalValue", "id", "key", "name", "scope", "sortOrder", "unit") SELECT "active", "cadence", "category", "computed", "definition", "emoji", "formula", "goalKind", "goalValue", "id", "key", "name", "scope", "sortOrder", "unit" FROM "Kpi";
DROP TABLE "Kpi";
ALTER TABLE "new_Kpi" RENAME TO "Kpi";
CREATE UNIQUE INDEX "Kpi_key_key" ON "Kpi"("key");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'rep',
    "position" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("active", "createdAt", "email", "id", "name", "role", "timezone") SELECT "active", "createdAt", "email", "id", "name", "role", "timezone" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
