CREATE TABLE "offline_command_reviews" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "failureReason" TEXT NOT NULL,
  "stationId" TEXT,
  "teamId" TEXT,
  "terminalId" TEXT,
  "operatorName" TEXT,
  "resolvedAt" DATETIME,
  "resolvedBy" TEXT,
  "resolutionNote" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "offline_command_reviews_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "offline_command_reviews_eventId_resolvedAt_createdAt_idx"
ON "offline_command_reviews"("eventId", "resolvedAt", "createdAt");
