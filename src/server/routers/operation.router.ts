import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, refereeProcedure, publicProcedure } from "@/server/trpc/trpc";
import type { Context } from "@/server/trpc/context";
import type { SessionUser } from "@/domain/entities/user";
import { AuthService } from "@/application/services/auth.service";
import { canStartPhase, hasVersionConflict } from "@/domain/entities/operation";
import { generateAdvancedSchedule } from "@/domain/entities/scheduler";

const stationSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["PRACTICE_ARENA", "INTERVIEW_TABLE", "STAGE", "CHALLENGE_TABLE"]),
  order: z.number().int().min(0).default(0),
  arenaId: z.string().optional(),
});
const phaseSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(1),
  type: z.enum(["PRACTICE_ROUND", "INTERVIEW", "PERFORMANCE", "EXTRA_ROUND"]),
  sequence: z.number().int().min(1),
  durationSeconds: z.number().int().min(1),
  calibrationSeconds: z.number().int().min(0).default(0),
});

function assertSessionEvent(user: SessionUser, eventId: string) {
  if (user.eventId !== eventId)
    throw new TRPCError({ code: "FORBIDDEN", message: "Evento fora da sessão atual." });
}

async function audit(
  ctx: Context & { user?: SessionUser },
  data: {
    eventId: string;
    action: string;
    entityType: string;
    entityId: string;
    stationId?: string;
    teamId?: string;
    terminalId?: string;
    operatorName?: string;
    authorizedByName?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
) {
  await ctx.prisma.auditLog.create({
    data: {
      ...data,
      actorRole: ctx.user?.role,
      before: data.before === undefined ? undefined : JSON.stringify(data.before),
      after: data.after === undefined ? undefined : JSON.stringify(data.after),
    },
  });
}

function parseChallengeBanks(value: string): { LEVEL1: string[]; LEVEL2: string[] } {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed))
      return {
        LEVEL1: parsed.filter((item): item is string => typeof item === "string"),
        LEVEL2: parsed.filter((item): item is string => typeof item === "string"),
      };
    if (parsed && typeof parsed === "object") {
      const object = parsed as Record<string, unknown>;
      return {
        LEVEL1: Array.isArray(object.LEVEL1)
          ? object.LEVEL1.filter((item): item is string => typeof item === "string")
          : [],
        LEVEL2: Array.isArray(object.LEVEL2)
          ? object.LEVEL2.filter((item): item is string => typeof item === "string")
          : [],
      };
    }
  } catch {}
  return { LEVEL1: [], LEVEL2: [] };
}

export const operationRouter = router({
  listReferees: publicProcedure
    .input(z.string())
    .query(({ ctx, input: eventId }) =>
      ctx.prisma.referee.findMany({ where: { eventId }, orderBy: { name: "asc" } }),
    ),
  createReferee: adminProcedure
    .input(z.object({ eventId: z.string(), name: z.string().trim().min(2).max(120) }))
    .mutation(({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      return ctx.prisma.referee.create({ data: input });
    }),
  addRefereeWithApproval: refereeProcedure
    .input(
      z.object({
        eventId: z.string(),
        name: z.string().trim().min(2).max(120),
        adminAuthorizerName: z.string().trim().min(2).max(120),
        adminPassword: z.string().min(4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      const event = await ctx.prisma.event.findUnique({ where: { id: input.eventId } });
      if (!event || !(await AuthService.verifyPassword(input.adminPassword, event.adminPassword)))
        throw new Error("Senha administrativa inválida.");
      const referee = await ctx.prisma.referee.create({
        data: { eventId: input.eventId, name: input.name },
      });
      await audit(ctx, {
        eventId: input.eventId,
        action: "REFEREE_ADDED_WITH_ADMIN_APPROVAL",
        entityType: "Referee",
        entityId: referee.id,
        operatorName: input.name,
        authorizedByName: input.adminAuthorizerName,
        after: referee,
      });
      return referee;
    }),
  removeReferee: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const before = await ctx.prisma.referee.findUniqueOrThrow({ where: { id: input } });
    assertSessionEvent(ctx.user, before.eventId);
    await ctx.prisma.referee.delete({ where: { id: input } });
    await audit(ctx, {
      eventId: before.eventId,
      action: "REFEREE_REMOVED",
      entityType: "Referee",
      entityId: input,
      before,
    });
    return { success: true };
  }),
  publicSchedule: publicProcedure
    .input(z.object({ eventId: z.string(), limit: z.number().int().min(1).max(100).default(12) }))
    .query(({ ctx, input }) =>
      ctx.prisma.scheduleSlot.findMany({
        where: {
          eventId: input.eventId,
          status: { notIn: ["FINALIZED", "ABSENT", "RESCHEDULED", "CANCELLED"] },
        },
        include: {
          team: { select: { name: true, institution: true } },
          station: { select: { name: true } },
          phase: { select: { name: true } },
        },
        orderBy: { scheduledAt: "asc" },
        take: input.limit,
      }),
    ),
  listStations: publicProcedure.input(z.string()).query(({ ctx, input: eventId }) =>
    ctx.prisma.evaluationStation.findMany({
      where: { eventId },
      include: { arena: true },
      orderBy: { order: "asc" },
    }),
  ),
  listTerminals: adminProcedure.input(z.string()).query(({ ctx, input: eventId }) =>
    ctx.prisma.terminal.findMany({
      where: { eventId },
      orderBy: { name: "asc" },
    }),
  ),
  createStation: adminProcedure.input(stationSchema).mutation(async ({ ctx, input }) => {
    assertSessionEvent(ctx.user, input.eventId);
    const station = await ctx.prisma.evaluationStation.create({ data: input });
    await audit(ctx, {
      eventId: input.eventId,
      action: "STATION_CREATED",
      entityType: "EvaluationStation",
      entityId: station.id,
      after: station,
    });
    return station;
  }),
  updateStation: adminProcedure
    .input(stationSchema.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const before = await ctx.prisma.evaluationStation.findUniqueOrThrow({ where: { id } });
      assertSessionEvent(ctx.user, before.eventId);
      const updated = await ctx.prisma.evaluationStation.update({ where: { id }, data });
      await audit(ctx, {
        eventId: before.eventId,
        action: "STATION_UPDATED",
        entityType: "EvaluationStation",
        entityId: id,
        before,
        after: updated,
      });
      return updated;
    }),
  removeStation: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const before = await ctx.prisma.evaluationStation.findUniqueOrThrow({ where: { id: input } });
    assertSessionEvent(ctx.user, before.eventId);
    await ctx.prisma.evaluationStation.delete({ where: { id: input } });
    await audit(ctx, {
      eventId: before.eventId,
      action: "STATION_REMOVED",
      entityType: "EvaluationStation",
      entityId: input,
      before,
    });
    return { success: true };
  }),
  listPhases: publicProcedure
    .input(z.string())
    .query(({ ctx, input: eventId }) =>
      ctx.prisma.phase.findMany({ where: { eventId }, orderBy: { sequence: "asc" } }),
    ),
  createPhase: adminProcedure.input(phaseSchema).mutation(async ({ ctx, input }) => {
    assertSessionEvent(ctx.user, input.eventId);
    const phase = await ctx.prisma.phase.create({ data: input });
    await audit(ctx, {
      eventId: input.eventId,
      action: "PHASE_CREATED",
      entityType: "Phase",
      entityId: phase.id,
      after: phase,
    });
    return phase;
  }),
  setPhaseStatus: adminProcedure
    .input(
      z.object({
        phaseId: z.string(),
        status: z.enum(["CLOSED", "OPEN", "SUSPENDED"]),
        reason: z.string().trim().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const phase = await ctx.prisma.phase.findUnique({ where: { id: input.phaseId } });
      if (!phase) throw new Error("Turno/rodada não encontrado.");
      assertSessionEvent(ctx.user, phase.eventId);
      const updated = await ctx.prisma.phase.update({
        where: { id: phase.id },
        data: {
          operationalStatus: input.status,
          openedAt: input.status === "OPEN" ? new Date() : phase.openedAt,
          closedAt: input.status === "CLOSED" ? new Date() : null,
        },
      });
      await audit(ctx, {
        eventId: phase.eventId,
        action: `PHASE_${input.status}`,
        entityType: "Phase",
        entityId: phase.id,
        before: phase,
        after: updated,
        reason: input.reason,
      });
      return updated;
    }),
  createDefaultPhases: adminProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: eventId }) => {
      assertSessionEvent(ctx.user, eventId);
      const count = await ctx.prisma.phase.count({ where: { eventId } });
      if (count > 0) throw new Error("O evento já possui fases configuradas.");
      await ctx.prisma.phase.createMany({
        data: [
          {
            eventId,
            name: "Prática · Rodada 1",
            type: "PRACTICE_ROUND",
            sequence: 1,
            durationSeconds: 300,
            calibrationSeconds: 120,
          },
          {
            eventId,
            name: "Prática · Rodada 2",
            type: "PRACTICE_ROUND",
            sequence: 2,
            durationSeconds: 300,
            calibrationSeconds: 120,
          },
          {
            eventId,
            name: "Prática · Rodada 3",
            type: "PRACTICE_ROUND",
            sequence: 3,
            durationSeconds: 300,
            calibrationSeconds: 120,
          },
          {
            eventId,
            name: "Artística · Entrevista",
            type: "INTERVIEW",
            sequence: 4,
            durationSeconds: 600,
            calibrationSeconds: 0,
          },
          {
            eventId,
            name: "Artística · Apresentação 1",
            type: "PERFORMANCE",
            sequence: 5,
            durationSeconds: 420,
            calibrationSeconds: 0,
          },
          {
            eventId,
            name: "Artística · Apresentação 2",
            type: "PERFORMANCE",
            sequence: 6,
            durationSeconds: 420,
            calibrationSeconds: 0,
          },
        ],
      });
      return { created: 6 };
    }),
  removePhase: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const before = await ctx.prisma.phase.findUniqueOrThrow({ where: { id: input } });
    assertSessionEvent(ctx.user, before.eventId);
    await ctx.prisma.phase.delete({ where: { id: input } });
    await audit(ctx, {
      eventId: before.eventId,
      action: "PHASE_REMOVED",
      entityType: "Phase",
      entityId: input,
      before,
    });
    return { success: true };
  }),
  listSchedule: adminProcedure.input(z.string()).query(({ ctx, input: eventId }) =>
    ctx.prisma.scheduleSlot.findMany({
      where: { eventId },
      include: { team: true, phase: true, station: true, session: true },
      orderBy: [{ scheduledAt: "asc" }, { order: "asc" }],
    }),
  ),
  listBlackouts: adminProcedure.input(z.string()).query(({ ctx, input: eventId }) => {
    assertSessionEvent(ctx.user, eventId);
    return ctx.prisma.scheduleBlackout.findMany({
      where: { eventId },
      orderBy: { startsAt: "asc" },
    });
  }),
  createBlackout: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        name: z.string().trim().min(2),
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      if (new Date(input.endsAt) <= new Date(input.startsAt))
        throw new Error("O fim deve ser posterior ao início.");
      const blackout = await ctx.prisma.scheduleBlackout.create({
        data: {
          eventId: input.eventId,
          name: input.name,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
        },
      });
      await audit(ctx, {
        eventId: input.eventId,
        action: "SCHEDULE_BLACKOUT_CREATED",
        entityType: "ScheduleBlackout",
        entityId: blackout.id,
        after: blackout,
      });
      return blackout;
    }),
  removeBlackout: adminProcedure.input(z.string()).mutation(async ({ ctx, input }) => {
    const blackout = await ctx.prisma.scheduleBlackout.findUniqueOrThrow({ where: { id: input } });
    assertSessionEvent(ctx.user, blackout.eventId);
    await ctx.prisma.scheduleBlackout.delete({ where: { id: input } });
    await audit(ctx, {
      eventId: blackout.eventId,
      action: "SCHEDULE_BLACKOUT_REMOVED",
      entityType: "ScheduleBlackout",
      entityId: input,
      before: blackout,
    });
    return { success: true };
  }),
  generateAdvancedQueue: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        categoryId: z.string(),
        phaseStarts: z
          .array(z.object({ phaseId: z.string(), startsAt: z.string().datetime() }))
          .length(3),
        stationIds: z.array(z.string()).min(3),
        intervalSeconds: z.number().int().min(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      const [category, phases, stations, teams, blackouts] = await Promise.all([
        ctx.prisma.category.findUnique({ where: { id: input.categoryId } }),
        ctx.prisma.phase.findMany({
          where: {
            id: { in: input.phaseStarts.map((item) => item.phaseId) },
            eventId: input.eventId,
            type: "PRACTICE_ROUND",
          },
        }),
        ctx.prisma.evaluationStation.findMany({
          where: { id: { in: input.stationIds }, eventId: input.eventId },
          include: { arena: true },
        }),
        ctx.prisma.team.findMany({
          where: { categoryId: input.categoryId, attendanceConfirmed: true },
          orderBy: { name: "asc" },
        }),
        ctx.prisma.scheduleBlackout.findMany({ where: { eventId: input.eventId } }),
      ]);
      if (!category || category.eventId !== input.eventId || category.type !== "RESCUE")
        throw new Error("Categoria prática inválida.");
      if (phases.length !== 3 || stations.length !== input.stationIds.length)
        throw new Error("Rodadas ou arenas inválidas.");
      const byPhase = new Map(phases.map((phase) => [phase.id, phase]));
      const generated = generateAdvancedSchedule({
        teams,
        phases: input.phaseStarts.map((item) => ({
          id: item.phaseId,
          name: byPhase.get(item.phaseId)!.name,
          startsAt: new Date(item.startsAt),
        })),
        stations: stations.map((station) => ({
          id: station.id,
          name: station.name,
          difficulty: (station.arena?.difficulty ?? "MEDIUM") as "EASY" | "MEDIUM" | "HARD",
        })),
        intervalSeconds: input.intervalSeconds,
        blackouts,
      });
      if (generated.conflicts.length) return { created: 0, conflicts: generated.conflicts };
      const existing = await ctx.prisma.scheduleSlot.count({
        where: {
          team: { categoryId: input.categoryId },
          phaseId: { in: input.phaseStarts.map((item) => item.phaseId) },
        },
      });
      if (existing)
        throw new Error("Já existem horários desta categoria nas rodadas selecionadas.");
      await ctx.prisma.scheduleSlot.createMany({
        data: generated.slots.map((slot) => ({
          teamId: slot.teamId,
          phaseId: slot.phaseId,
          stationId: slot.stationId,
          scheduledAt: slot.scheduledAt,
          order: slot.order,
          eventId: input.eventId,
        })),
      });
      await audit(ctx, {
        eventId: input.eventId,
        action: "ADVANCED_QUEUE_GENERATED",
        entityType: "Category",
        entityId: input.categoryId,
        after: {
          slots: generated.slots.length,
          levels: ["EASY", "MEDIUM", "HARD"],
          blackouts: blackouts.length,
        },
      });
      return { created: generated.slots.length, conflicts: [] as string[] };
    }),
  exportSchedule: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        phaseId: z.string().optional(),
        format: z.enum(["CSV", "MARKDOWN"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      const slots = await ctx.prisma.scheduleSlot.findMany({
        where: { eventId: input.eventId, ...(input.phaseId ? { phaseId: input.phaseId } : {}) },
        include: { team: true, phase: true, station: { include: { arena: true } } },
        orderBy: [
          { phase: { sequence: "asc" } },
          { scheduledAt: "asc" },
          { station: { order: "asc" } },
        ],
      });
      const rows = [
        ["Rodada", "Horário", "Arena", "Nível", "Equipe", "Instituição"],
        ...slots.map((slot) => [
          slot.phase.name,
          slot.scheduledAt.toLocaleString("pt-BR"),
          slot.station.name,
          slot.station.arena?.difficulty ?? "-",
          slot.team.name,
          slot.team.institution,
        ]),
      ];
      if (input.format === "CSV")
        return `\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n")}`;
      const widths = rows[0]!.map((_, index) =>
        Math.max(...rows.map((row) => String(row[index] ?? "").length)),
      );
      const line = (row: string[]) =>
        `| ${row.map((cell, index) => String(cell).padEnd(widths[index]!)).join(" | ")} |`;
      return [
        line(rows[0]!),
        `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
        ...rows.slice(1).map(line),
      ].join("\n");
    }),
  moveSlot: adminProcedure
    .input(
      z.object({
        id: z.string(),
        stationId: z.string().optional(),
        scheduledAt: z.string().datetime().optional(),
        order: z.number().int().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, scheduledAt, ...data } = input;
      const before = await ctx.prisma.scheduleSlot.findUniqueOrThrow({ where: { id } });
      assertSessionEvent(ctx.user, before.eventId);
      const updated = await ctx.prisma.scheduleSlot.update({
        where: { id },
        data: { ...data, scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined },
      });
      await audit(ctx, {
        eventId: before.eventId,
        action: "SCHEDULE_SLOT_MOVED",
        entityType: "ScheduleSlot",
        entityId: id,
        stationId: updated.stationId,
        teamId: updated.teamId,
        before,
        after: updated,
      });
      return updated;
    }),
  swapSlots: adminProcedure
    .input(z.object({ firstId: z.string(), secondId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [first, second] = await Promise.all([
        ctx.prisma.scheduleSlot.findUnique({ where: { id: input.firstId } }),
        ctx.prisma.scheduleSlot.findUnique({ where: { id: input.secondId } }),
      ]);
      if (!first || !second) throw new Error("Horário não encontrado.");
      await ctx.prisma.$transaction([
        ctx.prisma.scheduleSlot.update({
          where: { id: first.id },
          data: {
            scheduledAt: second.scheduledAt,
            stationId: second.stationId,
            order: second.order,
          },
        }),
        ctx.prisma.scheduleSlot.update({
          where: { id: second.id },
          data: { scheduledAt: first.scheduledAt, stationId: first.stationId, order: first.order },
        }),
      ]);
      await audit(ctx, {
        eventId: first.eventId,
        action: "SCHEDULE_SLOTS_SWAPPED",
        entityType: "ScheduleSlot",
        entityId: first.id,
        stationId: second.stationId,
        teamId: first.teamId,
        before: { first, second },
        after: { firstStationId: second.stationId, secondStationId: first.stationId },
      });
      return { success: true };
    }),
  clearPhaseQueue: adminProcedure.input(z.string()).mutation(async ({ ctx, input: phaseId }) => {
    const phase = await ctx.prisma.phase.findUnique({ where: { id: phaseId } });
    if (!phase) throw new Error("Fase não encontrada.");
    assertSessionEvent(ctx.user, phase.eventId);
    const result = await ctx.prisma.scheduleSlot.deleteMany({ where: { phaseId } });
    await audit(ctx, {
      eventId: phase.eventId,
      action: "QUEUE_CLEARED",
      entityType: "Phase",
      entityId: phaseId,
      before: { slots: result.count },
    });
    return result;
  }),
  generateQueue: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        phaseId: z.string(),
        stationIds: z.array(z.string()).min(1),
        categoryId: z.string(),
        startsAt: z.string().datetime(),
        intervalSeconds: z.number().int().min(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      const [phase, category, selectedStations] = await Promise.all([
        ctx.prisma.phase.findUnique({ where: { id: input.phaseId } }),
        ctx.prisma.category.findUnique({ where: { id: input.categoryId } }),
        ctx.prisma.evaluationStation.findMany({ where: { id: { in: input.stationIds } } }),
      ]);
      if (!phase || !category || selectedStations.length !== input.stationIds.length)
        throw new Error("Fase, categoria ou posto inválido.");
      const expectsRescue = phase.type === "PRACTICE_ROUND" || phase.type === "EXTRA_ROUND";
      if (
        (expectsRescue && category.type !== "RESCUE") ||
        (!expectsRescue && category.type !== "ARTISTIC")
      )
        throw new Error("A modalidade da categoria não corresponde à fase escolhida.");
      const permittedTypes =
        phase.type === "PRACTICE_ROUND" || phase.type === "EXTRA_ROUND"
          ? ["PRACTICE_ARENA", "CHALLENGE_TABLE"]
          : phase.type === "INTERVIEW"
            ? ["INTERVIEW_TABLE"]
            : ["STAGE"];
      if (selectedStations.some((station) => !permittedTypes.includes(station.type)))
        throw new Error("Há mesas incompatíveis com a fase selecionada.");
      const teams = await ctx.prisma.team.findMany({
        where: { categoryId: input.categoryId, attendanceConfirmed: true },
        orderBy: { name: "asc" },
      });
      const existing = await ctx.prisma.scheduleSlot.count({
        where: { phaseId: input.phaseId, team: { categoryId: input.categoryId } },
      });
      if (existing > 0)
        throw new Error(
          "Esta fase e categoria já possuem uma fila. Ajuste-a ou remova-a antes de gerar outra.",
        );
      const orderOffset = await ctx.prisma.scheduleSlot.count({
        where: { phaseId: input.phaseId },
      });
      const start = new Date(input.startsAt).getTime();
      const slots = teams.map((team, index) => ({
        eventId: input.eventId,
        phaseId: input.phaseId,
        stationId: input.stationIds[index % input.stationIds.length]!,
        teamId: team.id,
        scheduledAt: new Date(
          start + Math.floor(index / input.stationIds.length) * input.intervalSeconds * 1000,
        ),
        order: orderOffset + index,
      }));
      if (slots.length > 0) await ctx.prisma.scheduleSlot.createMany({ data: slots });
      await audit(ctx, {
        eventId: input.eventId,
        action: "QUEUE_GENERATED",
        entityType: "Phase",
        entityId: input.phaseId,
        after: { teams: slots.length, stationIds: input.stationIds },
      });
      return { created: slots.length };
    }),
  setSurpriseAssignment: adminProcedure
    .input(
      z.object({
        slotId: z.string(),
        eligible: z.boolean(),
        challengeText: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true },
      });
      if (!slot) throw new Error("Horário não encontrado.");
      assertSessionEvent(ctx.user, slot.eventId);
      const data = {
        surpriseEligible: input.eligible,
        surpriseChallengeText: input.challengeText || null,
        surpriseDrawnAt: new Date(),
        surpriseStatus: input.eligible ? "DRAWN" : "MISSED",
      };
      let session;
      if (slot.session) {
        const claimed = await ctx.prisma.evaluationSession.updateMany({
          where: { id: slot.session.id, surpriseDrawnAt: null },
          data: { ...data, version: { increment: 1 } },
        });
        if (!claimed.count)
          throw new Error("Outro tablet acabou de registrar o sorteio desta equipe.");
        session = await ctx.prisma.evaluationSession.findUniqueOrThrow({
          where: { id: slot.session.id },
        });
      } else {
        try {
          session = await ctx.prisma.evaluationSession.create({
            data: { slotId: slot.id, ...data },
          });
        } catch {
          throw new Error("Outro tablet acabou de registrar o sorteio desta equipe.");
        }
      }
      await audit(ctx, {
        eventId: slot.eventId,
        action: "SURPRISE_CHALLENGE_ASSIGNED",
        entityType: "EvaluationSession",
        entityId: session.id,
        stationId: slot.stationId,
        teamId: slot.teamId,
        before: slot.session,
        after: session,
        reason: input.eligible ? "Sorteio registrado" : "Equipe inelegível/ausente no sorteio",
      });
      return session;
    }),
  setSurpriseChallengeBank: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        level1: z.array(z.string().trim().min(3).max(1000)).max(100),
        level2: z.array(z.string().trim().min(3).max(1000)).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      const event = await ctx.prisma.event.findUnique({ where: { id: input.eventId } });
      if (!event) throw new Error("Evento não encontrado.");
      const challenges = {
        LEVEL1: [...new Set(input.level1.map((item) => item.trim()))],
        LEVEL2: [...new Set(input.level2.map((item) => item.trim()))],
      };
      const updated = await ctx.prisma.event.update({
        where: { id: input.eventId },
        data: { surpriseChallengeBank: JSON.stringify(challenges) },
      });
      await audit(ctx, {
        eventId: input.eventId,
        action: "SURPRISE_CHALLENGE_BANK_UPDATED",
        entityType: "Event",
        entityId: input.eventId,
        before: { surpriseChallengeBank: event.surpriseChallengeBank },
        after: { surpriseChallengeBank: updated.surpriseChallengeBank },
      });
      return challenges;
    }),
  getSurpriseChallengeBank: adminProcedure
    .input(z.string())
    .query(async ({ ctx, input: eventId }) => {
      assertSessionEvent(ctx.user, eventId);
      const event = await ctx.prisma.event.findUnique({
        where: { id: eventId },
        select: { surpriseChallengeBank: true },
      });
      if (!event) throw new Error("Evento não encontrado.");
      return parseChallengeBanks(event.surpriseChallengeBank);
    }),
  surpriseQueue: refereeProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    assertSessionEvent(ctx.user, eventId);
    const practicePhases = await ctx.prisma.phase.findMany({
      where: { eventId, type: "PRACTICE_ROUND" },
      orderBy: { sequence: "asc" },
      select: { id: true },
    });
    const eligiblePhaseIds = practicePhases.slice(1, 3).map((phase) => phase.id);
    if (!eligiblePhaseIds.length) return [];
    return ctx.prisma.scheduleSlot.findMany({
      where: { eventId, phaseId: { in: eligiblePhaseIds } },
      include: { team: true, phase: true, station: true, session: true },
      orderBy: [{ scheduledAt: "asc" }, { order: "asc" }],
    });
  }),
  drawSurpriseChallenge: refereeProcedure
    .input(
      z.object({
        slotId: z.string(),
        terminalId: z.string().optional(),
        operatorName: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true, event: true, phase: true },
      });
      if (!slot) throw new Error("Rodada não encontrada.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (!slot.event.surpriseChallenge) throw new Error("O desafio surpresa está desativado.");
      if (slot.session?.surpriseDrawnAt)
        throw new Error("Esta equipe já realizou o sorteio para esta rodada.");
      const practicePhases = await ctx.prisma.phase.findMany({
        where: { eventId: slot.eventId, type: "PRACTICE_ROUND" },
        orderBy: { sequence: "asc" },
        select: { id: true },
      });
      if (!practicePhases.slice(1, 3).some((phase) => phase.id === slot.phaseId))
        throw new Error("O desafio surpresa só está disponível na 2ª e 3ª rodadas.");
      const banks = parseChallengeBanks(slot.event.surpriseChallengeBank);
      const level = /nível\s*2|nivel\s*2|\bn2\b/i.test(
        (
          await ctx.prisma.team.findUniqueOrThrow({
            where: { id: slot.teamId },
            include: { category: true },
          })
        ).category.name,
      )
        ? "LEVEL2"
        : "LEVEL1";
      let bank = banks[level];
      bank = bank.filter((challenge) => typeof challenge === "string" && challenge.trim());
      if (!bank.length) throw new Error("Cadastre ao menos um desafio surpresa no painel admin.");
      const previous = await ctx.prisma.evaluationSession.findMany({
        where: {
          slot: { eventId: slot.eventId, teamId: slot.teamId },
          surpriseChallengeText: { not: null },
        },
        select: { surpriseChallengeText: true },
      });
      const unused = bank.filter(
        (challenge) => !previous.some((session) => session.surpriseChallengeText === challenge),
      );
      if (unused.length) bank = unused;
      const challenge = bank[Math.floor(Math.random() * bank.length)]!;
      const data = {
        surpriseEligible: true,
        surpriseChallengeText: challenge,
        surpriseDrawnAt: new Date(),
        surpriseStatus: "DRAWN",
        terminalId: input.terminalId,
        operatorName: input.operatorName,
      };
      let session;
      if (slot.session) {
        const claimed = await ctx.prisma.evaluationSession.updateMany({
          where: { id: slot.session.id, surpriseDrawnAt: null },
          data: { ...data, version: { increment: 1 } },
        });
        if (!claimed.count)
          throw new Error("Outro tablet acabou de registrar o sorteio desta equipe.");
        session = await ctx.prisma.evaluationSession.findUniqueOrThrow({
          where: { id: slot.session.id },
        });
      } else {
        try {
          session = await ctx.prisma.evaluationSession.create({
            data: { slotId: slot.id, ...data },
          });
        } catch {
          throw new Error("Outro tablet acabou de registrar o sorteio desta equipe.");
        }
      }
      await audit(ctx, {
        eventId: slot.eventId,
        action: "SURPRISE_CHALLENGE_DRAWN",
        entityType: "EvaluationSession",
        entityId: session.id,
        stationId: slot.stationId,
        teamId: slot.teamId,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
        before: slot.session,
        after: session,
        reason: `${slot.phase.name} · sorteio único`,
      });
      return session;
    }),
  setSurpriseDecision: refereeProcedure
    .input(
      z.object({
        slotId: z.string(),
        status: z.enum(["DECLINED", "MISSED"]),
        terminalId: z.string().optional(),
        operatorName: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true },
      });
      if (!slot) throw new Error("Rodada não encontrada.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (slot.session?.surpriseDrawnAt && input.status === "MISSED")
        throw new Error("Não é possível marcar ausência depois que o desafio foi sorteado.");
      if (
        slot.session?.surpriseStatus &&
        !["PENDING", "DRAWN"].includes(slot.session.surpriseStatus)
      )
        throw new Error("A situação do desafio desta equipe já foi encerrada.");
      const data = {
        surpriseEligible: false,
        surpriseDrawnAt: slot.session?.surpriseDrawnAt ?? new Date(),
        surpriseStatus: input.status,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
      };
      let session;
      if (slot.session) {
        const allowedStatuses = input.status === "DECLINED" ? ["PENDING", "DRAWN"] : ["PENDING"];
        const claimed = await ctx.prisma.evaluationSession.updateMany({
          where: { id: slot.session.id, surpriseStatus: { in: allowedStatuses } },
          data: { ...data, version: { increment: 1 } },
        });
        if (!claimed.count)
          throw new Error("Outro tablet acabou de alterar a situação desta equipe.");
        session = await ctx.prisma.evaluationSession.findUniqueOrThrow({
          where: { id: slot.session.id },
        });
      } else {
        try {
          session = await ctx.prisma.evaluationSession.create({
            data: { slotId: slot.id, ...data },
          });
        } catch {
          throw new Error("Outro tablet acabou de alterar a situação desta equipe.");
        }
      }
      await audit(ctx, {
        eventId: slot.eventId,
        action: `SURPRISE_CHALLENGE_${input.status}`,
        entityType: "EvaluationSession",
        entityId: session.id,
        stationId: slot.stationId,
        teamId: slot.teamId,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
        before: slot.session,
        after: session,
      });
      return session;
    }),
  stationQueue: refereeProcedure
    .input(z.object({ stationId: z.string() }))
    .query(({ ctx, input }) =>
      ctx.prisma.scheduleSlot.findMany({
        where: { stationId: input.stationId, eventId: ctx.user.eventId },
        include: { team: true, phase: true, session: true },
        orderBy: { scheduledAt: "asc" },
      }),
    ),
  saveScorecardDraft: refereeProcedure
    .input(
      z.object({
        slotId: z.string(),
        scorecard: z.string().max(50000),
        expectedVersion: z.number().int().positive().nullable().optional(),
        terminalId: z.string().optional(),
        operatorName: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true },
      });
      if (!slot) throw new Error("Horário não encontrado.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (slot.session?.state === "FINALIZED")
        return { saved: false as const, conflict: slot.session };
      if (hasVersionConflict(slot.session?.version, input.expectedVersion))
        return { saved: false as const, conflict: slot.session };
      const now = new Date();
      let session;
      if (slot.session) {
        session = await ctx.prisma.evaluationSession.update({
          where: { id: slot.session.id },
          data: {
            scorecard: input.scorecard,
            draftUpdatedAt: now,
            draftTerminalId: input.terminalId,
            draftOperatorName: input.operatorName,
            version: { increment: 1 },
          },
        });
      } else {
        try {
          session = await ctx.prisma.evaluationSession.create({
            data: {
              slotId: slot.id,
              scorecard: input.scorecard,
              draftUpdatedAt: now,
              draftTerminalId: input.terminalId,
              draftOperatorName: input.operatorName,
            },
          });
        } catch {
          const concurrent = await ctx.prisma.evaluationSession.findUnique({
            where: { slotId: slot.id },
          });
          if (concurrent) return { saved: false as const, conflict: concurrent };
          throw new Error("Não foi possível salvar o rascunho.");
        }
      }
      await ctx.prisma.scorecardDraftRevision.create({
        data: {
          sessionId: session.id,
          version: session.version,
          scorecard: input.scorecard,
          terminalId: input.terminalId,
          operatorName: input.operatorName,
        },
      });
      return { saved: true as const, session };
    }),
  draftHistory: refereeProcedure
    .input(z.object({ slotId: z.string(), take: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true },
      });
      if (!slot) throw new Error("Horário não encontrado.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (!slot.session) return [];
      return ctx.prisma.scorecardDraftRevision.findMany({
        where: { sessionId: slot.session.id },
        orderBy: { createdAt: "desc" },
        take: input.take,
      });
    }),
  saveJudgeScore: refereeProcedure
    .input(
      z.object({
        slotId: z.string(),
        judgeName: z.string().trim().min(2),
        scorecard: z.string().max(50000),
        total: z.number().finite(),
        terminalId: z.string().optional(),
        operatorName: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true, phase: true },
      });
      if (!slot) throw new Error("Horário não encontrado.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (!["INTERVIEW", "PERFORMANCE"].includes(slot.phase.type))
        throw new Error("Notas por jurado são exclusivas da Artística.");
      const session =
        slot.session ??
        (await ctx.prisma.evaluationSession.create({
          data: { slotId: slot.id, terminalId: input.terminalId, operatorName: input.operatorName },
        }));
      const judge = await ctx.prisma.judgeScore.upsert({
        where: { sessionId_judgeName: { sessionId: session.id, judgeName: input.judgeName } },
        create: {
          sessionId: session.id,
          judgeName: input.judgeName,
          role: slot.phase.type,
          scorecard: input.scorecard,
          total: input.total,
        },
        update: { scorecard: input.scorecard, total: input.total, role: slot.phase.type },
      });
      await audit(ctx, {
        eventId: slot.eventId,
        action: "ARTISTIC_JUDGE_SCORE_SAVED",
        entityType: "JudgeScore",
        entityId: judge.id,
        stationId: slot.stationId,
        teamId: slot.teamId,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
        after: judge,
      });
      return judge;
    }),
  artisticJudgingContext: refereeProcedure
    .input(z.string())
    .query(async ({ ctx, input: slotId }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: slotId },
        include: { phase: true, session: { include: { judgeScores: true } } },
      });
      if (!slot) throw new Error("Horário não encontrado.");
      assertSessionEvent(ctx.user, slot.eventId);
      const interviewSessions = await ctx.prisma.evaluationSession.findMany({
        where: {
          slot: { eventId: slot.eventId, teamId: slot.teamId, phase: { type: "INTERVIEW" } },
        },
        include: { judgeScores: true },
      });
      return {
        phaseType: slot.phase.type,
        judgeScores: slot.session?.judgeScores ?? [],
        interviewJudgeNames: interviewSessions.flatMap((session) =>
          session.judgeScores.map((judge) => judge.judgeName),
        ),
        minimumJudges: slot.phase.type === "INTERVIEW" ? 2 : 3,
      };
    }),
  saveScorecard: refereeProcedure
    .input(
      z.object({
        slotId: z.string(),
        scorecard: z.string().max(50000),
        expectedVersion: z.number().int().positive().optional(),
        terminalId: z.string().optional(),
        operatorName: z.string().min(1),
        announcerName: z.string().min(1),
        scorerName: z.string().min(1),
        adminPassword: z.string().optional(),
        adminAuthorizerName: z.string().trim().max(120).optional(),
        reason: z.string().max(500).optional(),
        artisticDecision: z
          .enum(["NORMAL", "DISQUALIFIED", "ORIGINALITY", "PROHIBITED_CONTENT"])
          .optional(),
        artisticDecisionReason: z.string().trim().max(1000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true, event: true },
      });
      if (!slot) throw new Error("Horário não encontrado.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (slot.session?.state === "FINALIZED") {
        if (
          !input.adminPassword ||
          !(await AuthService.verifyPassword(input.adminPassword, slot.event.adminPassword))
        )
          throw new Error("A correção exige a senha do administrador.");
        if (!input.reason?.trim()) throw new Error("Informe o motivo da correção.");
        if (!input.adminAuthorizerName?.trim())
          throw new Error("Informe o nome do administrador que autorizou a correção.");
      }
      if (hasVersionConflict(slot.session?.version, input.expectedVersion))
        throw new TRPCError({
          code: "CONFLICT",
          message: "A ficha mudou em outro tablet. Atualize antes de salvar.",
        });
      const before = slot.session;
      let surpriseStatus: string | undefined;
      if (slot.session?.surpriseDrawnAt && slot.session.surpriseEligible) {
        try {
          const parsed = JSON.parse(input.scorecard) as { card?: { surpriseChallenge?: boolean } };
          if (typeof parsed.card?.surpriseChallenge === "boolean")
            surpriseStatus = parsed.card.surpriseChallenge ? "DEMONSTRATED" : "NOT_DEMONSTRATED";
        } catch {
          // A ficha continua sendo salva; JSON inválido não altera o estado do desafio.
        }
      }
      const session = slot.session
        ? await ctx.prisma.evaluationSession.update({
            where: { id: slot.session.id },
            data: {
              scorecard: input.scorecard,
              terminalId: input.terminalId,
              operatorName: input.operatorName,
              announcerName: input.announcerName,
              scorerName: input.scorerName,
              artisticDecision: input.artisticDecision,
              artisticDecisionReason: input.artisticDecisionReason,
              surpriseStatus,
              version: { increment: 1 },
            },
          })
        : await ctx.prisma.evaluationSession.create({
            data: {
              slotId: slot.id,
              scorecard: input.scorecard,
              terminalId: input.terminalId,
              operatorName: input.operatorName,
              announcerName: input.announcerName,
              scorerName: input.scorerName,
              artisticDecision: input.artisticDecision,
              artisticDecisionReason: input.artisticDecisionReason,
            },
          });
      await audit(ctx, {
        eventId: slot.eventId,
        action: before?.state === "FINALIZED" ? "SCORECARD_CORRECTED" : "SCORECARD_SAVED",
        entityType: "EvaluationSession",
        entityId: session.id,
        stationId: slot.stationId,
        teamId: slot.teamId,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
        authorizedByName: input.adminAuthorizerName,
        before,
        after: session,
        reason: input.reason,
      });
      return session;
    }),
  checkInTerminal: refereeProcedure
    .input(
      z.object({
        eventId: z.string(),
        stationId: z.string(),
        deviceKey: z.string().min(8),
        deviceName: z.string().trim().min(1),
        operatorName: z.string().trim().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      const terminal = await ctx.prisma.terminal.upsert({
        where: {
          eventId_deviceKey: { eventId: input.eventId, deviceKey: input.deviceKey },
        },
        create: { eventId: input.eventId, deviceKey: input.deviceKey, name: input.deviceName },
        update: { name: input.deviceName },
      });
      const activeUsage = await ctx.prisma.terminalUsage.findFirst({
        where: { terminalId: terminal.id, endedAt: null },
        orderBy: { startedAt: "desc" },
      });
      const isStationChange = !!activeUsage && activeUsage.stationId !== input.stationId;
      await ctx.prisma.terminalUsage.updateMany({
        where: { terminalId: terminal.id, endedAt: null },
        data: { endedAt: new Date() },
      });
      const usage = await ctx.prisma.terminalUsage.create({
        data: {
          terminalId: terminal.id,
          stationId: input.stationId,
          operatorName: input.operatorName,
        },
      });
      await audit(ctx, {
        eventId: input.eventId,
        action: isStationChange ? "TERMINAL_STATION_CHANGED" : "TERMINAL_CHECKED_IN",
        entityType: "TerminalUsage",
        entityId: usage.id,
        stationId: input.stationId,
        terminalId: terminal.id,
        operatorName: input.operatorName,
        before: activeUsage,
        after: usage,
        reason: isStationChange ? "Troca operacional de mesa" : undefined,
      });
      return { terminal, usage };
    }),
  transitionSession: refereeProcedure
    .input(
      z.object({
        slotId: z.string(),
        state: z.enum([
          "CALLED",
          "CALIBRATING",
          "IN_PROGRESS",
          "PAUSED",
          "REVIEW",
          "FINALIZED",
          "ABSENT",
          "RESCHEDULED",
        ]),
        terminalId: z.string().optional(),
        operatorName: z.string().trim().min(1),
        announcerName: z.string().trim().min(1).optional(),
        scorerName: z.string().trim().min(1).optional(),
        expectedVersion: z.number().int().positive().optional(),
        reason: z.string().trim().max(500).optional(),
        forceMaximumTime: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const slot = await ctx.prisma.scheduleSlot.findUnique({
        where: { id: input.slotId },
        include: { session: true, phase: true },
      });
      if (!slot) throw new Error("Sessão agendada não encontrada.");
      assertSessionEvent(ctx.user, slot.eventId);
      if (
        ["CALLED", "CALIBRATING", "IN_PROGRESS"].includes(input.state) &&
        !canStartPhase(slot.phase.operationalStatus)
      )
        throw new Error(
          slot.phase.operationalStatus === "SUSPENDED"
            ? "Este turno está suspenso pelo administrador."
            : "Este turno ainda não foi aberto pelo administrador.",
        );
      if (hasVersionConflict(slot.session?.version, input.expectedVersion))
        throw new TRPCError({
          code: "CONFLICT",
          message: "Esta sessão foi alterada em outro tablet. Atualize a fila antes de salvar.",
        });
      const now = new Date();
      const elapsedSinceStart =
        slot.session?.state === "IN_PROGRESS" && slot.session.startedAt
          ? Math.max(0, Math.floor((now.getTime() - slot.session.startedAt.getTime()) / 1000))
          : 0;
      const stateData = {
        state: input.state,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
        announcerName: input.announcerName,
        scorerName: input.scorerName,
        calledAt: input.state === "CALLED" ? now : undefined,
        callCount: input.state === "CALLED" ? { increment: 1 } : undefined,
        calibrationStartedAt: input.state === "CALIBRATING" ? now : undefined,
        startedAt: input.state === "IN_PROGRESS" ? now : undefined,
        timerAccumulatedSeconds: input.forceMaximumTime
          ? slot.phase.durationSeconds
          : ["PAUSED", "REVIEW", "FINALIZED"].includes(input.state)
            ? { increment: elapsedSinceStart }
            : undefined,
        endedEarly: input.forceMaximumTime || undefined,
        endReason: input.forceMaximumTime ? input.reason || "Fim antecipado da rodada" : undefined,
        finishedAt: ["FINALIZED", "ABSENT"].includes(input.state) ? now : undefined,
        version: { increment: 1 },
      };
      const session = slot.session
        ? await ctx.prisma.evaluationSession.update({
            where: { id: slot.session.id },
            data: stateData,
          })
        : await ctx.prisma.evaluationSession.create({
            data: {
              slotId: slot.id,
              state: input.state,
              terminalId: input.terminalId,
              operatorName: input.operatorName,
              announcerName: input.announcerName,
              scorerName: input.scorerName,
              calledAt: input.state === "CALLED" ? now : undefined,
              callCount: input.state === "CALLED" ? 1 : 0,
              calibrationStartedAt: input.state === "CALIBRATING" ? now : undefined,
              startedAt: input.state === "IN_PROGRESS" ? now : undefined,
              finishedAt: ["FINALIZED", "ABSENT"].includes(input.state) ? now : undefined,
              timerAccumulatedSeconds: input.forceMaximumTime ? slot.phase.durationSeconds : 0,
              endedEarly: input.forceMaximumTime ?? false,
              endReason: input.forceMaximumTime
                ? input.reason || "Fim antecipado da rodada"
                : undefined,
            },
          });
      const updatedSlot = await ctx.prisma.scheduleSlot.update({
        where: { id: slot.id },
        data: { status: input.state },
      });
      await audit(ctx, {
        eventId: slot.eventId,
        action: `SESSION_${input.state}`,
        entityType: "EvaluationSession",
        entityId: session.id,
        stationId: slot.stationId,
        teamId: slot.teamId,
        terminalId: input.terminalId,
        operatorName: input.operatorName,
        before: slot.session,
        after: session,
        reason: input.reason,
      });
      return { session, slot: updatedSlot };
    }),
  auditLog: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        stationId: z.string().optional(),
        terminalId: z.string().optional(),
        teamId: z.string().optional(),
        operatorName: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      return ctx.prisma.auditLog.findMany({
        where: {
          eventId: input.eventId,
          ...(input.stationId ? { stationId: input.stationId } : {}),
          ...(input.terminalId ? { terminalId: input.terminalId } : {}),
          ...(input.teamId ? { teamId: input.teamId } : {}),
          ...(input.operatorName ? { operatorName: { contains: input.operatorName } } : {}),
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 250,
      });
    }),
  draftAudit: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        stationId: z.string().optional(),
        terminalId: z.string().optional(),
        teamId: z.string().optional(),
        operatorName: z.string().optional(),
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
    )
    .query(({ ctx, input }) => {
      assertSessionEvent(ctx.user, input.eventId);
      return ctx.prisma.scorecardDraftRevision.findMany({
        where: {
          session: {
            slot: {
              eventId: input.eventId,
              ...(input.stationId ? { stationId: input.stationId } : {}),
              ...(input.teamId ? { teamId: input.teamId } : {}),
            },
          },
          ...(input.terminalId ? { terminalId: input.terminalId } : {}),
          ...(input.operatorName ? { operatorName: { contains: input.operatorName } } : {}),
          ...(input.from || input.to
            ? {
                createdAt: {
                  ...(input.from ? { gte: new Date(input.from) } : {}),
                  ...(input.to ? { lte: new Date(input.to) } : {}),
                },
              }
            : {}),
        },
        include: {
          session: { include: { slot: { include: { team: true, station: true, phase: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
    }),
});
