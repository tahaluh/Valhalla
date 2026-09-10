ALTER TABLE "phases" ADD COLUMN "artisticNormalizationFactor" REAL NOT NULL DEFAULT 1;
ALTER TABLE "evaluation_sessions" ADD COLUMN "consensusScorecard" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "consensusTotal" REAL;
ALTER TABLE "evaluation_sessions" ADD COLUMN "consensusConfirmedAt" DATETIME;
ALTER TABLE "evaluation_sessions" ADD COLUMN "consensusConfirmedBy" TEXT;
ALTER TABLE "scores" ADD COLUMN "data" TEXT NOT NULL DEFAULT '';

UPDATE "categories"
SET "scoringFormula" = '(function(scores) {
  var max = scores[1] > scores[2] ? scores[1] : scores[2];
  var score = (scores[0] * 0.4) + (max * 0.6) + scores[4];
  var sum_palco = scores[1] + scores[2];
  return [score, -sum_palco, scores[3], -(scores[5] || 0)];
})'
WHERE "type" = 'ARTISTIC';

INSERT INTO "score_columns" ("id", "name", "order", "isReadOnly", "categoryId", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), 'Extra Round (Normalized)', 5, false, c."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "categories" c
WHERE c."type" = 'ARTISTIC'
  AND NOT EXISTS (
    SELECT 1 FROM "score_columns" sc WHERE sc."categoryId" = c."id" AND sc."order" = 5
  );
