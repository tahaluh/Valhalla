-- Preserve score history and let the organisation choose live or manual publication.
ALTER TABLE "events" ADD COLUMN "publicRankingMode" TEXT NOT NULL DEFAULT 'LIVE';
ALTER TABLE "events" ADD COLUMN "publicRankingPublishedAt" DATETIME;
ALTER TABLE "scores" ADD COLUMN "publicValue" REAL;

CREATE TABLE "score_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scoreId" TEXT NOT NULL,
  "previousValue" REAL,
  "nextValue" REAL NOT NULL,
  "previousArenaId" TEXT,
  "nextArenaId" TEXT,
  "changedBy" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "score_revisions_scoreId_fkey" FOREIGN KEY ("scoreId") REFERENCES "scores" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "score_revisions_scoreId_createdAt_idx" ON "score_revisions"("scoreId", "createdAt");
