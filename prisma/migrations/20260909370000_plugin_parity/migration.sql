ALTER TABLE "events" ADD COLUMN "olimpoAutoSyncEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "events" ADD COLUMN "olimpoSyncIntervalSeconds" INTEGER NOT NULL DEFAULT 600;
ALTER TABLE "events" ADD COLUMN "logoUrl" TEXT;
ALTER TABLE "events" ADD COLUMN "rulesUpdateNotice" TEXT;
ALTER TABLE "arenas" ADD COLUMN "difficulty" TEXT NOT NULL DEFAULT 'MEDIUM';

CREATE TABLE "schedule_blackouts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "schedule_blackouts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "schedule_blackouts_eventId_startsAt_idx" ON "schedule_blackouts"("eventId", "startsAt");
