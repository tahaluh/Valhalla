INSERT INTO "display_views" ("id", "eventId", "name", "type", "durationSeconds", "order", "enabled", "config", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), e."id", 'Mesas ao vivo', 'STATIONS', 18,
       COALESCE((SELECT MAX(v."order") + 1 FROM "display_views" v WHERE v."eventId" = e."id"), 0),
       true, '{"title":"Mesas, arenas e palcos","theme":"OBR","maxItems":9}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "events" e
WHERE NOT EXISTS (SELECT 1 FROM "display_views" current_view WHERE current_view."eventId" = e."id" AND current_view."type" = 'STATIONS');
