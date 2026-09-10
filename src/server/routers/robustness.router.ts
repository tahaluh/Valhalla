import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { router, adminProcedure } from "@/server/trpc/trpc";
import { AuthService } from "@/application/services/auth.service";
import { rankTeams } from "@/application/services/scoring.service";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { syncEventToOlimpo } from "@/server/services/olimpo.service";
import { buildEventBackup, type EventBackup } from "@/server/services/backup.service";
import { validateEventRules } from "@/server/services/rules-validation.service";

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
  validateRules: adminProcedure.input(z.string()).query(async ({ ctx, input: eventId }) => {
    await assertOwnEvent(ctx.user.eventId, eventId);
    return validateEventRules(eventId, ctx.prisma);
  }),
  approveRules: adminProcedure
    .input(
      z.object({
        eventId: z.string(),
        approvedBy: z.string().trim().min(2).max(120),
        reference: z.string().trim().min(3).max(200),
        notes: z.string().trim().max(2000).optional(),
        organizerApproved: z.literal(true),
        normalizationApproved: z.literal(true),
        surpriseApproved: z.literal(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwnEvent(ctx.user.eventId, input.eventId);
      const validation = await validateEventRules(input.eventId, ctx.prisma);
      if (!validation.valid)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Corrija todos os itens objetivos antes de aprovar as regras.",
        });
      const approvedAt = new Date();
      const event = await ctx.prisma.event.update({
        where: { id: input.eventId },
        data: {
          rulesValidatedAt: approvedAt,
          rulesValidatedBy: input.approvedBy,
          rulesValidationReference: input.reference,
          rulesValidationNotes: input.notes,
          rulesValidationHash: validation.hash,
        },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "RULES_HOMOLOGATED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: ctx.user.role,
          operatorName: input.approvedBy,
          after: JSON.stringify({
            reference: input.reference,
            notes: input.notes,
            hash: validation.hash,
            approvedAt,
          }),
        },
      });
      return event;
    }),
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
        olimpoLastSyncAttemptAt: backup.event.olimpoLastSyncAttemptAt,
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
    const verified =
      verification.teams.length === backup.teams.length &&
      verification.scores.length === backup.scores.length &&
      verification.sessions.length === backup.sessions.length;
    const counts = {
      teams: verification.teams.length,
      scores: verification.scores.length,
      sessions: verification.sessions.length,
    };
    if (!verified) {
      // The destructive restore already committed; there is no automatic rollback at this point.
      // Surface this as an error instead of a buried boolean so the operator can't miss that the
      // restored data doesn't match the backup's expected counts (e.g. a truncated/corrupt file).
      await ctx.prisma.auditLog.create({
        data: {
          eventId: input.eventId,
          action: "BACKUP_RESTORE_VERIFICATION_FAILED",
          entityType: "Event",
          entityId: input.eventId,
          actorRole: ctx.user.role,
          reason: JSON.stringify({
            expected: {
              teams: backup.teams.length,
              scores: backup.scores.length,
              sessions: backup.sessions.length,
            },
            actual: counts,
          }),
        },
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "A restauração foi aplicada, mas a verificação pós-restauração não bateu com o backup " +
          "(contagens divergentes). Confira o log de auditoria e considere restaurar novamente " +
          "a partir de outro snapshot.",
      });
    }
    return { success: true, verified, counts };
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
  exportSessionScorecardPdf: adminProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: sessionId }) => {
      const session = await ctx.prisma.evaluationSession.findUnique({
        where: { id: sessionId },
        include: {
          judgeScores: { orderBy: { judgeName: "asc" } },
          slot: {
            include: { team: { include: { category: true } }, phase: true, station: true },
          },
        },
      });
      if (!session || session.slot.eventId !== ctx.user.eventId)
        throw new TRPCError({ code: "NOT_FOUND", message: "Ficha não encontrada." });
      const scores = await ctx.prisma.score.findMany({
        where: { teamId: session.slot.teamId, categoryId: session.slot.team.categoryId },
        orderBy: { columnIndex: "asc" },
      });
      const pdf = await PDFDocument.create();
      const regular = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let page = pdf.addPage([595, 842]);
      let y = 800;
      const safe = (value: unknown) =>
        String(value ?? "-")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replaceAll(/[^\x20-\x7E]/g, "?");
      const flatten = (value: unknown, prefix = ""): Array<[string, unknown]> => {
        if (Array.isArray(value))
          return value.flatMap((item, index) => flatten(item, `${prefix}[${index + 1}]`));
        if (value && typeof value === "object")
          return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
            flatten(item, prefix ? `${prefix}.${key}` : key),
          );
        return [[prefix || "valor", value]];
      };
      const line = (label: string, value?: unknown, size = 10, strong = false) => {
        const text = value === undefined ? label : `${label}: ${safe(value)}`;
        const words = safe(text).split(/\s+/);
        const rows: string[] = [];
        for (const word of words) {
          if (!rows.length) {
            rows.push(word);
            continue;
          }
          const previous = rows.at(-1) ?? "";
          if (`${previous} ${word}`.trim().length <= 92)
            rows[rows.length - 1] = `${previous} ${word}`.trim();
          else rows.push(word);
        }
        for (const row of rows.length ? rows : [""]) {
          if (y < 55) {
            page = pdf.addPage([595, 842]);
            y = 800;
          }
          page.drawText(row, {
            x: 42,
            y,
            size,
            font: strong ? bold : regular,
            color: rgb(0.08, 0.24, 0.4),
          });
          y -= size + 7;
        }
      };
      line("VALHALLA - FICHA OFICIAL DE AVALIACAO", undefined, 17, true);
      line("Equipe", session.slot.team.name, 12, true);
      line("Categoria", session.slot.team.category.name);
      line("Fase", session.slot.phase.name);
      line("Mesa / palco", session.slot.station.name);
      line("Horario", session.slot.scheduledAt.toLocaleString("pt-BR"));
      line("Estado", session.state);
      y -= 5;
      line("RESPONSAVEIS", undefined, 12, true);
      line("Operador", session.operatorName);
      line("Anunciador", session.announcerName);
      line("Pontuador", session.scorerName);
      line("Tablet", session.terminalId);
      if (session.judgeScores.length) {
        y -= 5;
        line("JURADOS", undefined, 12, true);
        for (const judge of session.judgeScores) {
          line(judge.judgeName, `${judge.total.toFixed(2)} pontos (${judge.role})`);
          try {
            for (const [key, value] of flatten(JSON.parse(judge.scorecard), "ficha"))
              line(`  ${key}`, value, 8);
          } catch {
            line("  ficha", judge.scorecard, 8);
          }
        }
        line("Consenso", session.consensusTotal?.toFixed(2));
        line("Confirmado por", session.consensusConfirmedBy);
      }
      y -= 5;
      line("RESULTADO REGISTRADO", undefined, 12, true);
      for (const score of scores) line(`Coluna ${score.columnIndex + 1}`, score.value);
      line("Decisao artistica", session.artisticDecision);
      if (session.artisticDecisionReason) line("Fundamentacao", session.artisticDecisionReason);
      y -= 5;
      line("DADOS DA FICHA", undefined, 12, true);
      try {
        for (const [key, value] of flatten(JSON.parse(session.scorecard))) line(key, value);
      } catch {
        line("Conteudo", session.scorecard);
      }
      y -= 20;
      line("Assinatura da equipe: __________________________________________");
      y -= 12;
      line("Assinatura da arbitragem: _____________________________________");
      line("Gerada em", new Date().toLocaleString("pt-BR"));
      await ctx.prisma.auditLog.create({
        data: {
          eventId: session.slot.eventId,
          action: "SESSION_SCORECARD_PDF_EXPORTED",
          entityType: "EvaluationSession",
          entityId: session.id,
          teamId: session.slot.teamId,
          stationId: session.slot.stationId,
          actorRole: ctx.user.role,
        },
      });
      return Buffer.from(await pdf.save()).toString("base64");
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
        const rules = await validateEventRules(input.eventId, ctx.prisma);
        if (!rules.approved)
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "As regras precisam estar validadas e homologadas antes dos resultados.",
          });
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
    try {
      return await syncEventToOlimpo(eventId, ctx.user.role);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: `Falha ao sincronizar com o Olimpo: ${message}`,
      });
    }
  }),
});
