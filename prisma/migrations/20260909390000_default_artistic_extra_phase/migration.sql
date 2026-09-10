INSERT INTO "phases" ("id", "name", "type", "sequence", "durationSeconds", "calibrationSeconds", "artisticNormalizationFactor", "operationalStatus", "eventId")
SELECT lower(hex(randomblob(16))), 'Artística · Apresentação extra', 'EXTRA_ROUND',
  COALESCE((SELECT MAX(p2."sequence") FROM "phases" p2 WHERE p2."eventId" = e."id"), 0) + 1,
  420, 0, 1, 'CLOSED', e."id"
FROM "events" e
WHERE NOT EXISTS (
  SELECT 1 FROM "phases" p WHERE p."eventId" = e."id" AND p."type" = 'EXTRA_ROUND'
);
