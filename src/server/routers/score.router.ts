import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, refereeProcedure, adminProcedure } from "@/server/trpc/trpc";
import type { Context } from "@/server/trpc/context";
import type { SessionUser } from "@/domain/entities/user";
import { AuthService } from "@/application/services/auth.service";
import { rankTeams } from "@/application/services/scoring.service";
import { buildPublicationSnapshot, requiresAdminCorrection } from "@/domain/entities/operation";

const submitScoreSchema = z.object({
  teamId: z.string().min(1),
  categoryId: z.string().min(1),
  arenaId: z.string().optional(),
  columnIndex: z.number().int().min(0),
  value: z.number(),
  data: z.string().max(50000).default(""),
  reason: z.string().trim().max(500).optional(),
  adminPassword: z.string().min(4).optional(),
  adminAuthorizerName: z.string().trim().max(120).optional(),
});

const submitBatchScoreSchema = z.object({
  teamId: z.string().min(1),
  categoryId: z.string().min(1),
  arenaId: z.string().optional(),
  adminPassword: z.string().min(4).optional(),
  adminAuthorizerName: z.string().trim().max(120).optional(),
  reason: z.string().trim().max(500).optional(),
  scores: z.array(
    z.object({
      columnIndex: z.number().int().min(0),
      value: z.number(),
      data: z.string().max(50000).default(""),
      reason: z.string().trim().max(500).optional(),
    }),
  ),
});

type ScoreWrite = z.infer<typeof submitScoreSchema>;

async function writeScore(ctx: Context & { user: SessionUser }, input: ScoreWrite) {
  const category = await ctx.prisma.category.findUnique({
    where: { id: input.categoryId },
    include: { event: { select: { publicRankingMode: true, adminPassword: true } } },
  });
  if (!category) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada." });
  }
  if (category.eventId !== ctx.user.eventId)
    throw new TRPCError({ code: "FORBIDDEN", message: "Categoria fora do evento atual." });
  const existingForApproval = await ctx.prisma.score.findUnique({
    where: {
      teamId_categoryId_columnIndex: {
        teamId: input.teamId,
        categoryId: input.categoryId,
        columnIndex: input.columnIndex,
      },
    },
  });
  // Toda sobrescrita deve ser motivada; no tablet ela também exige aprovação administrativa.
  if (requiresAdminCorrection(!!existingForApproval)) {
    if (!input.reason)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o motivo da correção." });
    if (!input.adminAuthorizerName)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Informe o nome do administrador responsável pela correção.",
      });
    if (ctx.user.role === "REFEREE") {
      if (
        !input.adminPassword ||
        !(await AuthService.verifyPassword(input.adminPassword, category.event.adminPassword))
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "A correção exige a senha do administrador.",
        });
      }
    }
  }
  return ctx.prisma.$transaction(async (tx) => {
    const existing = await tx.score.findUnique({
      where: {
        teamId_categoryId_columnIndex: {
          teamId: input.teamId,
          categoryId: input.categoryId,
          columnIndex: input.columnIndex,
        },
      },
    });
    const publicValue = category.event.publicRankingMode === "LIVE" ? input.value : undefined;
    const score = existing
      ? await tx.score.update({
          where: { id: existing.id },
          data: {
            value: input.value,
            data: input.data,
            arenaId: input.arenaId,
            submittedBy: ctx.user.role,
            ...(publicValue !== undefined ? { publicValue } : {}),
          },
        })
      : await tx.score.create({
          data: {
            teamId: input.teamId,
            categoryId: input.categoryId,
            columnIndex: input.columnIndex,
            value: input.value,
            data: input.data,
            publicValue: publicValue ?? null,
            arenaId: input.arenaId,
            submittedBy: ctx.user.role,
          },
        });

    await tx.scoreRevision.create({
      data: {
        scoreId: score.id,
        previousValue: existing?.value,
        nextValue: input.value,
        previousArenaId: existing?.arenaId,
        nextArenaId: input.arenaId,
        changedBy: input.adminAuthorizerName
          ? `${ctx.user.role}: ${input.adminAuthorizerName}`
          : ctx.user.role,
        reason: input.reason,
      },
    });

    return score;
  });
}

export const scoreRouter = router({
  getByTeamAndCategory: publicProcedure
    .input(z.object({ teamId: z.string(), categoryId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.score.findMany({
        where: { teamId: input.teamId, categoryId: input.categoryId },
        orderBy: { columnIndex: "asc" },
      });
    }),

  submitScore: refereeProcedure.input(submitScoreSchema).mutation(async ({ ctx, input }) => {
    return writeScore(ctx, input);
  }),

  submitBatch: refereeProcedure.input(submitBatchScoreSchema).mutation(async ({ ctx, input }) => {
    const results = await Promise.all(
      input.scores.map((score) => writeScore(ctx, { ...input, ...score })),
    );
    return results;
  }),

  getHistory: adminProcedure
    .input(z.object({ categoryId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.scoreRevision.findMany({
        where: { score: { categoryId: input.categoryId } },
        include: { score: { include: { team: { select: { name: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),

  setPublicationMode: adminProcedure
    .input(z.object({ eventId: z.string().min(1), mode: z.enum(["LIVE", "MANUAL"]) }))
    .mutation(async ({ ctx, input }) => {
      if (input.mode === "MANUAL") {
        const scores = await ctx.prisma.score.findMany({
          where: { category: { eventId: input.eventId } },
        });
        if (scores.length > 0) {
          await ctx.prisma.$transaction(
            scores.map((score) =>
              ctx.prisma.score.update({
                where: { id: score.id },
                data: { publicValue: score.value },
              }),
            ),
          );
        }
      }
      const updated = await ctx.prisma.event.update({
        where: { id: input.eventId },
        data: { publicRankingMode: input.mode, publicRankingPublishedAt: new Date() },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "PUBLICATION_MODE_CHANGED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: ctx.user.role,
          after: JSON.stringify({ mode: input.mode }),
        },
      });
      return updated;
    }),

  publishRanking: adminProcedure
    .input(
      z.object({
        eventId: z.string().min(1),
        createdByName: z.string().trim().min(2).default("Administração"),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const scores = await ctx.prisma.score.findMany({
        where: { category: { eventId: input.eventId } },
      });
      const snapshot = buildPublicationSnapshot(scores);
      return ctx.prisma.$transaction(async (tx) => {
        for (const score of scores)
          await tx.score.update({ where: { id: score.id }, data: { publicValue: score.value } });
        const batch = await tx.publicationBatch.create({
          data: {
            eventId: input.eventId,
            createdByName: input.createdByName,
            note: input.note,
            snapshot: JSON.stringify(snapshot),
          },
        });
        await tx.event.update({
          where: { id: input.eventId },
          data: { publicRankingPublishedAt: new Date(), activePublicationBatchId: batch.id },
        });
        await tx.auditLog.create({
          data: {
            eventId: input.eventId,
            action: "RANKING_BATCH_PUBLISHED",
            entityType: "PublicationBatch",
            entityId: batch.id,
            actorRole: ctx.user.role,
            operatorName: input.createdByName,
            after: JSON.stringify({ scores: snapshot.length, note: input.note }),
          },
        });
        return batch;
      });
    }),
  listPublicationBatches: adminProcedure.input(z.string()).query(({ ctx, input: eventId }) => {
    if (eventId !== ctx.user.eventId) throw new Error("Evento fora da sessão atual.");
    return ctx.prisma.publicationBatch.findMany({
      where: { eventId },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }),
  restorePublicationBatch: adminProcedure
    .input(
      z.object({
        batchId: z.string(),
        createdByName: z.string().trim().min(2),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.publicationBatch.findUnique({ where: { id: input.batchId } });
      if (!source || source.eventId !== ctx.user.eventId) throw new Error("Lote não encontrado.");
      const snapshot = JSON.parse(source.snapshot) as Array<{
        scoreId: string;
        publicValue: number;
      }>;
      return ctx.prisma.$transaction(async (tx) => {
        for (const item of snapshot)
          await tx.score.updateMany({
            where: { id: item.scoreId, category: { eventId: source.eventId } },
            data: { publicValue: item.publicValue },
          });
        const restored = await tx.publicationBatch.create({
          data: {
            eventId: source.eventId,
            createdByName: input.createdByName,
            note: input.note || `Restauração do lote ${source.id}`,
            restoredFromId: source.id,
            snapshot: source.snapshot,
          },
        });
        await tx.event.update({
          where: { id: source.eventId },
          data: { activePublicationBatchId: restored.id, publicRankingPublishedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            eventId: source.eventId,
            action: "RANKING_BATCH_RESTORED",
            entityType: "PublicationBatch",
            entityId: restored.id,
            actorRole: ctx.user.role,
            operatorName: input.createdByName,
            reason: input.note,
            before: JSON.stringify({ batchId: source.id }),
            after: JSON.stringify({ batchId: restored.id }),
          },
        });
        return restored;
      });
    }),

  getRescueProgress: refereeProcedure
    .input(z.string())
    .query(async ({ ctx, input: categoryId }) => {
      const category = await ctx.prisma.category.findUnique({
        where: { id: categoryId },
        include: {
          scoreColumns: { orderBy: { order: "asc" } },
        },
      });

      if (!category) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
      }

      const teams = await ctx.prisma.team.findMany({
        where: { categoryId, attendanceConfirmed: true },
        include: {
          scores: {
            where: { categoryId },
            orderBy: { columnIndex: "asc" },
          },
        },
        orderBy: { name: "asc" },
      });

      const rounds: Array<{
        roundNumber: number;
        scoreColumnIndex: number;
        scoreColumnName: string;
        timeColumnIndex: number | null;
        timeColumnName: string | null;
      }> = [];
      for (let index = 0; index < category.scoreColumns.length; index += 2) {
        const scoreColumn = category.scoreColumns[index];
        if (!scoreColumn) {
          continue;
        }

        rounds.push({
          roundNumber: rounds.length + 1,
          scoreColumnIndex: scoreColumn.order,
          scoreColumnName: scoreColumn.name,
          timeColumnIndex: category.scoreColumns[index + 1]?.order ?? null,
          timeColumnName: category.scoreColumns[index + 1]?.name ?? null,
        });
      }

      return {
        category: {
          id: category.id,
          name: category.name,
          type: category.type,
        },
        rounds,
        teams: teams.map((team) => {
          const scoreMap = new Map(team.scores.map((score) => [score.columnIndex, score]));

          return {
            id: team.id,
            name: team.name,
            institution: team.institution,
            city: team.city,
            state: team.state,
            rounds: rounds.map((round) => {
              const scoreValue = scoreMap.get(round.scoreColumnIndex)?.value ?? null;
              const timeValue =
                round.timeColumnIndex !== null
                  ? (scoreMap.get(round.timeColumnIndex)?.value ?? null)
                  : null;

              return {
                roundNumber: round.roundNumber,
                scoreColumnIndex: round.scoreColumnIndex,
                timeColumnIndex: round.timeColumnIndex,
                scoreValue,
                timeValue,
                completed: scoreValue !== null || timeValue !== null,
              };
            }),
          };
        }),
      };
    }),

  getRanking: publicProcedure.input(z.string()).query(async ({ ctx, input: categoryId }) => {
    const category = await ctx.prisma.category.findUnique({
      where: { id: categoryId },
      include: { event: { select: { publicRankingMode: true, publicRankingPublishedAt: true } } },
    });
    if (!category) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Category not found" });
    }

    const teams = await ctx.prisma.team.findMany({
      where: { categoryId, attendanceConfirmed: true },
      include: {
        scores: { orderBy: { columnIndex: "asc" } },
      },
    });

    const columns = await ctx.prisma.scoreColumn.findMany({
      where: { categoryId },
      orderBy: { order: "asc" },
    });

    const columnCount = columns.length;

    const teamsWithScores = teams.map((team) => {
      const scoreArray: number[] = Array(columnCount).fill(0) as number[];
      const shouldUseCurrentValues =
        category.event.publicRankingMode === "LIVE" || ctx.session.user?.role === "ADMIN";
      for (const score of team.scores) {
        if (score.columnIndex < columnCount) {
          scoreArray[score.columnIndex] = shouldUseCurrentValues
            ? score.value
            : (score.publicValue ?? 0);
        }
      }
      return {
        teamId: team.id,
        teamName: team.name,
        institution: team.institution,
        city: team.city,
        state: team.state,
        scores: scoreArray,
      };
    });

    return {
      category: {
        id: category.id,
        name: category.name,
        type: category.type,
      },
      columns: columns.map((c) => c.name),
      publication: {
        mode: category.event.publicRankingMode,
        publishedAt: category.event.publicRankingPublishedAt,
      },
      ranking: rankTeams(teamsWithScores, category.scoringFormula),
    };
  }),
  getPublicRanking: publicProcedure.input(z.string()).query(async ({ ctx, input: categoryId }) => {
    const category = await ctx.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        event: {
          select: {
            publicRankingMode: true,
            publicRankingPublishedAt: true,
            resultsStatus: true,
          },
        },
      },
    });
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada." });
    const [teams, columns] = await Promise.all([
      ctx.prisma.team.findMany({
        where: { categoryId, attendanceConfirmed: true },
        include: { scores: { orderBy: { columnIndex: "asc" } } },
      }),
      ctx.prisma.scoreColumn.findMany({ where: { categoryId }, orderBy: { order: "asc" } }),
    ]);
    const teamsWithScores = teams.map((team) => {
      const scores = Array<number>(columns.length).fill(0);
      for (const score of team.scores) {
        if (score.columnIndex < columns.length)
          scores[score.columnIndex] =
            category.event.publicRankingMode === "LIVE" ? score.value : (score.publicValue ?? 0);
      }
      return {
        teamId: team.id,
        teamName: team.name,
        institution: team.institution,
        city: team.city,
        state: team.state,
        scores,
      };
    });
    return {
      category: { id: category.id, name: category.name, type: category.type },
      columns: columns.map((column) => column.name),
      publication: {
        mode: category.event.publicRankingMode,
        publishedAt: category.event.publicRankingPublishedAt,
        resultsStatus: category.event.resultsStatus,
      },
      ranking: rankTeams(teamsWithScores, category.scoringFormula),
    };
  }),
});
