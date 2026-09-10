import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/database/prisma";
import { calculateArenaMaximum } from "@/domain/entities/ruleset";

export type RuleCheck = { key: string; label: string; ok: boolean; detail: string };

export async function validateEventRules(eventId: string, database: PrismaClient = prisma) {
  const [event, categories, phases, arenas, referees] = await Promise.all([
    database.event.findUniqueOrThrow({ where: { id: eventId } }),
    database.category.findMany({
      where: { eventId },
      include: { scoreColumns: { orderBy: { order: "asc" } } },
      orderBy: { order: "asc" },
    }),
    database.phase.findMany({ where: { eventId }, orderBy: { sequence: "asc" } }),
    database.arena.findMany({ where: { eventId }, orderBy: { order: "asc" } }),
    database.referee.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
  ]);
  const rescue = categories.filter((category) => category.type === "RESCUE");
  const artistic = categories.filter((category) => category.type === "ARTISTIC");
  const maxima = arenas.map((arena) => calculateArenaMaximum(arena));
  let challengeBanks = { LEVEL1: [] as string[], LEVEL2: [] as string[] };
  try {
    const parsed = JSON.parse(event.surpriseChallengeBank) as typeof challengeBanks | string[];
    challengeBanks = Array.isArray(parsed) ? { LEVEL1: parsed, LEVEL2: parsed } : parsed;
  } catch {}
  const checks: RuleCheck[] = [
    {
      key: "categories",
      label: "Categorias N1 e N2",
      ok: rescue.length >= 2 && artistic.length >= 2,
      detail: `${rescue.length} de Resgate e ${artistic.length} de Artística`,
    },
    {
      key: "rescue-columns",
      label: "Três notas e três tempos do Resgate",
      ok: rescue.every((category) => category.scoreColumns.length >= 6),
      detail: rescue
        .map((category) => `${category.name}: ${category.scoreColumns.length}`)
        .join(" · "),
    },
    {
      key: "category-levels",
      label: "Nível OBR explícito nas categorias",
      ok:
        !event.surpriseChallenge ||
        (rescue.every((category) => ["LEVEL1", "LEVEL2"].includes(category.competitionLevel)) &&
          ["LEVEL1", "LEVEL2"].every((level) =>
            rescue.some((category) => category.competitionLevel === level),
          )),
      detail: rescue
        .map((category) => `${category.name}: ${category.competitionLevel}`)
        .join(" · "),
    },
    {
      key: "artistic-columns",
      label: "Entrevista, apresentações, penalidades, sustentabilidade e extra",
      ok: artistic.every((category) => category.scoreColumns.length >= 6),
      detail: artistic
        .map((category) => `${category.name}: ${category.scoreColumns.length}`)
        .join(" · "),
    },
    {
      key: "phases",
      label: "Fases oficiais configuradas",
      ok:
        phases.filter((phase) => phase.type === "PRACTICE_ROUND").length >= 3 &&
        phases.some((phase) => phase.type === "INTERVIEW") &&
        phases.filter((phase) => phase.type === "PERFORMANCE").length >= 2 &&
        phases.some((phase) => phase.type === "EXTRA_ROUND"),
      detail: `${phases.length} fases cadastradas`,
    },
    {
      key: "arena-levels",
      label: "Arenas fácil, média e difícil",
      ok: ["EASY", "MEDIUM", "HARD"].every((level) =>
        arenas.some((arena) => arena.difficulty === level),
      ),
      detail: `${arenas.length} arenas cadastradas`,
    },
    {
      key: "arena-maximum",
      label: "Pontuação máxima equivalente entre arenas",
      ok: maxima.length >= 3 && new Set(maxima).size === 1,
      detail: arenas.map((arena, index) => `${arena.name}: ${maxima[index]} pts`).join(" · "),
    },
    {
      key: "officials",
      label: "Equipe mínima de arbitragem cadastrada",
      ok: referees.length >= 3,
      detail: `${referees.length} pessoas cadastradas`,
    },
    {
      key: "surprise",
      label: "Bancos de desafio surpresa por nível",
      ok:
        !event.surpriseChallenge ||
        (challengeBanks.LEVEL1?.length > 0 && challengeBanks.LEVEL2?.length > 0),
      detail: event.surpriseChallenge
        ? `N1: ${challengeBanks.LEVEL1?.length ?? 0} · N2: ${challengeBanks.LEVEL2?.length ?? 0}`
        : "Desafio desativado neste evento",
    },
    {
      key: "normalization",
      label: "Fator da apresentação extra válido",
      ok: phases
        .filter((phase) => phase.type === "EXTRA_ROUND")
        .every((phase) => phase.artisticNormalizationFactor > 0),
      detail: phases
        .filter((phase) => phase.type === "EXTRA_ROUND")
        .map((phase) => `${phase.name}: ${phase.artisticNormalizationFactor}×`)
        .join(" · "),
    },
  ];
  const snapshot = JSON.stringify({
    surpriseChallenge: event.surpriseChallenge,
    surpriseChallengeBank: event.surpriseChallengeBank,
    categories: categories.map((category) => ({
      id: category.id,
      type: category.type,
      competitionLevel: category.competitionLevel,
      formula: category.scoringFormula,
      columns: category.scoreColumns.map((column) => ({ name: column.name, order: column.order })),
    })),
    phases: phases.map((phase) => ({
      id: phase.id,
      type: phase.type,
      duration: phase.durationSeconds,
      calibration: phase.calibrationSeconds,
      normalization: phase.artisticNormalizationFactor,
    })),
    arenas: arenas.map((arena) => ({
      id: arena.id,
      rules: arena.scoringRules,
      tiles: arena.checkpointTiles,
      counts: [
        arena.seesaws,
        arena.intersections,
        arena.obstacles,
        arena.ramps,
        arena.gaps,
        arena.speedBumps,
      ],
      difficulty: arena.difficulty,
    })),
  });
  const hash = createHash("sha256").update(snapshot).digest("hex");
  return {
    checks,
    valid: checks.every((check) => check.ok),
    hash,
    approved: event.rulesValidationHash === hash && !!event.rulesValidatedAt,
    approval: {
      at: event.rulesValidatedAt,
      by: event.rulesValidatedBy,
      reference: event.rulesValidationReference,
      notes: event.rulesValidationNotes,
    },
  };
}
