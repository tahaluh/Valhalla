import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { router, publicProcedure, adminProcedure } from "@/server/trpc/trpc";
import { DEFAULT_CATEGORIES, getCategoryPreset } from "@/domain/entities/category";
import { TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES } from "@/domain/entities/surprise-challenge";
import { AuthService } from "@/application/services/auth.service";

const createEventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  adminPassword: z.string().min(4),
  refereePassword: z.string().min(4),
  secretariatPassword: z.string().min(4),
});

const bootstrapEventSchema = z.object({
  name: z.string().min(1).max(200),
  adminPassword: z.string().min(4),
  refereePassword: z.string().min(4),
  secretariatPassword: z.string().min(4),
});

const updateEventSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  location: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  surpriseChallenge: z.boolean().optional(),
  surpriseLeadMinutes: z.number().int().min(0).optional(),
  surpriseWindowOpen: z.boolean().optional(),
  logoUrl: z.string().url().max(2000).optional().or(z.literal("")),
  rulesUpdateNotice: z.string().max(2000).optional(),
});

/**
 * Shared helper: create an event plus its default categories/columns.
 * Used by both `create` (admin-protected) and `bootstrap` (public, DB-empty guard).
 */
async function createEventWithDefaults(
  prisma: PrismaClient,
  input: z.infer<typeof createEventSchema> & { startDate: string },
  isActive = false,
) {
  const [adminHash, refereeHash, secretariatHash] = await Promise.all([
    AuthService.hashPassword(input.adminPassword),
    AuthService.hashPassword(input.refereePassword),
    AuthService.hashPassword(input.secretariatPassword),
  ]);

  const event = await prisma.event.create({
    data: {
      name: input.name,
      description: input.description,
      location: input.location,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : undefined,
      adminPassword: adminHash,
      refereePassword: refereeHash,
      secretariatPassword: secretariatHash,
      isActive,
      surpriseChallengeBank: JSON.stringify(TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES),
    },
  });

  const createdCategories: Array<{ id: string; type: string }> = [];
  for (const [index, defaultCat] of DEFAULT_CATEGORIES.entries()) {
    const preset = getCategoryPreset(defaultCat.type);

    const category = await prisma.category.create({
      data: {
        name: defaultCat.name,
        type: defaultCat.type,
        competitionLevel: defaultCat.competitionLevel,
        order: index,
        scoringFormula: preset.scoringFormula,
        eventId: event.id,
      },
    });

    await prisma.scoreColumn.createMany({
      data: preset.columns.map((col, colIndex) => ({
        name: col,
        order: colIndex,
        categoryId: category.id,
      })),
    });
    createdCategories.push({ id: category.id, type: category.type });
  }

  await prisma.phase.createMany({
    data: [
      {
        eventId: event.id,
        name: "Prática · Rodada 1",
        type: "PRACTICE_ROUND",
        sequence: 1,
        durationSeconds: 300,
        calibrationSeconds: 120,
      },
      {
        eventId: event.id,
        name: "Prática · Rodada 2",
        type: "PRACTICE_ROUND",
        sequence: 2,
        durationSeconds: 300,
        calibrationSeconds: 120,
      },
      {
        eventId: event.id,
        name: "Prática · Rodada 3",
        type: "PRACTICE_ROUND",
        sequence: 3,
        durationSeconds: 300,
        calibrationSeconds: 120,
      },
      {
        eventId: event.id,
        name: "Artística · Entrevista",
        type: "INTERVIEW",
        sequence: 4,
        durationSeconds: 600,
        calibrationSeconds: 0,
      },
      {
        eventId: event.id,
        name: "Artística · Apresentação 1",
        type: "PERFORMANCE",
        sequence: 5,
        durationSeconds: 420,
        calibrationSeconds: 0,
      },
      {
        eventId: event.id,
        name: "Artística · Apresentação 2",
        type: "PERFORMANCE",
        sequence: 6,
        durationSeconds: 420,
        calibrationSeconds: 0,
      },
      {
        eventId: event.id,
        name: "Artística · Apresentação extra",
        type: "EXTRA_ROUND",
        sequence: 7,
        durationSeconds: 420,
        calibrationSeconds: 0,
        artisticNormalizationFactor: 1,
      },
    ],
  });
  const firstCategory = createdCategories[0]?.id;
  const mainScreen = await prisma.displayScreen.create({
    data: { eventId: event.id, name: "Ranking e informações", slug: "ranking" },
  });
  await prisma.displayView.createMany({
    data: [
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Ranking",
        type: "RANKING",
        order: 0,
        durationSeconds: 20,
        config: JSON.stringify({ categoryId: firstCategory, theme: "OBR", maxItems: 10 }),
      },
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Próximos horários",
        type: "SCHEDULE",
        order: 1,
        durationSeconds: 20,
        config: JSON.stringify({ title: "Próximas atividades", theme: "OBR", maxItems: 10 }),
      },
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Chamadas recentes",
        type: "CALLS",
        order: 2,
        durationSeconds: 15,
        config: JSON.stringify({ title: "Chamadas recentes", theme: "OBR", maxItems: 8 }),
      },
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Mesas ao vivo",
        type: "STATIONS",
        order: 3,
        durationSeconds: 18,
        config: JSON.stringify({ title: "Mesas, arenas e palcos", theme: "OBR", maxItems: 9 }),
      },
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Aviso",
        type: "ANNOUNCEMENT",
        order: 4,
        durationSeconds: 15,
        config: JSON.stringify({
          title: "Bem-vindos à OBR",
          message: "Acompanhe a programação e os resultados nesta tela.",
          theme: "OBR",
        }),
      },
    ],
  });

  return event;
}

export const eventRouter = router({
  /**
   * Returns whether the system needs first-time setup (no events in DB).
   * Used to redirect unauthenticated users to /setup on fresh installs.
   */
  needsSetup: publicProcedure.query(async ({ ctx }) => {
    const count = await ctx.prisma.event.count();
    return count === 0;
  }),

  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.event.findMany({
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startDate: true,
        endDate: true,
        isActive: true,
        logoUrl: true,
        rulesUpdateNotice: true,
        resultsStatus: true,
        resultsHomologatedAt: true,
        createdAt: true,
      },
    });
  }),

  getActive: publicProcedure.query(async ({ ctx }) => {
    return ctx.prisma.event.findFirst({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startDate: true,
        endDate: true,
        isActive: true,
        logoUrl: true,
        rulesUpdateNotice: true,
      },
    });
  }),

  getById: publicProcedure.input(z.string()).query(async ({ ctx, input }) => {
    const event = await ctx.prisma.event.findUnique({
      where: { id: input },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        startDate: true,
        endDate: true,
        isActive: true,
        surpriseChallenge: true,
        surpriseLeadMinutes: true,
        surpriseWindowOpen: true,
        publicRankingMode: true,
        publicRankingPublishedAt: true,
        resultsStatus: true,
        resultsHomologatedAt: true,
        olimpoLastSyncAt: true,
        olimpoLastSyncAttemptAt: true,
        olimpoLastSyncStatus: true,
        olimpoLastSyncMessage: true,
        olimpoAutoSyncEnabled: true,
        olimpoSyncIntervalSeconds: true,
        logoUrl: true,
        rulesUpdateNotice: true,
        autoBackupEnabled: true,
        backupIntervalMinutes: true,
        createdAt: true,
        updatedAt: true,
        arenas: { orderBy: { order: "asc" } },
        categories: { orderBy: { order: "asc" } },
        referees: true,
      },
    });
    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
    }
    return event;
  }),

  /**
   * Bootstrap: create the very first event without authentication.
   * Only allowed when the events table is completely empty.
   * Creates the event as active and logs the admin in automatically.
   */
  bootstrap: publicProcedure.input(bootstrapEventSchema).mutation(async ({ ctx, input }) => {
    const count = await ctx.prisma.event.count();
    if (count > 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Setup already completed. Use the admin dashboard to create additional events.",
      });
    }

    const payload = {
      ...input,
      startDate: new Date().toISOString(),
    };

    // First event is created as active
    const event = await createEventWithDefaults(ctx.prisma, payload, true);

    // Automatically log the caller in as admin
    ctx.session.user = { role: "ADMIN" as const, eventId: event.id };
    await ctx.session.save();

    return { event, role: "ADMIN" as const };
  }),

  create: adminProcedure.input(createEventSchema).mutation(async ({ ctx, input }) => {
    const event = await createEventWithDefaults(ctx.prisma, input, false);
    return event;
  }),

  update: adminProcedure.input(updateEventSchema).mutation(async ({ ctx, input }) => {
    const { id, ...data } = input;
    if (id !== ctx.user.eventId) throw new TRPCError({ code: "FORBIDDEN" });
    const before = await ctx.prisma.event.findUniqueOrThrow({ where: { id } });
    const updated = await ctx.prisma.event.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });
    await ctx.prisma.auditLog.create({
      data: {
        eventId: id,
        action:
          data.surpriseWindowOpen === undefined
            ? "EVENT_UPDATED"
            : data.surpriseWindowOpen
              ? "SURPRISE_WINDOW_OPENED"
              : "SURPRISE_WINDOW_CLOSED",
        entityType: "Event",
        entityId: id,
        actorRole: ctx.user.role,
        before: JSON.stringify({
          name: before.name,
          description: before.description,
          location: before.location,
          startDate: before.startDate,
          endDate: before.endDate,
          surpriseChallenge: before.surpriseChallenge,
          surpriseLeadMinutes: before.surpriseLeadMinutes,
          surpriseWindowOpen: before.surpriseWindowOpen,
        }),
        after: JSON.stringify(data),
      },
    });
    return updated;
  }),

  setActive: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    await ctx.prisma.event.updateMany({ data: { isActive: false } });
    return ctx.prisma.event.update({
      where: { id: input },
      data: { isActive: true },
    });
  }),

  delete: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    await ctx.prisma.event.delete({ where: { id: input } });
    return { success: true };
  }),
});
