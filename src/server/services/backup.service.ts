import type { Prisma } from "@prisma/client";

export async function buildEventBackup(tx: Prisma.TransactionClient, eventId: string) {
  const event = await tx.event.findUnique({ where: { id: eventId } });
  if (!event) throw new Error("Evento não encontrado.");
  const categories = await tx.category.findMany({ where: { eventId } });
  const categoryIds = categories.map((item) => item.id);
  const teams = await tx.team.findMany({ where: { categoryId: { in: categoryIds } } });
  const scores = await tx.score.findMany({ where: { categoryId: { in: categoryIds } } });
  const slots = await tx.scheduleSlot.findMany({ where: { eventId } });
  return {
    format: "VALHALLA_OBR_BACKUP" as const,
    version: 1 as const,
    createdAt: new Date().toISOString(),
    event,
    categories,
    scoreColumns: await tx.scoreColumn.findMany({ where: { categoryId: { in: categoryIds } } }),
    teams,
    arenas: await tx.arena.findMany({ where: { eventId } }),
    referees: await tx.referee.findMany({ where: { eventId } }),
    stations: await tx.evaluationStation.findMany({ where: { eventId } }),
    phases: await tx.phase.findMany({ where: { eventId } }),
    slots,
    sessions: await tx.evaluationSession.findMany({
      where: { slotId: { in: slots.map((slot) => slot.id) } },
    }),
    draftRevisions: await tx.scorecardDraftRevision.findMany({
      where: { session: { slot: { eventId } } },
    }),
    judgeScores: await tx.judgeScore.findMany({ where: { session: { slot: { eventId } } } }),
    terminals: await tx.terminal.findMany({ where: { eventId } }),
    terminalUsages: await tx.terminalUsage.findMany({ where: { terminal: { eventId } } }),
    auditLogs: await tx.auditLog.findMany({ where: { eventId } }),
    offlineReviews: await tx.offlineCommandReview.findMany({ where: { eventId } }),
    displayViews: await tx.displayView.findMany({ where: { eventId } }),
    displayScreens: await tx.displayScreen.findMany({ where: { eventId } }),
    scores,
    scoreRevisions: await tx.scoreRevision.findMany({
      where: { scoreId: { in: scores.map((score) => score.id) } },
    }),
    appeals: await tx.formalAppeal.findMany({ where: { eventId } }),
    publicationBatches: await tx.publicationBatch.findMany({ where: { eventId } }),
    scheduleBlackouts: await tx.scheduleBlackout.findMany({ where: { eventId } }),
  };
}

export type EventBackup = Awaited<ReturnType<typeof buildEventBackup>>;
