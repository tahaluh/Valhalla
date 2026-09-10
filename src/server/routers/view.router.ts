import { z } from "zod";
import { router, adminProcedure, publicProcedure } from "@/server/trpc/trpc";

const viewInput = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  type: z.enum(["RANKING", "SCHEDULE", "ANNOUNCEMENT", "CALLS", "STATIONS", "IMAGE"]),
  durationSeconds: z.number().int().min(5).max(300),
  order: z.number().int().min(0),
  enabled: z.boolean(),
  screenId: z.string().nullable().optional(),
  config: z.string().max(10000).default("{}"),
});

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || "tela"
  );
}

export const viewRouter = router({
  listScreens: adminProcedure.input(z.string()).query(({ ctx, input: eventId }) => {
    if (eventId !== ctx.user.eventId) throw new Error("Evento fora da sessão atual.");
    return ctx.prisma.displayScreen.findMany({
      where: { eventId },
      include: { _count: { select: { views: true } } },
      orderBy: { createdAt: "asc" },
    });
  }),
  listPublicScreens: publicProcedure.input(z.string()).query(({ ctx, input: eventId }) =>
    ctx.prisma.displayScreen.findMany({
      where: { eventId, enabled: true },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    }),
  ),
  createScreen: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        name: z.string().trim().min(2).max(100),
        slug: z.string().trim().max(60).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.eventId !== ctx.user.eventId) throw new Error("Evento fora da sessão atual.");
      const base = slugify(input.slug || input.name);
      let slug = base;
      let suffix = 2;
      while (
        await ctx.prisma.displayScreen.findUnique({
          where: { eventId_slug: { eventId: input.eventId, slug } },
        })
      )
        slug = `${base}-${suffix++}`;
      const screen = await ctx.prisma.displayScreen.create({
        data: { eventId: input.eventId, name: input.name, slug },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "DISPLAY_SCREEN_CREATED",
          entityType: "DisplayScreen",
          entityId: screen.id,
          actorRole: ctx.user.role,
          after: JSON.stringify(screen),
        },
      });
      return screen;
    }),
  updateScreen: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(2).max(100).optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.prisma.displayScreen.findUnique({ where: { id: input.id } });
      if (!before || before.eventId !== ctx.user.eventId)
        throw new Error("Tela fora do evento atual.");
      const updated = await ctx.prisma.displayScreen.update({
        where: { id: input.id },
        data: { name: input.name, enabled: input.enabled },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: before.eventId,
          action: "DISPLAY_SCREEN_UPDATED",
          entityType: "DisplayScreen",
          entityId: before.id,
          actorRole: ctx.user.role,
          before: JSON.stringify(before),
          after: JSON.stringify(updated),
        },
      });
      return updated;
    }),
  removeScreen: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const screen = await ctx.prisma.displayScreen.findUnique({
      where: { id: input },
      include: { _count: { select: { views: true } } },
    });
    if (!screen || screen.eventId !== ctx.user.eventId)
      throw new Error("Tela fora do evento atual.");
    if (screen._count.views)
      throw new Error("Mova ou remova as views desta tela antes de excluí-la.");
    await ctx.prisma.displayScreen.delete({ where: { id: input } });
    await ctx.prisma.auditLog.create({
      data: {
        eventId: screen.eventId,
        action: "DISPLAY_SCREEN_REMOVED",
        entityType: "DisplayScreen",
        entityId: input,
        actorRole: ctx.user.role,
        before: JSON.stringify(screen),
      },
    });
    return { success: true };
  }),
  list: adminProcedure
    .input(z.string())
    .query(({ ctx, input: eventId }) =>
      ctx.prisma.displayView.findMany({ where: { eventId }, orderBy: { order: "asc" } }),
    ),
  listPublic: publicProcedure
    .input(
      z.union([z.string(), z.object({ eventId: z.string(), screenSlug: z.string().optional() })]),
    )
    .query(async ({ ctx, input }) => {
      const eventId = typeof input === "string" ? input : input.eventId;
      const screenSlug = typeof input === "string" ? undefined : input.screenSlug;
      const screen = await ctx.prisma.displayScreen.findFirst({
        where: { eventId, enabled: true, ...(screenSlug ? { slug: screenSlug } : {}) },
        orderBy: { createdAt: "asc" },
      });
      return ctx.prisma.displayView.findMany({
        where: {
          eventId,
          enabled: true,
          ...(screen ? { screenId: screen.id } : screenSlug ? { id: "__none__" } : {}),
        },
        orderBy: { order: "asc" },
      });
    }),
  latestCall: publicProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    const recentLimit = new Date(Date.now() - 8_000);
    const log = await ctx.prisma.auditLog.findFirst({
      where: { eventId, action: "SESSION_CALLED", createdAt: { gte: recentLimit } },
      orderBy: { createdAt: "desc" },
    });
    if (!log) return null;

    const session = await ctx.prisma.evaluationSession.findUnique({
      where: { id: log.entityId },
      include: { slot: { include: { team: true, station: true, phase: true } } },
    });
    if (!session || session.slot.eventId !== eventId) return null;

    return {
      id: log.id,
      createdAt: log.createdAt,
      callCount: session.callCount,
      teamName: session.slot.team.name,
      institution: session.slot.team.institution,
      stationName: session.slot.station.name,
      phaseName: session.slot.phase.name,
    };
  }),
  activeCalls: publicProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    const logs = await ctx.prisma.auditLog.findMany({
      where: {
        eventId,
        action: "SESSION_CALLED",
        createdAt: { gte: new Date(Date.now() - 10_000) },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    });
    const sessions = await ctx.prisma.evaluationSession.findMany({
      where: { id: { in: logs.map((log) => log.entityId) } },
      include: { slot: { include: { team: true, station: true, phase: true } } },
    });
    const byId = new Map(sessions.map((session) => [session.id, session]));
    return logs.flatMap((log) => {
      const session = byId.get(log.entityId);
      if (!session) return [];
      let callCount = session.callCount;
      try {
        const after = log.after ? (JSON.parse(log.after) as { callCount?: number }) : null;
        callCount = after?.callCount ?? callCount;
      } catch {}
      return [
        {
          id: log.id,
          createdAt: log.createdAt,
          callCount,
          teamName: session.slot.team.name,
          institution: session.slot.team.institution,
          stationName: session.slot.station.name,
          phaseName: session.slot.phase.name,
        },
      ];
    });
  }),
  recentCalls: publicProcedure
    .input(z.object({ eventId: z.string(), limit: z.number().int().min(1).max(50).default(12) }))
    .query(async ({ ctx, input }) => {
      const logs = await ctx.prisma.auditLog.findMany({
        where: { eventId: input.eventId, action: "SESSION_CALLED" },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
      const sessions = await ctx.prisma.evaluationSession.findMany({
        where: { id: { in: logs.map((log) => log.entityId) } },
        include: { slot: { include: { team: true, station: true, phase: true } } },
      });
      const byId = new Map(sessions.map((session) => [session.id, session]));
      return logs.flatMap((log) => {
        const session = byId.get(log.entityId);
        if (!session) return [];
        let callCount = session.callCount;
        try {
          const after = log.after ? (JSON.parse(log.after) as { callCount?: number }) : null;
          callCount = after?.callCount ?? callCount;
        } catch {}
        return [
          {
            id: log.id,
            createdAt: log.createdAt,
            callCount,
            teamName: session.slot.team.name,
            institution: session.slot.team.institution,
            stationName: session.slot.station.name,
            phaseName: session.slot.phase.name,
          },
        ];
      });
    }),
  stationBoard: publicProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    const stations = await ctx.prisma.evaluationStation.findMany({
      where: { eventId },
      include: {
        slots: {
          where: { status: { notIn: ["CANCELLED", "RESCHEDULED"] } },
          include: { team: true, phase: true, session: true },
          orderBy: [{ scheduledAt: "asc" }, { order: "asc" }],
        },
      },
      orderBy: { order: "asc" },
    });
    const terminalStates = ["CALLED", "CALIBRATING", "IN_PROGRESS", "PAUSED", "REVIEW"];
    const doneStates = ["FINALIZED", "ABSENT", "CANCELLED", "RESCHEDULED"];
    const now = Date.now();
    return stations.map((station) => {
      const current = station.slots.find((slot) =>
        terminalStates.includes(slot.session?.state ?? slot.status),
      );
      const next = station.slots.find(
        (slot) =>
          slot.id !== current?.id && !doneStates.includes(slot.session?.state ?? slot.status),
      );
      const expected = current ?? next;
      const delayMinutes = expected
        ? Math.max(0, Math.floor((now - expected.scheduledAt.getTime()) / 60000))
        : 0;
      return {
        id: station.id,
        name: station.name,
        type: station.type,
        state: current?.session?.state ?? (next ? "WAITING" : "FINISHED"),
        currentTeam: current?.team.name ?? null,
        currentPhase: current?.phase.name ?? null,
        nextTeam: next?.team.name ?? null,
        nextAt: next?.scheduledAt ?? null,
        delayMinutes,
      };
    });
  }),
  create: adminProcedure.input(viewInput).mutation(async ({ ctx, input }) => {
    if (input.eventId !== ctx.user.eventId) throw new Error("Evento fora da sessão atual.");
    const created = await ctx.prisma.displayView.create({ data: input });
    await ctx.prisma.auditLog.create({
      data: {
        eventId: input.eventId,
        action: "DISPLAY_VIEW_CREATED",
        entityType: "DisplayView",
        entityId: created.id,
        actorRole: ctx.user.role,
        after: JSON.stringify(created),
      },
    });
    return created;
  }),
  update: adminProcedure
    .input(
      viewInput
        .extend({ id: z.string().min(1) })
        .partial()
        .required({ id: true }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const view = await ctx.prisma.displayView.findUnique({ where: { id } });
      if (!view || view.eventId !== ctx.user.eventId) throw new Error("View fora do evento atual.");
      const updated = await ctx.prisma.displayView.update({ where: { id }, data });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: view.eventId,
          action: "DISPLAY_VIEW_UPDATED",
          entityType: "DisplayView",
          entityId: id,
          actorRole: ctx.user.role,
          before: JSON.stringify(view),
          after: JSON.stringify(updated),
        },
      });
      return updated;
    }),
  remove: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const view = await ctx.prisma.displayView.findUnique({ where: { id: input } });
    if (!view || view.eventId !== ctx.user.eventId) throw new Error("View fora do evento atual.");
    await ctx.prisma.displayView.delete({ where: { id: input } });
    await ctx.prisma.auditLog.create({
      data: {
        eventId: view.eventId,
        action: "DISPLAY_VIEW_REMOVED",
        entityType: "DisplayView",
        entityId: input,
        actorRole: ctx.user.role,
        before: JSON.stringify(view),
      },
    });
    return { success: true };
  }),
});
