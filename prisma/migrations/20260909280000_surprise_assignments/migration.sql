ALTER TABLE "evaluation_sessions" ADD COLUMN "surpriseEligible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "evaluation_sessions" ADD COLUMN "surpriseChallengeText" TEXT;
ALTER TABLE "evaluation_sessions" ADD COLUMN "surpriseDrawnAt" DATETIME;
