ALTER TABLE "evaluation_stations" ADD COLUMN "arenaId" TEXT REFERENCES "arenas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "evaluation_sessions" ADD COLUMN "announcerName" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "scorerName" TEXT;
CREATE INDEX "evaluation_stations_arenaId_idx" ON "evaluation_stations"("arenaId");
