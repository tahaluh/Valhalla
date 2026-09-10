INSERT INTO "display_views" (
  "id", "eventId", "name", "type", "durationSeconds", "order", "enabled", "config", "createdAt", "updatedAt"
)
SELECT
  lower(hex(randomblob(16))),
  e."id",
  'Chamadas recentes',
  'CALLS',
  15,
  COALESCE((SELECT MAX(v."order") + 1 FROM "display_views" v WHERE v."eventId" = e."id"), 0),
  1,
  '{"title":"Chamadas recentes","theme":"OBR","maxItems":8}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "events" e
WHERE NOT EXISTS (
  SELECT 1 FROM "display_views" existing
  WHERE existing."eventId" = e."id" AND existing."type" = 'CALLS'
);
