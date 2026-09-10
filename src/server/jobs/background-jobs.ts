import { createHash } from "node:crypto";
import { prisma } from "@/infrastructure/database/prisma";
import { rankTeams } from "@/application/services/scoring.service";
import { buildEventBackup } from "@/server/services/backup.service";

declare global {
  // eslint-disable-next-line no-var
  var __valhallaBackgroundJobs: ReturnType<typeof setInterval> | undefined;
}

export async function syncEventToOlimpo(eventId: string, actorRole = "SYSTEM") {
  const categories = await prisma.category.findMany({
    where: { eventId },
    include: { scoreColumns: { orderBy: { order: "asc" } }, teams: { include: { scores: true } } },
  });
  const steps = categories.flatMap((category) => {
    const teams = category.teams.filter(
      (team) => team.externalId && team.externalEventToken && team.externalStepId,
    );
    if (!teams.length) return [];
    const ranked = rankTeams(
      teams.map((team) => ({
        teamId: team.id,
        teamName: team.name,
        institution: team.institution,
        city: team.city,
        state: team.state,
        scores: category.scoreColumns.map(
          (column) => team.scores.find((score) => score.columnIndex === column.order)?.value ?? 0,
        ),
      })),
      category.scoringFormula,
    );
    const rankById = new Map(ranked.map((row) => [row.teamId, row]));
    const headers = [
      "Posição",
      ...category.scoreColumns.map((column) => column.name),
      "Pontuação final",
    ];
    return [
      {
        id: teams[0]!.externalStepId!,
        token: teams[0]!.externalEventToken!,
        headers,
        scores: teams.map((team) => {
          const rank = rankById.get(team.id)!;
          const dataMap: Record<string, string> = {};
          const headersMap: Record<string, number> = {
            Posição: rank.rank,
            "Pontuação final": rank.finalScore,
          };
          category.scoreColumns.forEach((column) => {
            dataMap[column.name] = "";
            headersMap[column.name] =
              team.scores.find((score) => score.columnIndex === column.order)?.value ?? 0;
          });
          return { id: team.externalId!, dataMap, headersMap };
        }),
      },
    ];
  });
  if (!steps.length) throw new Error("Nenhuma equipe possui etapa, token e ID do Olimpo.");
  const endpoint =
    process.env.OLIMPO_SCORE_API_URL ?? "https://olimpo.robocup.org.br/api/events/steps/score";
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steps }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await response.text()).slice(0, 2000);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
    const syncedAt = new Date();
    await prisma.event.update({
      where: { id: eventId },
      data: {
        olimpoLastSyncAt: syncedAt,
        olimpoLastSyncStatus: "SUCCESS",
        olimpoLastSyncMessage: body || "OK",
      },
    });
    await prisma.auditLog.create({
      data: {
        eventId,
        action: "OLIMPO_RESULTS_SYNCED",
        entityType: "Event",
        entityId: eventId,
        actorRole,
        after: JSON.stringify({ steps: steps.length, syncedAt, endpoint }),
      },
    });
    return { success: true, steps: steps.length, syncedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.event.update({
      where: { id: eventId },
      data: {
        olimpoLastSyncAt: new Date(),
        olimpoLastSyncStatus: "ERROR",
        olimpoLastSyncMessage: message.slice(0, 2000),
      },
    });
    await prisma.auditLog.create({
      data: {
        eventId,
        action: "OLIMPO_SYNC_FAILED",
        entityType: "Event",
        entityId: eventId,
        actorRole,
        reason: message.slice(0, 500),
      },
    });
    throw error;
  }
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
      (!event.olimpoLastSyncAt ||
        now - event.olimpoLastSyncAt.getTime() >= event.olimpoSyncIntervalSeconds * 1000)
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
