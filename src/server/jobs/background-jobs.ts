import { createHash } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma";
import { buildEventBackup } from "@/server/services/backup.service";
import { syncEventToOlimpo } from "@/server/services/olimpo.service";

declare global {
  // eslint-disable-next-line no-var
  var __valhallaBackgroundJobs: ReturnType<typeof setInterval> | undefined;
}

async function createAutomaticBackup(eventId: string) {
  const payload = JSON.stringify(await buildEventBackup(prisma, eventId));
  const snapshot = await prisma.backupSnapshot.create({
    data: {
      eventId,
      createdByName: "Sistema",
      kind: "AUTOMATIC",
      payload,
      checksum: createHash("sha256").update(payload).digest("hex"),
    },
  });
  const old = await prisma.backupSnapshot.findMany({
    where: { eventId, kind: "AUTOMATIC" },
    orderBy: { createdAt: "desc" },
    skip: 50,
    select: { id: true },
  });
  if (old.length)
    await prisma.backupSnapshot.deleteMany({ where: { id: { in: old.map((item) => item.id) } } });
  await prisma.auditLog.create({
    data: {
      eventId,
      action: "AUTOMATIC_BACKUP_CREATED",
      entityType: "BackupSnapshot",
      entityId: snapshot.id,
      actorRole: "SYSTEM",
      after: JSON.stringify({ checksum: snapshot.checksum, retained: 50 }),
    },
  });
}

async function auditBackgroundFailure(eventId: string, action: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error);
  await prisma.auditLog
    .create({
      data: {
        eventId,
        action,
        entityType: "Event",
        entityId: eventId,
        actorRole: "SYSTEM",
        reason: reason.slice(0, 500),
      },
    })
    .catch(() => undefined);
}

async function tick() {
  const now = Date.now();
  const events = await prisma.event.findMany({
    where: { OR: [{ olimpoAutoSyncEnabled: true }, { autoBackupEnabled: true }] },
  });
  for (const event of events) {
    if (
      event.olimpoAutoSyncEnabled &&
      (!event.olimpoLastSyncAttemptAt ||
        now - event.olimpoLastSyncAttemptAt.getTime() >= event.olimpoSyncIntervalSeconds * 1000)
    )
      await syncEventToOlimpo(event.id).catch(() => undefined);
    if (event.autoBackupEnabled) {
      const last = await prisma.backupSnapshot.findFirst({
        where: { eventId: event.id, kind: "AUTOMATIC" },
        orderBy: { createdAt: "desc" },
      });
      if (!last || now - last.createdAt.getTime() >= event.backupIntervalMinutes * 60_000)
        await createAutomaticBackup(event.id).catch((error) =>
          auditBackgroundFailure(event.id, "AUTOMATIC_BACKUP_FAILED", error),
        );
    }
  }
}

export function ensureBackgroundJobs() {
  if (global.__valhallaBackgroundJobs) return;
  void tick();
  global.__valhallaBackgroundJobs = setInterval(() => void tick(), 30_000);
}
