INSERT INTO "evaluation_stations" ("id", "name", "type", "order", "eventId", "arenaId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), a."name", 'PRACTICE_ARENA', a."order", a."eventId", a."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "arenas" a
WHERE NOT EXISTS (SELECT 1 FROM "evaluation_stations" s WHERE s."arenaId" = a."id");

INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "eventId")
SELECT lower(hex(randomblob(12))), 'Prática · Rodada 1', 'PRACTICE_ROUND', 1, 300, 120, e."id" FROM "events" e WHERE NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."eventId"=e."id" AND p."sequence"=1);
INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "eventId")
SELECT lower(hex(randomblob(12))), 'Prática · Rodada 2', 'PRACTICE_ROUND', 2, 300, 120, e."id" FROM "events" e WHERE NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."eventId"=e."id" AND p."sequence"=2);
INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "eventId")
SELECT lower(hex(randomblob(12))), 'Prática · Rodada 3', 'PRACTICE_ROUND', 3, 300, 120, e."id" FROM "events" e WHERE NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."eventId"=e."id" AND p."sequence"=3);
INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "eventId")
SELECT lower(hex(randomblob(12))), 'Artística · Entrevista', 'INTERVIEW', 4, 600, 0, e."id" FROM "events" e WHERE NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."eventId"=e."id" AND p."sequence"=4);
INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "eventId")
SELECT lower(hex(randomblob(12))), 'Artística · Apresentação 1', 'PERFORMANCE', 5, 420, 0, e."id" FROM "events" e WHERE NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."eventId"=e."id" AND p."sequence"=5);
INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "eventId")
SELECT lower(hex(randomblob(12))), 'Artística · Apresentação 2', 'PERFORMANCE', 6, 420, 0, e."id" FROM "events" e WHERE NOT EXISTS (SELECT 1 FROM "phases" p WHERE p."eventId"=e."id" AND p."sequence"=6);
