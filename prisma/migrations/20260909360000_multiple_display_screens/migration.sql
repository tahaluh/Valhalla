CREATE TABLE "display_screens" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "display_screens_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "display_screens_eventId_slug_key" ON "display_screens"("eventId", "slug");
CREATE INDEX "display_screens_eventId_name_idx" ON "display_screens"("eventId", "name");

ALTER TABLE "display_views" ADD COLUMN "screenId" TEXT REFERENCES "display_screens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "display_views_screenId_order_idx" ON "display_views"("screenId", "order");

INSERT INTO "display_screens" ("id", "eventId", "name", "slug", "enabled", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), "id", 'Telão principal', 'principal', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "events";

UPDATE "display_views"
SET "screenId" = (SELECT "id" FROM "display_screens" WHERE "display_screens"."eventId" = "display_views"."eventId" AND "display_screens"."slug" = 'principal');
