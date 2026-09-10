import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_CATEGORIES, getCategoryPreset } from "../src/domain/entities/category";
import { TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES } from "../src/domain/entities/surprise-challenge";
import { DEFAULT_RESCUE_RULESET_2026 } from "../src/domain/entities/ruleset";

const prisma = new PrismaClient();
const TEST_PASSWORD = "teste123";

const TEAM_NAMES: Record<string, Array<[string, string, string, string]>> = {
  "Resgate Nível 1": [
    ["Cariri Bots", "E.M. Ariano Suassuna", "Campina Grande", "PB"],
    ["Mandacaru Tech", "E.E. João Pessoa", "João Pessoa", "PB"],
    ["Borborema Robotics", "Escola Cidadã Integral", "Campina Grande", "PB"],
    ["Sertão Autônomo", "Instituto Educacional do Sertão", "Patos", "PB"],
  ],
  "Resgate Nível 2": [
    ["Parahyba Rescue", "Instituto Litoral", "João Pessoa", "PB"],
    ["Fênix do Cariri", "Escola Técnica Estadual", "Monteiro", "PB"],
    ["Picuí Robótica", "Colégio do Seridó", "Picuí", "PB"],
    ["Cangaço Mecatrônico", "IFPB", "Cajazeiras", "PB"],
  ],
  "Artística Nível 1": [
    ["Cordel Digital", "E.M. Augusto dos Anjos", "João Pessoa", "PB"],
    ["ForróBot", "Colégio Vale do Paraíba", "Santa Rita", "PB"],
    ["Bonecos de Código", "Escola do Brejo", "Bananeiras", "PB"],
    ["Luz da Borborema", "Colégio José Lins", "Campina Grande", "PB"],
  ],
  "Artística Nível 2": [
    ["Armorial Robotics", "Instituto Paraibano", "João Pessoa", "PB"],
    ["Cabaceiras Tech", "E.C.I.T. do Cariri", "Cabaceiras", "PB"],
    ["Ciranda Autônoma", "Colégio Litoral Norte", "Mamanguape", "PB"],
    ["Nação Robótica", "IFPB", "Sousa", "PB"],
  ],
};

function at(day: number, hour: number, minute = 0) {
  return new Date(Date.UTC(2026, 8, day, hour + 3, minute));
}

async function createScore(
  team: { id: string; categoryId: string },
  columnIndex: number,
  value: number,
  arenaId?: string,
) {
  const score = await prisma.score.create({
    data: {
      teamId: team.id,
      categoryId: team.categoryId,
      columnIndex,
      value,
      publicValue: value,
      arenaId,
      submittedBy: "REFEREE",
    },
  });
  await prisma.scoreRevision.create({
    data: {
      scoreId: score.id,
      nextValue: value,
      nextArenaId: arenaId,
      changedBy: "REFEREE",
    },
  });
}

async function main() {
  console.log("🌱 Criando banco demonstrativo OBR 2026...");
  console.log("⚠️  O seed substitui todos os eventos do banco selecionado.");
  await prisma.event.deleteMany();

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const event = await prisma.event.create({
    data: {
      name: "OBR Regional Paraíba 2026 · Demonstração",
      description:
        "Evento completo para testar operação por mesa, fichas, ranking, auditoria e telão.",
      location: "Centro de Convenções · João Pessoa/PB",
      startDate: at(9, 8),
      endDate: at(10, 18),
      isActive: true,
      adminPassword: passwordHash,
      refereePassword: passwordHash,
      secretariatPassword: passwordHash,
      surpriseChallenge: true,
      surpriseChallengeBank: JSON.stringify(TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES),
      rulesUpdateNotice: "Ambiente demonstrativo configurado para as regras presenciais OBR 2026.",
      publicRankingMode: "LIVE",
      resultsStatus: "PROVISIONAL",
    },
  });

  await prisma.referee.createMany({
    data: [
      "Ana Beatriz Souza",
      "Bruno Henrique Lima",
      "Camila Ferreira",
      "Daniel Santos",
      "Eduarda Nascimento",
      "Felipe Oliveira",
    ].map((name) => ({ eventId: event.id, name })),
  });

  const arenaDefinitions = [
    {
      name: "Arena Azul",
      difficulty: "EASY",
      tiles: [5, 4, 6],
      seesaws: 1,
      intersections: 2,
      obstacles: 1,
      ramps: 2,
      gaps: 1,
      speedBumps: 2,
    },
    {
      name: "Arena Verde",
      difficulty: "MEDIUM",
      tiles: [4, 5, 5, 1],
      seesaws: 1,
      intersections: 1,
      obstacles: 2,
      ramps: 1,
      gaps: 2,
      speedBumps: 1,
    },
    {
      name: "Arena Amarela",
      difficulty: "HARD",
      tiles: [6, 5, 4],
      seesaws: 2,
      intersections: 2,
      obstacles: 1,
      ramps: 1,
      gaps: 1,
      speedBumps: 1,
    },
  ];
  const arenas = [];
  for (const [order, definition] of arenaDefinitions.entries()) {
    const { tiles, ...configuration } = definition;
    arenas.push(
      await prisma.arena.create({
        data: {
          ...configuration,
          eventId: event.id,
          order,
          checkpointCount: tiles.length,
          checkpointTiles: JSON.stringify(tiles),
          rulesetName: "OBR Prática Regional/Estadual 2026",
          rulesetVersion: "2026 v1.2",
          scoringRules: JSON.stringify(DEFAULT_RESCUE_RULESET_2026),
        },
      }),
    );
  }
  await prisma.scheduleBlackout.createMany({
    data: [
      {
        eventId: event.id,
        name: "Intervalo da manhã",
        startsAt: at(9, 10, 30),
        endsAt: at(9, 10, 50),
      },
      { eventId: event.id, name: "Almoço", startsAt: at(9, 12), endsAt: at(9, 13, 30) },
    ],
  });
  const arenaStations = [];
  for (const arena of arenas) {
    arenaStations.push(
      await prisma.evaluationStation.create({
        data: {
          eventId: event.id,
          arenaId: arena.id,
          name: arena.name,
          type: "PRACTICE_ARENA",
          order: arena.order,
        },
      }),
    );
  }
  const interviewStations = await Promise.all(
    ["Entrevista 1", "Entrevista 2"].map((name, index) =>
      prisma.evaluationStation.create({
        data: { eventId: event.id, name, type: "INTERVIEW_TABLE", order: 10 + index },
      }),
    ),
  );
  const stage = await prisma.evaluationStation.create({
    data: { eventId: event.id, name: "Palco Principal", type: "STAGE", order: 20 },
  });
  await prisma.evaluationStation.create({
    data: {
      eventId: event.id,
      name: "Mesa de Desafio Surpresa",
      type: "CHALLENGE_TABLE",
      order: 30,
    },
  });

  const phaseDefinitions = [
    ["Prática · Rodada 1", "PRACTICE_ROUND", 1, 300, 120],
    ["Prática · Rodada 2", "PRACTICE_ROUND", 2, 300, 120],
    ["Prática · Rodada 3", "PRACTICE_ROUND", 3, 300, 120],
    ["Artística · Entrevista", "INTERVIEW", 4, 600, 0],
    ["Artística · Apresentação 1", "PERFORMANCE", 5, 420, 0],
    ["Artística · Apresentação 2", "PERFORMANCE", 6, 420, 0],
    ["Artística · Apresentação extra", "EXTRA_ROUND", 7, 420, 0],
  ] as const;
  const phases = [];
  for (const [name, type, sequence, durationSeconds, calibrationSeconds] of phaseDefinitions) {
    phases.push(
      await prisma.phase.create({
        data: {
          eventId: event.id,
          name,
          type,
          sequence,
          durationSeconds,
          calibrationSeconds,
          operationalStatus: "OPEN",
          openedAt: new Date(),
        },
      }),
    );
  }

  const categories = [];
  const teamsByType: Record<
    string,
    Array<{ id: string; name: string; institution: string; categoryId: string }>
  > = { RESCUE: [], ARTISTIC: [] };
  for (const [order, defaultCategory] of DEFAULT_CATEGORIES.entries()) {
    const preset = getCategoryPreset(defaultCategory.type);
    const category = await prisma.category.create({
      data: {
        eventId: event.id,
        name: defaultCategory.name,
        type: defaultCategory.type,
        competitionLevel: defaultCategory.competitionLevel,
        order,
        scoringFormula: preset.scoringFormula,
      },
    });
    categories.push(category);
    await prisma.scoreColumn.createMany({
      data: preset.columns.map((name, columnOrder) => ({
        categoryId: category.id,
        name,
        order: columnOrder,
      })),
    });
    for (const [name, institution, city, state] of TEAM_NAMES[category.name] ?? []) {
      const team = await prisma.team.create({
        data: {
          categoryId: category.id,
          name,
          institution,
          city,
          state,
          attendanceConfirmed: true,
        },
      });
      teamsByType[category.type]!.push(team);
    }
  }

  for (const round of phases.filter((phase) => phase.type === "PRACTICE_ROUND")) {
    const roundIndex = round.sequence - 1;
    for (const [index, team] of teamsByType.RESCUE.entries()) {
      const station = arenaStations[(index + roundIndex) % arenaStations.length]!;
      const scheduledAt =
        roundIndex < 2
          ? at(9, roundIndex === 0 ? 9 : 14, Math.floor(index / 3) * 12)
          : at(10, 9, Math.floor(index / 3) * 12);
      const slot = await prisma.scheduleSlot.create({
        data: {
          eventId: event.id,
          phaseId: round.id,
          stationId: station.id,
          teamId: team.id,
          scheduledAt,
          order: index,
          status: roundIndex === 0 ? "FINALIZED" : "SCHEDULED",
        },
      });
      if (roundIndex === 0) {
        const score = 85 + ((index * 37) % 190);
        const duration = 190 + ((index * 17) % 100);
        const session = await prisma.evaluationSession.create({
          data: {
            slotId: slot.id,
            state: "FINALIZED",
            calledAt: new Date(scheduledAt.getTime() - 120_000),
            startedAt: scheduledAt,
            finishedAt: new Date(scheduledAt.getTime() + duration * 1000),
            timerAccumulatedSeconds: duration,
            operatorName: "Ana Beatriz Souza",
            announcerName: "Bruno Henrique Lima",
            scorerName: "Camila Ferreira",
            surpriseEligible: false,
            surpriseStatus: "PENDING",
            scorecard: JSON.stringify({ demo: true, total: score, round: 1 }),
          },
        });
        await createScore(team, 0, score, arenas[station.order]?.id);
        await createScore(team, 1, duration, arenas[station.order]?.id);
        await prisma.auditLog.create({
          data: {
            eventId: event.id,
            action: "SESSION_FINALIZED",
            entityType: "EvaluationSession",
            entityId: session.id,
            teamId: team.id,
            stationId: station.id,
            operatorName: "Ana Beatriz Souza",
            actorRole: "REFEREE",
            after: JSON.stringify({ score, duration }),
          },
        });
      }
    }
  }

  const artisticTeams = teamsByType.ARTISTIC;
  const interview = phases.find((phase) => phase.type === "INTERVIEW")!;
  const performances = phases.filter((phase) => phase.type === "PERFORMANCE");
  const extraPerformance = phases.find((phase) => phase.type === "EXTRA_ROUND")!;
  for (const [index, team] of artisticTeams.entries()) {
    const interviewStation = interviewStations[index % interviewStations.length]!;
    const interviewAt = at(9, 9, Math.floor(index / 2) * 15);
    await prisma.scheduleSlot.create({
      data: {
        eventId: event.id,
        phaseId: interview.id,
        stationId: interviewStation.id,
        teamId: team.id,
        scheduledAt: interviewAt,
        order: index,
        status: "FINALIZED",
        session: {
          create: {
            state: "FINALIZED",
            startedAt: interviewAt,
            finishedAt: new Date(interviewAt.getTime() + 540_000),
            timerAccumulatedSeconds: 540,
            operatorName: "Daniel Santos",
            announcerName: "Eduarda Nascimento",
            scorerName: "Felipe Oliveira",
            scorecard: JSON.stringify({ demo: true, type: "INTERVIEW" }),
          },
        },
      },
    });
    await createScore(team, 0, 65 + ((index * 7) % 31));
    await createScore(team, 4, index % 6);

    for (const [performanceIndex, performance] of performances.entries()) {
      const performanceAt = at(9 + performanceIndex, 13, index * 10);
      const finalized = performanceIndex === 0 && index < 5;
      await prisma.scheduleSlot.create({
        data: {
          eventId: event.id,
          phaseId: performance.id,
          stationId: stage.id,
          teamId: team.id,
          scheduledAt: performanceAt,
          order: index,
          status: finalized ? "FINALIZED" : "SCHEDULED",
          ...(finalized
            ? {
                session: {
                  create: {
                    state: "FINALIZED",
                    calledAt: new Date(performanceAt.getTime() - 90_000),
                    startedAt: performanceAt,
                    finishedAt: new Date(performanceAt.getTime() + 260_000),
                    timerAccumulatedSeconds: 260,
                    operatorName: "Daniel Santos",
                    announcerName: "Eduarda Nascimento",
                    scorerName: "Felipe Oliveira",
                    scorecard: JSON.stringify({ demo: true, type: "PERFORMANCE" }),
                  },
                },
              }
            : {}),
        },
      });
      if (finalized) await createScore(team, 1, 70 + ((index * 9) % 27));
    }
  }
  for (const [index, team] of artisticTeams.slice(0, 2).entries()) {
    await prisma.scheduleSlot.create({
      data: {
        eventId: event.id,
        phaseId: extraPerformance.id,
        stationId: stage.id,
        teamId: team.id,
        scheduledAt: at(10, 16, index * 10),
        order: index,
      },
    });
  }

  const terminal = await prisma.terminal.create({
    data: { eventId: event.id, deviceKey: "tablet-demo-arena-azul", name: "Tablet 01" },
  });
  await prisma.terminalUsage.create({
    data: {
      terminalId: terminal.id,
      stationId: arenaStations[0]!.id,
      operatorName: "Ana Beatriz Souza",
      endedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: {
      eventId: event.id,
      action: "TERMINAL_CHECKED_IN",
      entityType: "Terminal",
      entityId: terminal.id,
      terminalId: terminal.id,
      stationId: arenaStations[0]!.id,
      operatorName: "Ana Beatriz Souza",
      actorRole: "REFEREE",
    },
  });

  const mainScreen = await prisma.displayScreen.create({
    data: { eventId: event.id, name: "Ranking e informações", slug: "ranking" },
  });
  await prisma.displayView.createMany({
    data: [
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Ranking · Resgate Nível 1",
        type: "RANKING",
        order: 0,
        durationSeconds: 18,
        config: JSON.stringify({ categoryId: categories[0]!.id, theme: "OBR", maxItems: 10 }),
      },
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Próximas atividades",
        type: "SCHEDULE",
        order: 1,
        durationSeconds: 18,
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
        name: "Bem-vindos",
        type: "ANNOUNCEMENT",
        order: 4,
        durationSeconds: 12,
        config: JSON.stringify({
          title: "Bem-vindos à OBR Paraíba 2026!",
          message: "Chamadas e alterações de horário serão exibidas neste telão.",
          theme: "OBR",
        }),
      },
      {
        eventId: event.id,
        screenId: mainScreen.id,
        name: "Ranking · Artística Nível 1",
        type: "RANKING",
        order: 5,
        durationSeconds: 18,
        config: JSON.stringify({ categoryId: categories[2]!.id, theme: "DARK", maxItems: 10 }),
      },
    ],
  });

  await prisma.formalAppeal.create({
    data: {
      eventId: event.id,
      teamId: teamsByType.RESCUE[0]!.id,
      title: "Exemplo de recurso encerrado",
      description: "Registro demonstrativo para visualizar o fluxo de recursos formais.",
      status: "REJECTED",
      decision: "Pontuação e vídeo conferidos; resultado mantido.",
      deadlineAt: at(10, 12),
    },
  });

  console.log("✅ Seed demonstrativo criado com sucesso.");
  console.log(`   Evento: ${event.name}`);
  console.log(`   Equipes: ${teamsByType.RESCUE.length + teamsByType.ARTISTIC.length}`);
  console.log(`   Senha ADMIN / REFEREE / SECRETARIAT: ${TEST_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error("❌ Falha no seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
