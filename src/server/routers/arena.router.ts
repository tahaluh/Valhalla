import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "@/server/trpc/trpc";
import { DEFAULT_RESCUE_RULESET_2026 } from "@/domain/entities/ruleset";

const rulesetSchema = z.object({
  challengePoints: z.object({
    seesaws: z.number().min(0),
    intersections: z.number().min(0),
    obstacles: z.number().min(0),
    ramps: z.number().min(0),
    gaps: z.number().min(0),
    speedBumps: z.number().min(0),
  }),
  checkpointAttemptPoints: z.array(z.number().min(0)).min(1),
  startTilePoints: z.number().min(0),
  exitBonusPoints: z.number().min(0),
  exitPenaltyPerFailure: z.number().min(0),
  correctVictimMultiplier: z.number().min(1),
  switchedVictimMultiplier: z.number().min(1),
  surpriseChallengeMultiplier: z.number().min(1),
  calibrationSeconds: z.number().int().min(0),
  roundSeconds: z.number().int().min(1),
});

const createArenaSchema = z
  .object({
    name: z.string().min(1).max(200),
    order: z.number().int().min(0).optional(),
    checkpointCount: z.number().int().min(0).default(0),
    checkpointTiles: z.array(z.number().int().min(0)).default([]),
    seesaws: z.number().int().min(0).default(0),
    intersections: z.number().int().min(0).default(0),
    obstacles: z.number().int().min(0).default(0),
    ramps: z.number().int().min(0).default(0),
    gaps: z.number().int().min(0).default(0),
    speedBumps: z.number().int().min(0).default(0),
    rulesetName: z.string().min(1).max(200).default("OBR Prática Regional 2026"),
    rulesetVersion: z.string().min(1).max(50).default("2026.1"),
    scoringRules: rulesetSchema.default(DEFAULT_RESCUE_RULESET_2026),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  })
  .refine((data) => data.checkpointTiles.length === data.checkpointCount, {
    message: "checkpointTiles length must match checkpointCount",
    path: ["checkpointTiles"],
  });

const updateArenaSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(200).optional(),
    order: z.number().int().min(0).optional(),
    checkpointCount: z.number().int().min(0).optional(),
    checkpointTiles: z.array(z.number().int().min(0)).optional(),
    seesaws: z.number().int().min(0).optional(),
    intersections: z.number().int().min(0).optional(),
    obstacles: z.number().int().min(0).optional(),
    ramps: z.number().int().min(0).optional(),
    gaps: z.number().int().min(0).optional(),
    speedBumps: z.number().int().min(0).optional(),
    rulesetName: z.string().min(1).max(200).optional(),
    rulesetVersion: z.string().min(1).max(50).optional(),
    scoringRules: rulesetSchema.optional(),
    difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
  })
  .refine(
    (data) =>
      data.checkpointCount === undefined ||
      data.checkpointTiles === undefined ||
      data.checkpointTiles.length === data.checkpointCount,
    {
      message: "checkpointTiles length must match checkpointCount",
      path: ["checkpointTiles"],
    },
  );

export const arenaRouter = router({
  listByEvent: publicProcedure.input(z.string()).query(async ({ ctx, input }) => {
    return ctx.prisma.arena.findMany({
      where: { eventId: input },
      orderBy: { order: "asc" },
    });
  }),

  getById: publicProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const arena = await ctx.prisma.arena.findUnique({ where: { id: input } });
    if (!arena) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Arena not found" });
    }
    return arena;
  }),

  create: adminProcedure.input(createArenaSchema).mutation(async ({ ctx, input }) => {
    const { checkpointTiles, scoringRules, ...rest } = input;
    const eventId = ctx.user.eventId;
    const count = await ctx.prisma.arena.count({ where: { eventId } });
    return ctx.prisma.$transaction(async (tx) => {
      const arena = await tx.arena.create({
        data: {
          ...rest,
          eventId,
          order: input.order ?? count,
          checkpointTiles: JSON.stringify(checkpointTiles),
          scoringRules: JSON.stringify(scoringRules),
        },
      });
      await tx.evaluationStation.create({
        data: {
          eventId,
          name: arena.name,
          type: "PRACTICE_ARENA",
          order: arena.order,
          arenaId: arena.id,
        },
      });
      await tx.auditLog.create({
        data: {
          eventId,
          action: "ARENA_CREATED",
          entityType: "Arena",
          entityId: arena.id,
          actorRole: ctx.user.role,
          after: JSON.stringify(arena),
        },
      });
      return arena;
    });
  }),

  update: adminProcedure.input(updateArenaSchema).mutation(async ({ ctx, input }) => {
    const { id, checkpointTiles, scoringRules, ...rest } = input;
    const arena = await ctx.prisma.arena.findUnique({ where: { id } });
    if (!arena) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Arena not found" });
    }
    if (arena.eventId !== ctx.user.eventId)
      throw new TRPCError({ code: "FORBIDDEN", message: "Arena fora do evento atual." });
    return ctx.prisma.$transaction(async (tx) => {
      const updated = await tx.arena.update({
        where: { id },
        data: {
          ...rest,
          ...(checkpointTiles !== undefined
            ? { checkpointTiles: JSON.stringify(checkpointTiles) }
            : {}),
          ...(scoringRules !== undefined ? { scoringRules: JSON.stringify(scoringRules) } : {}),
        },
      });
      if (input.name)
        await tx.evaluationStation.updateMany({
          where: { arenaId: id },
          data: { name: input.name },
        });
      await tx.auditLog.create({
        data: {
          eventId: arena.eventId,
          action: "ARENA_UPDATED",
          entityType: "Arena",
          entityId: arena.id,
          actorRole: ctx.user.role,
          before: JSON.stringify(arena),
          after: JSON.stringify(updated),
        },
      });
      return updated;
    });
  }),

  delete: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const arena = await ctx.prisma.arena.findUnique({ where: { id: input } });
    if (!arena) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Arena not found" });
    }
    if (arena.eventId !== ctx.user.eventId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this arena" });
    }
    await ctx.prisma.arena.delete({ where: { id: input } });
    await ctx.prisma.auditLog.create({
      data: {
        eventId: arena.eventId,
        action: "ARENA_REMOVED",
        entityType: "Arena",
        entityId: input,
        actorRole: ctx.user.role,
        before: JSON.stringify(arena),
      },
    });
    return { success: true };
  }),
});
