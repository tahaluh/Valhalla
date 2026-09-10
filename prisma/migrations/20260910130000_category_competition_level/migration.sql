ALTER TABLE "categories" ADD COLUMN "competitionLevel" TEXT NOT NULL DEFAULT 'NONE';

UPDATE "categories"
SET "competitionLevel" = CASE
  WHEN lower("name") LIKE '%nivel 1%' OR lower("name") LIKE '%nível 1%' OR lower("name") LIKE 'n1%' OR lower("name") LIKE '% n1%' THEN 'LEVEL1'
  WHEN lower("name") LIKE '%nivel 2%' OR lower("name") LIKE '%nível 2%' OR lower("name") LIKE 'n2%' OR lower("name") LIKE '% n2%' THEN 'LEVEL2'
  ELSE 'NONE'
END;

ALTER TABLE "evaluation_sessions" ADD COLUMN "surpriseJudgeName" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "surpriseTerminalId" TEXT;
