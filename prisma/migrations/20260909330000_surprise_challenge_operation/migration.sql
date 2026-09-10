ALTER TABLE "events" ADD COLUMN "surpriseChallengeBank" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "evaluation_sessions" ADD COLUMN "surpriseStatus" TEXT NOT NULL DEFAULT 'PENDING';
