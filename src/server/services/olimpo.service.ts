import { prisma } from "@/infrastructure/database/prisma";
import { rankTeams } from "@/application/services/scoring.service";

export type OlimpoCategoryInput = {
  scoringFormula: string;
  scoreColumns: Array<{ name: string; order: number }>;
  teams: Array<{
    id: string;
    name: string;
    institution: string;
    city: string;
    state: string;
    externalId: string | null;
    externalEventToken: string | null;
    externalStepId: string | null;
    scores: Array<{ columnIndex: number; value: number; data: string }>;
  }>;
};

async function loadCategories(eventId: string) {
  return prisma.category.findMany({
    where: { eventId },
    include: { scoreColumns: { orderBy: { order: "asc" } }, teams: { include: { scores: true } } },
  });
}

export function buildOlimpoSteps(categories: OlimpoCategoryInput[]) {
  return categories.flatMap((category) => {
    const groups = new Map<string, typeof category.teams>();
    for (const team of category.teams) {
      if (!team.externalId || !team.externalEventToken || !team.externalStepId) continue;
      const key = `${team.externalStepId}\u0000${team.externalEventToken}`;
      groups.set(key, [...(groups.get(key) ?? []), team]);
    }
    return [...groups.values()].map((teams) => {
      const first = teams[0]!;
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
      return {
        id: first.externalStepId!,
        token: first.externalEventToken!,
        headers,
        scores: teams.map((team) => {
          const rank = rankById.get(team.id)!;
          const dataMap: Record<string, string> = {};
          const headersMap: Record<string, number> = {
            Posição: rank.rank,
            "Pontuação final": rank.finalScore,
          };
          for (const column of category.scoreColumns) {
            const score = team.scores.find((item) => item.columnIndex === column.order);
            headersMap[column.name] = score?.value ?? 0;
            dataMap[column.name] = score?.data ?? "";
          }
          return { id: team.externalId!, dataMap, headersMap };
        }),
      };
    });
  });
}

export async function syncEventToOlimpo(eventId: string, actorRole = "SYSTEM") {
  const steps = buildOlimpoSteps(await loadCategories(eventId));
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
