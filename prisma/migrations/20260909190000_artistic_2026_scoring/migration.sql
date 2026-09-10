INSERT INTO "score_columns" ("id", "name", "order", "isReadOnly", "categoryId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), 'Sustainability', 4, false, c."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "categories" c
WHERE c."type" = 'ARTISTIC'
  AND NOT EXISTS (SELECT 1 FROM "score_columns" s WHERE s."categoryId" = c."id" AND s."order" = 4);

UPDATE "categories" SET "scoringFormula" = '(function(scores) { var max = scores[1] > scores[2] ? scores[1] : scores[2]; var score = (scores[0] * 0.4) + (max * 0.6) + scores[4]; var sum_palco = scores[1] + scores[2]; return [score, -sum_palco, scores[3]]; })'
WHERE "type" = 'ARTISTIC';
