-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuditRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "flaggedItems" INTEGER NOT NULL DEFAULT 0,
    "critical" INTEGER NOT NULL DEFAULT 0,
    "high" INTEGER NOT NULL DEFAULT 0,
    "medium" INTEGER NOT NULL DEFAULT 0,
    "low" INTEGER NOT NULL DEFAULT 0,
    "overallScore" INTEGER NOT NULL DEFAULT 100,
    "aiEnhanced" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);
INSERT INTO "new_AuditRun" ("aiEnhanced", "completedAt", "createdAt", "critical", "flaggedItems", "high", "id", "low", "medium", "overallScore", "shop", "status", "totalItems") SELECT "aiEnhanced", "completedAt", "createdAt", "critical", "flaggedItems", "high", "id", "low", "medium", "overallScore", "shop", "status", "totalItems" FROM "AuditRun";
DROP TABLE "AuditRun";
ALTER TABLE "new_AuditRun" RENAME TO "AuditRun";
CREATE INDEX "AuditRun_shop_createdAt_idx" ON "AuditRun"("shop", "createdAt");
CREATE INDEX "AuditRun_status_idx" ON "AuditRun"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
