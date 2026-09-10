UPDATE "display_views"
SET "order" = "order" + 1
WHERE "type" <> 'CALLS'
  AND "order" >= 2
  AND "eventId" IN (SELECT DISTINCT "eventId" FROM "display_views" WHERE "type" = 'CALLS');

UPDATE "display_views"
SET "order" = 2
WHERE "type" = 'CALLS';
