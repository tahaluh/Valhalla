ALTER TABLE "events" ADD COLUMN "activePublicationBatchId" TEXT;
ALTER TABLE "events" ADD COLUMN "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "backupIntervalMinutes" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "phases" ADD COLUMN "operationalStatus" TEXT NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "phases" ADD COLUMN "openedAt" DATETIME;
ALTER TABLE "phases" ADD COLUMN "closedAt" DATETIME;
UPDATE "phases" SET "operationalStatus" = 'OPEN';

ALTER TABLE "evaluation_sessions" ADD COLUMN "draftUpdatedAt" DATETIME;
ALTER TABLE "evaluation_sessions" ADD COLUMN "draftTerminalId" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "draftOperatorName" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "endedEarly" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "evaluation_sessions" ADD COLUMN "endReason" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "artisticDecision" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "evaluation_sessions" ADD COLUMN "artisticDecisionReason" TEXT;

CREATE TABLE "scorecard_draft_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "scorecard" TEXT NOT NULL,
  "terminalId" TEXT,
  "operatorName" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scorecard_draft_revisions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "evaluation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "scorecard_draft_revisions_sessionId_createdAt_idx" ON "scorecard_draft_revisions"("sessionId", "createdAt");

CREATE TABLE "judge_scores" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "judgeName" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "scorecard" TEXT NOT NULL,
  "total" REAL NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "judge_scores_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "evaluation_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "judge_scores_sessionId_judgeName_key" ON "judge_scores"("sessionId", "judgeName");
CREATE INDEX "judge_scores_sessionId_role_idx" ON "judge_scores"("sessionId", "role");

CREATE TABLE "publication_batches" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "note" TEXT,
  "snapshot" TEXT NOT NULL,
  "restoredFromId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_batches_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "publication_batches_eventId_createdAt_idx" ON "publication_batches"("eventId", "createdAt");

CREATE TABLE "backup_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "createdByName" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'MANUAL',
  "payload" TEXT NOT NULL,
  "checksum" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "backup_snapshots_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "backup_snapshots_eventId_createdAt_idx" ON "backup_snapshots"("eventId", "createdAt");
