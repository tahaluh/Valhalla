import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { router, adminProcedure } from "@/server/trpc/trpc";
import { AuthService } from "@/application/services/auth.service";
import { rankTeams } from "@/application/services/scoring.service";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { syncEventToOlimpo } from "@/server/jobs/background-jobs";
import { buildEventBackup, type EventBackup } from "@/server/services/backup.service";

async function assertOwnEvent(sessionEventId: string, eventId: string) {
  if (sessionEventId !== eventId)
    throw new TRPCError({ code: "FORBIDDEN", message: "Evento fora da sessão atual." });
}

const restoreSchema = z.object({
  eventId: z.string(),
  adminPassword: z.string().min(1),
  confirmation: z.literal("RESTAURAR"),
  backup: z.string().min(10).max(25_000_000),
});

export const robustnessRouter = router({
  diagnostics: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    const started = Date.now();
    const [teams, sessions, pendingDrafts, lastFailures] = await Promise.all([
      ctx.prisma.team.count({ where: { category: { eventId } } }),
      ctx.prisma.evaluationSession.count({ where: { slot: { eventId } } }),
      ctx.prisma.evaluationSession.count({
        where: { slot: { eventId }, draftUpdatedAt: { not: null }, state: { not: "FINALIZED" } },
      }),
      ctx.prisma.auditLog.findMany({
        where: {
          eventId,
          action: {
            in: ["OLIMPO_SYNC_FAILED", "AUTOMATIC_BACKUP_FAILED", "LOGIN_FAILED"],
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
    ]);
    const databaseLatencyMs = Date.now() - started;
    return {
      status: "OK",
      serverTime: new Date(),
      uptimeSeconds: Math.floor(process.uptime()),
      nodeVersion: process.version,
      environment: process.env.NODE_ENV ?? "unknown",
      databaseLatencyMs,
      teams,
      sessions,
      pendingDrafts,
      lastFailures,
    };
  }),
  configureOlimpoSync: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        enabled: z.boolean(),
        intervalSeconds: z.number().int().min(60).max(1800),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      const updated = await ctx.prisma.event.update({
        where: { id: input.eventId },
        data: {
          olimpoAutoSyncEnabled: input.enabled,
          olimpoSyncIntervalSeconds: input.intervalSeconds,
        },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "OLIMPO_AUTO_SYNC_CONFIGURED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: ctx.user.role,
          after: JSON.stringify({ enabled: input.enabled, intervalSeconds: input.intervalSeconds }),
        },
      });
      if (input.enabled)
        await syncEventToOlimpo(input.eventId, ctx.user.role).catch(() => undefined);
      return updated;
    }),
  exportBackup: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    return JSON.stringify(await buildEventBackup(ctx.prisma, eventId));
  }),
  validateBackup: adminProcedure
    .input(z.object({ eventId: z.string(), backup: z.string().min(10).max(25_000_000) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      try {
        const backup = JSON.parse(input.backup) as EventBackup;
        if (
          backup.format !== "VALHALLA_OBR_BACKUP" ||
          backup.version !== 1 ||
          backup.event.id !== input.eventId
        )
          throw new Error("formato, versão ou evento divergente");
        return {
          valid: true,
          checksum: createHash("sha256").update(input.backup).digest("hex"),
          counts: {
            categories: backup.categories.length,
            teams: backup.teams.length,
            scores: backup.scores.length,
            sessions: backup.sessions.length,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Backup inválido: ${error instanceof Error ? error.message : "JSON ilegível"}`,
        });
      }
    }),
  createSnapshot: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        createdByName: z.string().trim().min(2),
        kind: z.enum(["MANUAL", "AUTOMATIC"]).default("MANUAL"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      const payload = JSON.stringify(await buildEventBackup(ctx.prisma, input.eventId));
      const snapshot = await ctx.prisma.backupSnapshot.create({
        data: {
          eventId: input.eventId,
          createdByName: input.createdByName,
          kind: input.kind,
          payload,
          checksum: createHash("sha256").update(payload).digest("hex"),
        },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: `BACKUP_SNAPSHOT_${input.kind}`,
          entityType: "BackupSnapshot",
          entityId: snapshot.id,
          actorRole: ctx.user.role,
          operatorName: input.createdByName,
          after: JSON.stringify({ checksum: snapshot.checksum }),
        },
      });
      return { ...snapshot, payload: undefined };
    }),
  listSnapshots: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    return ctx.prisma.backupSnapshot.findMany({
      where: { eventId },
      select: { id: true, kind: true, createdByName: true, checksum: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }),
  configureAutomaticBackup: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        enabled: z.boolean(),
        intervalMinutes: z.number().int().min(1).max(1440),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      const before = await ctx.prisma.event.findUniqueOrThrow({ where: { id: input.eventId } });
      const updated = await ctx.prisma.event.update({
        where: { id: input.eventId },
        data: { autoBackupEnabled: input.enabled, backupIntervalMinutes: input.intervalMinutes },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "AUTOMATIC_BACKUP_CONFIGURED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: ctx.user.role,
          before: JSON.stringify({
            enabled: before.autoBackupEnabled,
            interval: before.backupIntervalMinutes,
          }),
          after: JSON.stringify({
            enabled: updated.autoBackupEnabled,
            interval: updated.backupIntervalMinutes,
          }),
        },
      });
      return updated;
    }),
  restoreBackup: adminProcedure.input(restoreSchema).mutation(async ({ ctx, input }) => {
    await assertOwnEvent(ctx.user.eventId, input.eventId);
    const current = await ctx.prisma.event.findUnique({ where: { id: input.eventId } });
    if (!current || !(await AuthService.verifyPassword(input.adminPassword, current.adminPassword)))
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Senha administrativa inválida." });
    let backup: EventBackup;
    try {
      backup = JSON.parse(input.backup) as EventBackup;
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Arquivo de backup inválido." });
    }
    if (backup.format !== "VALHALLA_OBR_BACKUP" || backup.version !== 1)
      throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de backup não reconhecido." });
    if (backup.event.id !== input.eventId)
      throw new TRPCError({ code: "BAD_REQUEST", message: "O backup pertence a outro evento." });

    await ctx.prisma.$transaction(async (tx) => {
      await tx.publicationBatch.deleteMany({ where: { eventId: input.eventId } });
      await tx.scheduleBlackout.deleteMany({ where: { eventId: input.eventId } });
      await tx.auditLog.deleteMany({ where: { eventId: input.eventId } });
      await tx.formalAppeal.deleteMany({ where: { eventId: input.eventId } });
      await tx.scheduleSlot.deleteMany({ where: { eventId: input.eventId } });
      await tx.terminalUsage.deleteMany({ where: { terminal: { eventId: input.eventId } } });
      await tx.terminal.deleteMany({ where: { eventId: input.eventId } });
      await tx.evaluationStation.deleteMany({ where: { eventId: input.eventId } });
      await tx.phase.deleteMany({ where: { eventId: input.eventId } });
      await tx.scoreRevision.deleteMany({
        where: { score: { category: { eventId: input.eventId } } },
      });
      await tx.score.deleteMany({ where: { category: { eventId: input.eventId } } });
      await tx.team.deleteMany({ where: { category: { eventId: input.eventId } } });
      await tx.scoreColumn.deleteMany({ where: { category: { eventId: input.eventId } } });
      await tx.category.deleteMany({ where: { eventId: input.eventId } });
      await tx.arena.deleteMany({ where: { eventId: input.eventId } });
      await tx.referee.deleteMany({ where: { eventId: input.eventId } });
      await tx.displayView.deleteMany({ where: { eventId: input.eventId } });
      await tx.displayScreen.deleteMany({ where: { eventId: input.eventId } });

      const eventData: Prisma.EventUpdateInput = {
        name: backup.event.name,
        description: backup.event.description,
        location: backup.event.location,
        startDate: backup.event.startDate,
        endDate: backup.event.endDate,
        isActive: backup.event.isActive,
        surpriseChallenge: backup.event.surpriseChallenge,
        surpriseChallengeBank: backup.event.surpriseChallengeBank ?? "[]",
        publicRankingMode: backup.event.publicRankingMode,
        publicRankingPublishedAt: backup.event.publicRankingPublishedAt,
        resultsStatus: backup.event.resultsStatus,
        resultsHomologatedAt: backup.event.resultsHomologatedAt,
        olimpoLastSyncAt: backup.event.olimpoLastSyncAt,
        olimpoLastSyncStatus: backup.event.olimpoLastSyncStatus,
        olimpoLastSyncMessage: backup.event.olimpoLastSyncMessage,
        olimpoAutoSyncEnabled: backup.event.olimpoAutoSyncEnabled,
        olimpoSyncIntervalSeconds: backup.event.olimpoSyncIntervalSeconds,
        autoBackupEnabled: backup.event.autoBackupEnabled,
        backupIntervalMinutes: backup.event.backupIntervalMinutes,
        logoUrl: backup.event.logoUrl,
        rulesUpdateNotice: backup.event.rulesUpdateNotice,
      };
      await tx.event.update({ where: { id: input.eventId }, data: eventData });
      if (backup.categories.length) await tx.category.createMany({ data: backup.categories });
      if (backup.scoreColumns.length)
        await tx.scoreColumn.createMany({ data: backup.scoreColumns });
      if (backup.teams.length) await tx.team.createMany({ data: backup.teams });
      if (backup.arenas.length) await tx.arena.createMany({ data: backup.arenas });
      if (backup.referees.length) await tx.referee.createMany({ data: backup.referees });
      if (backup.stations.length) await tx.evaluationStation.createMany({ data: backup.stations });
      if (backup.phases.length) await tx.phase.createMany({ data: backup.phases });
      if (backup.terminals.length) await tx.terminal.createMany({ data: backup.terminals });
      if (backup.displayScreens?.length)
        await tx.displayScreen.createMany({ data: backup.displayScreens });
      if (backup.scheduleBlackouts?.length)
        await tx.scheduleBlackout.createMany({ data: backup.scheduleBlackouts });
      if (backup.slots.length) await tx.scheduleSlot.createMany({ data: backup.slots });
      if (backup.sessions.length) await tx.evaluationSession.createMany({ data: backup.sessions });
      if (backup.draftRevisions?.length)
        await tx.scorecardDraftRevision.createMany({ data: backup.draftRevisions });
      if (backup.judgeScores?.length) await tx.judgeScore.createMany({ data: backup.judgeScores });
      if (backup.terminalUsages.length)
        await tx.terminalUsage.createMany({ data: backup.terminalUsages });
      if (backup.displayViews.length)
        await tx.displayView.createMany({ data: backup.displayViews });
      if (backup.scores.length) await tx.score.createMany({ data: backup.scores });
      if (backup.scoreRevisions.length)
        await tx.scoreRevision.createMany({ data: backup.scoreRevisions });
      if (backup.appeals.length) await tx.formalAppeal.createMany({ data: backup.appeals });
      if (backup.publicationBatches?.length)
        await tx.publicationBatch.createMany({ data: backup.publicationBatches });
      if (backup.auditLogs.length) await tx.auditLog.createMany({ data: backup.auditLogs });
      await tx.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "BACKUP_RESTORED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: "ADMIN",
        },
      });
    });
    const verification = await buildEventBackup(ctx.prisma, input.eventId);
    return {
      success: true,
      verified:
        verification.teams.length === backup.teams.length &&
        verification.scores.length === backup.scores.length &&
        verification.sessions.length === backup.sessions.length,
      counts: {
        teams: verification.teams.length,
        scores: verification.scores.length,
        sessions: verification.sessions.length,
      },
    };
  }),
  exportResultsCsv: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    const categories = await ctx.prisma.category.findMany({
      where: { eventId },
      include: { teams: { include: { scores: true } } },
      orderBy: { order: "asc" },
    });
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const lines = [
      ["Categoria", "Posição", "Equipe", "Instituição", "Cidade", "UF", "Pontuação"]
        .map(quote)
        .join(","),
    ];
    for (const category of categories) {
      const ranked = rankTeams(
        category.teams.map((team) => ({
          teamId: team.id,
          teamName: team.name,
          institution: team.institution,
          city: team.city,
          state: team.state,
          scores: Array.from(
            { length: Math.max(0, ...team.scores.map((score) => score.columnIndex)) + 1 },
            (_, index) => team.scores.find((score) => score.columnIndex === index)?.value ?? 0,
          ),
        })),
        category.scoringFormula,
      );
      for (const row of ranked) {
        const team = category.teams.find((item) => item.id === row.teamId)!;
        lines.push(
          [
            category.name,
            row.rank,
            row.teamName,
            row.institution,
            team.city,
            team.state,
            row.finalScore,
          ]
            .map(quote)
            .join(","),
        );
      }
    }
    return `\uFEFF${lines.join("\n")}`;
  }),
  exportResultsPdf: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    const event = await ctx.prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    const categories = await ctx.prisma.category.findMany({
      where: { eventId },
      include: { teams: { include: { scores: true } } },
      orderBy: { order: "asc" },
    });
    const pdf = await PDFDocument.create();
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    let y = 800;
    const line = (text: string, size = 10, isBold = false) => {
      if (y < 50) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawText(text.replaceAll(/[\u0080-\uFFFF]/g, "?"), {
        x: 42,
        y,
        size,
        font: isBold ? bold : regular,
        color: rgb(0.08, 0.24, 0.4),
      });
      y -= size + 7;
    };
    line(event.name, 20, true);
    line("Resultados oficiais - OBR presencial", 12);
    y -= 10;
    for (const category of categories) {
      line(category.name, 15, true);
      const ranked = rankTeams(
        category.teams.map((team) => ({
          teamId: team.id,
          teamName: team.name,
          institution: team.institution,
          city: team.city,
          state: team.state,
          scores: Array.from(
            { length: Math.max(0, ...team.scores.map((score) => score.columnIndex)) + 1 },
            (_, index) => team.scores.find((score) => score.columnIndex === index)?.value ?? 0,
          ),
        })),
        category.scoringFormula,
      );
      ranked.forEach((row) =>
        line(
          `${row.rank}. ${row.teamName} - ${row.institution} - ${row.finalScore.toFixed(2)} pts`,
        ),
      );
      y -= 12;
    }
    return Buffer.from(await pdf.save()).toString("base64");
  }),
  testOlimpoConnection: adminProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: eventId }) => {
      await assertOwnEvent(ctx.user.eventId, eventId);
      const endpoint =
        process.env.OLIMPO_SCORE_API_URL ?? "https://olimpo.robocup.org.br/api/events/steps/score";
      try {
        const response = await fetch(endpoint, {
          method: "OPTIONS",
          signal: AbortSignal.timeout(10_000),
        });
        const result = { reachable: response.status < 500, status: response.status, endpoint };
        await ctx.prisma.auditLog.create({
          data: {
            eventId,
            action: "OLIMPO_CONNECTION_TESTED",
            entityType: "Event",
            entityId: eventId,
            actorRole: ctx.user.role,
            after: JSON.stringify(result),
          },
        });
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `Olimpo indisponível: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
  listAppeals: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    return ctx.prisma.formalAppeal.findMany({
      where: { eventId },
      include: { team: true, session: { include: { slot: { include: { phase: true } } } } },
      orderBy: { createdAt: "desc" },
    });
  }),
  createAppeal: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        teamId: z.string().optional(),
        sessionId: z.string().optional(),
        title: z.string().trim().min(3),
        description: z.string().trim().min(3),
        deadlineAt: z.string().datetime().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      const appeal = await ctx.prisma.formalAppeal.create({
        data: { ...input, deadlineAt: input.deadlineAt ? new Date(input.deadlineAt) : undefined },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "FORMAL_APPEAL_CREATED",
          entityType: "FormalAppeal",
          entityId: appeal.id,
          teamId: input.teamId,
          actorRole: ctx.user.role,
          after: JSON.stringify(appeal),
        },
      });
      return appeal;
    }),
  decideAppeal: adminProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(["OPEN", "UNDER_REVIEW", "ACCEPTED", "REJECTED"]),
        decision: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const before = await ctx.prisma.formalAppeal.findUniqueOrThrow({ where: { id } });
      await assertOwnEvent(ctx.user.eventId, before.eventId);
      const updated = await ctx.prisma.formalAppeal.update({ where: { id }, data });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: before.eventId,
          action: "FORMAL_APPEAL_UPDATED",
          entityType: "FormalAppeal",
          entityId: id,
          teamId: before.teamId,
          actorRole: ctx.user.role,
          before: JSON.stringify(before),
          after: JSON.stringify(updated),
        },
      });
      return updated;
    }),
  homologate: adminProcedure
    .input(z.object({ eventId: z.string(), homologated: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      if (input.homologated) {
        const open = await ctx.prisma.formalAppeal.count({
          where: { eventId: input.eventId, status: { in: ["OPEN", "UNDER_REVIEW"] } },
        });
        if (open)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Há ${open} recurso(s) pendente(s).`,
          });
      }
      const updated = await ctx.prisma.event.update({
        where: { id: input.eventId },
        data: {
          resultsStatus: input.homologated ? "HOMOLOGATED" : "PROVISIONAL",
          resultsHomologatedAt: input.homologated ? new Date() : null,
        },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: input.homologated ? "RESULTS_HOMOLOGATED" : "RESULTS_REOPENED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: ctx.user.role,
          after: JSON.stringify({ status: updated.resultsStatus }),
        },
      });
      return updated;
    }),
  syncOlimpo: adminProcedure.input(z.string()).mutation(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    const categories = await ctx.prisma.category.findMany({
      where: { eventId },
      include: {
        scoreColumns: { orderBy: { order: "asc" } },
        teams: { include: { scores: true } },
      },
    });
    const steps = categories.flatMap((category) => {
      const externalTeams = category.teams.filter(
        (team) => team.externalId && team.externalEventToken && team.externalStepId,
      );
      if (!externalTeams.length) return [];
      const ranked = rankTeams(
        externalTeams.map((team) => ({
          teamId: team.id,
          teamName: team.name,
          institution: team.institution,
          city: team.city,
          state: team.state,
          scores: Array.from(
            { length: category.scoreColumns.length },
            (_, index) => team.scores.find((score) => score.columnIndex === index)?.value ?? 0,
          ),
        })),
        category.scoringFormula,
      );
      const rankByTeam = new Map(ranked.map((row) => [row.teamId, row]));
      const headers = [
        "Posição",
        ...category.scoreColumns.map((column) => column.name),
        "Pontuação final",
      ];
      return [
        {
          id: externalTeams[0]!.externalStepId,
          token: externalTeams[0]!.externalEventToken,
          headers,
          scores: externalTeams.map((team) => {
            const rank = rankByTeam.get(team.id)!;
            const headersMap: Record<string, number> = {
              Posição: rank.rank,
              "Pontuação final": rank.finalScore,
            };
            const dataMap: Record<string, string> = {};
            category.scoreColumns.forEach((column) => {
              headersMap[column.name] =
                team.scores.find((score) => score.columnIndex === column.order)?.value ?? 0;
              dataMap[column.name] = "";
            });
            return { id: team.externalId, dataMap, headersMap };
          }),
        },
      ];
    });
    if (!steps.length)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Nenhuma equipe importada do Olimpo possui etapa e token para sincronização.",
      });
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
      await ctx.prisma.event.update({
        where: { id: eventId },
        data: {
          olimpoLastSyncAt: syncedAt,
          olimpoLastSyncStatus: "SUCCESS",
          olimpoLastSyncMessage: body || "OK",
        },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId,
          action: "OLIMPO_RESULTS_SYNCED",
          entityType: "Event",
          entityId: eventId,
          actorRole: "ADMIN",
          after: JSON.stringify({ steps: steps.length, syncedAt }),
        },
      });
      return { success: true, steps: steps.length, syncedAt };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.prisma.event.update({
        where: { id: eventId },
        data: {
          olimpoLastSyncAt: new Date(),
          olimpoLastSyncStatus: "ERROR",
          olimpoLastSyncMessage: message.slice(0, 2000),
        },
      });
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: `Falha ao sincronizar com o Olimpo: ${message}`,
      });
    }
  }),
});
