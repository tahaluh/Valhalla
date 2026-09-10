import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("API tRPC percorre abertura, chamada, rascunho e início em banco real", async () => {
  const directory = mkdtempSync(join(tmpdir(), "valhalla-api-test-"));
  process.env.DATABASE_URL = `file:${join(directory, "integration.db")}`;
  process.env.SESSION_SECRET = "integration-test-secret-with-at-least-32-characters";
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });
  execFileSync("npm", ["run", "prisma:seed"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  });
  const [{ appRouter }, { prisma }] = await Promise.all([
    import("../src/server/trpc/router"),
    import("../src/infrastructure/database/prisma"),
  ]);
  const event = await prisma.event.findFirstOrThrow({ where: { isActive: true } });
  const caller = appRouter.createCaller({
    prisma,
    req: new Request("http://localhost/api/trpc"),
    session: {
      user: { role: "ADMIN", eventId: event.id },
      save: async () => undefined,
      destroy: () => undefined,
      updateConfig: () => undefined,
    },
  });
  const phases = await caller.operation.listPhases(event.id);
  assert.equal(phases.filter((phase) => phase.type === "PRACTICE_ROUND").length, 3);
  assert.equal(phases.filter((phase) => phase.type === "EXTRA_ROUND").length, 1);
  const validation = await caller.robustness.validateRules(event.id);
  assert.ok(validation.checks.some((check) => check.key === "arena-maximum"));
  assert.equal(validation.hash.length, 64);
  assert.equal(
    validation.valid,
    true,
    validation.checks
      .filter((check) => !check.ok)
      .map((check) => `${check.label}: ${check.detail}`)
      .join(" | "),
  );
  await caller.robustness.approveRules({
    eventId: event.id,
    approvedBy: "Coordenação de teste",
    reference: "Regras OBR 2026",
    organizerApproved: true,
    normalizationApproved: true,
    surpriseApproved: true,
  });
  assert.equal((await caller.robustness.validateRules(event.id)).approved, true);

  const practicePhase = phases.find((phase) => phase.type === "PRACTICE_ROUND");
  assert.ok(practicePhase);
  const [rescueCategory, station] = await Promise.all([
    prisma.category.findFirstOrThrow({ where: { eventId: event.id, type: "RESCUE" } }),
    prisma.evaluationStation.findFirstOrThrow({
      where: { eventId: event.id, type: "PRACTICE_ARENA" },
    }),
  ]);
  const team = await prisma.team.create({
    data: {
      name: "Equipe API E2E",
      institution: "Instituição de teste",
      city: "João Pessoa",
      state: "PB",
      categoryId: rescueCategory.id,
    },
  });
  const slot = await prisma.scheduleSlot.create({
    data: {
      eventId: event.id,
      teamId: team.id,
      phaseId: practicePhase.id,
      stationId: station.id,
      scheduledAt: new Date("2026-09-10T18:00:00.000Z"),
      order: 999,
    },
  });
  await caller.operation.setPhaseStatus({ phaseId: practicePhase.id, status: "OPEN" });
  const referee = appRouter.createCaller({
    prisma,
    req: new Request("http://localhost/api/trpc"),
    session: {
      user: { role: "REFEREE", eventId: event.id },
      save: async () => undefined,
      destroy: () => undefined,
      updateConfig: () => undefined,
    },
  });
  const called = await referee.operation.transitionSession({
    slotId: slot.id,
    state: "CALLED",
    operatorName: "Teste de integração",
    announcerName: "Anunciador teste",
    scorerName: "Pontuador teste",
  });
  assert.equal(called.session.callCount, 1);
  const draft = await referee.operation.saveScorecardDraft({
    slotId: slot.id,
    scorecard: JSON.stringify({ card: { startTile: true } }),
    expectedVersion: called.session.version,
    operatorName: "Teste de integração",
  });
  assert.equal(draft.saved, true);
  assert.ok(draft.saved);
  const started = await referee.operation.transitionSession({
    slotId: slot.id,
    state: "IN_PROGRESS",
    expectedVersion: draft.session.version,
    operatorName: "Teste de integração",
    announcerName: "Anunciador teste",
    scorerName: "Pontuador teste",
  });
  assert.equal(started.session.state, "IN_PROGRESS");
  const scoreInput = {
    teamId: team.id,
    categoryId: rescueCategory.id,
    arenaId: station.arenaId ?? undefined,
    scores: [{ columnIndex: 0, value: 100, data: JSON.stringify({ total: 100 }) }],
  };
  await referee.score.submitBatch(scoreInput);
  await referee.score.submitBatch(scoreInput);
  assert.equal(
    await prisma.scoreRevision.count({ where: { score: { teamId: team.id } } }),
    1,
    "o mesmo comando reenviado não pode virar correção",
  );
  assert.ok(
    (await prisma.auditLog.count({ where: { entityId: started.session.id } })) >= 2,
    "transições operacionais devem permanecer auditadas",
  );
  const scorecardPdf = await caller.robustness.exportSessionScorecardPdf(started.session.id);
  assert.equal(Buffer.from(scorecardPdf, "base64").subarray(0, 4).toString(), "%PDF");

  const [round2, round3, challengeStation] = await Promise.all([
    prisma.phase.findFirstOrThrow({
      where: { eventId: event.id, type: "PRACTICE_ROUND", sequence: 2 },
    }),
    prisma.phase.findFirstOrThrow({
      where: { eventId: event.id, type: "PRACTICE_ROUND", sequence: 3 },
    }),
    prisma.evaluationStation.findFirstOrThrow({
      where: { eventId: event.id, type: "CHALLENGE_TABLE" },
    }),
  ]);
  const challengeSlots = await Promise.all(
    [round2, round3].map((phase, index) =>
      prisma.scheduleSlot.create({
        data: {
          eventId: event.id,
          teamId: team.id,
          phaseId: phase.id,
          stationId: challengeStation.id,
          scheduledAt: new Date(`2026-09-10T1${index + 4}:00:00.000Z`),
          order: 1100 + index,
        },
      }),
    ),
  );
  const firstDraw = await referee.operation.drawSurpriseChallenge({
    slotId: challengeSlots[0]!.id,
    operatorName: "Juiz do desafio",
  });
  assert.equal(firstDraw.surpriseStatus, "DRAWN");
  assert.equal(firstDraw.surpriseJudgeName, "Juiz do desafio");
  await assert.rejects(
    referee.operation.drawSurpriseChallenge({
      slotId: challengeSlots[0]!.id,
      operatorName: "Outro juiz",
    }),
    /já realizou o sorteio/,
  );
  const redrawn = await referee.operation.drawSurpriseChallenge({
    slotId: challengeSlots[0]!.id,
    operatorName: "Juiz do desafio",
    regenerate: true,
  });
  assert.notEqual(redrawn.surpriseChallengeText, firstDraw.surpriseChallengeText);
  const secondDraw = await referee.operation.drawSurpriseChallenge({
    slotId: challengeSlots[1]!.id,
    operatorName: "Juiz do desafio",
  });
  assert.notEqual(secondDraw.surpriseChallengeText, firstDraw.surpriseChallengeText);
  assert.notEqual(secondDraw.surpriseChallengeText, redrawn.surpriseChallengeText);
  const offlineTeam = await prisma.team.create({
    data: {
      name: "Equipe sorteio offline",
      institution: "Instituição de teste",
      city: "João Pessoa",
      state: "PB",
      categoryId: rescueCategory.id,
    },
  });
  const offlineSlot = await prisma.scheduleSlot.create({
    data: {
      eventId: event.id,
      teamId: offlineTeam.id,
      phaseId: round2.id,
      stationId: challengeStation.id,
      scheduledAt: new Date("2026-09-10T16:00:00.000Z"),
      order: 1200,
    },
  });
  const officialBank = JSON.parse(event.surpriseChallengeBank) as {
    LEVEL1: string[];
    LEVEL2: string[];
  };
  const offlineDraw = await referee.operation.drawSurpriseChallenge({
    slotId: offlineSlot.id,
    operatorName: "Juiz offline",
    requestedChallenge: officialBank.LEVEL1[0],
    offlineDrawnAt: "2026-09-10T15:30:00.000Z",
  });
  assert.equal(offlineDraw.surpriseChallengeText, officialBank.LEVEL1[0]);
  assert.equal(offlineDraw.surpriseDrawnAt?.toISOString(), "2026-09-10T15:30:00.000Z");
  const absentTeam = await prisma.team.create({
    data: {
      name: "Equipe ausente no desafio",
      institution: "Instituição de teste",
      city: "João Pessoa",
      state: "PB",
      categoryId: rescueCategory.id,
    },
  });
  const absentSlot = await prisma.scheduleSlot.create({
    data: {
      eventId: event.id,
      teamId: absentTeam.id,
      phaseId: round2.id,
      stationId: challengeStation.id,
      scheduledAt: new Date("2026-09-10T17:00:00.000Z"),
      order: 1201,
    },
  });
  const missed = await referee.operation.setSurpriseDecision({
    slotId: absentSlot.id,
    status: "MISSED",
    operatorName: "Juiz do desafio",
  });
  assert.equal(missed.surpriseStatus, "MISSED");
  assert.equal(missed.surpriseEligible, false);
  const demonstrated = await referee.operation.saveScorecard({
    slotId: challengeSlots[0]!.id,
    scorecard: JSON.stringify({ card: { surpriseChallenge: true } }),
    expectedVersion: redrawn.version,
    operatorName: "Operador da arena",
    announcerName: "Anunciador teste",
    scorerName: "Pontuador teste",
  });
  assert.equal(demonstrated.surpriseStatus, "DEMONSTRATED");
  assert.equal(demonstrated.surpriseJudgeName, "Juiz do desafio");
  assert.ok(
    (await prisma.auditLog.count({
      where: { entityId: firstDraw.id, action: "SURPRISE_CHALLENGE_DRAWN" },
    })) === 1,
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { entityId: firstDraw.id, action: "SURPRISE_CHALLENGE_REDRAWN" },
    }),
    1,
  );
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});
