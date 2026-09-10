ALTER TABLE "events" ADD COLUMN "rulesValidatedAt" DATETIME;
ALTER TABLE "events" ADD COLUMN "rulesValidatedBy" TEXT;
ALTER TABLE "events" ADD COLUMN "rulesValidationReference" TEXT;
ALTER TABLE "events" ADD COLUMN "rulesValidationNotes" TEXT;
ALTER TABLE "events" ADD COLUMN "rulesValidationHash" TEXT;
