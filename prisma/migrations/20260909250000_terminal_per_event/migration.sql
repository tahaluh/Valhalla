DROP INDEX IF EXISTS "terminals_deviceKey_key";
CREATE UNIQUE INDEX "terminals_eventId_deviceKey_key" ON "terminals"("eventId", "deviceKey");
