ALTER TABLE "events" ADD COLUMN "resultsStatus" TEXT NOT NULL DEFAULT 'PROVISIONAL';
ALTER TABLE "events" ADD COLUMN "resultsHomologatedAt" DATETIME;

CREATE TABLE "formal_appeals" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "teamId" TEXT,
  "sessionId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "decision" TEXT,
  "deadlineAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "formal_appeals_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "formal_appeals_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "formal_appeals_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "evaluation_sessions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "formal_appeals_eventId_status_createdAt_idx" ON "formal_appeals"("eventId", "status", "createdAt");
