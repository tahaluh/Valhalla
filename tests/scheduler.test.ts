import test from "node:test";
import assert from "node:assert/strict";
import { generateAdvancedSchedule } from "../src/domain/entities/scheduler";

const phases = [
  { id: "r1", name: "Rodada 1", startsAt: new Date("2026-09-09T09:00:00Z") },
  { id: "r2", name: "Rodada 2", startsAt: new Date("2026-09-09T12:00:00Z") },
  { id: "r3", name: "Rodada 3", startsAt: new Date("2026-09-09T15:00:00Z") },
];
const stations = [
  { id: "easy", name: "Fácil", difficulty: "EASY" as const },
  { id: "medium", name: "Média", difficulty: "MEDIUM" as const },
  { id: "hard", name: "Difícil", difficulty: "HARD" as const },
];

test("cada equipe disputa uma rodada em cada nível de arena", () => {
  const result = generateAdvancedSchedule({
    teams: Array.from({ length: 6 }, (_, index) => ({ id: `t${index}`, name: `Equipe ${index}` })),
    phases,
    stations,
    intervalSeconds: 600,
    blackouts: [],
  });
  for (let index = 0; index < 6; index++) {
    const levels = result.slots
      .filter((slot) => slot.teamId === `t${index}`)
      .map((slot) => slot.difficulty)
      .sort();
    assert.deepEqual(levels, ["EASY", "HARD", "MEDIUM"]);
  }
});

test("nenhuma sessão começa ou atravessa pausa configurada", () => {
  const blackout = {
    startsAt: new Date("2026-09-09T09:05:00Z"),
    endsAt: new Date("2026-09-09T09:30:00Z"),
  };
  const result = generateAdvancedSchedule({
    teams: [{ id: "t1", name: "Equipe" }],
    phases,
    stations,
    intervalSeconds: 600,
    blackouts: [blackout],
  });
  const first = result.slots.find((slot) => slot.phaseId === "r1")!;
  assert.equal(first.scheduledAt.toISOString(), blackout.endsAt.toISOString());
});

test("detecta quando uma rodada começa antes de a anterior terminar", () => {
  const crowded = phases.map((phase, index) => ({
    ...phase,
    startsAt: new Date(Date.UTC(2026, 8, 9, 9 + index)),
  }));
  const result = generateAdvancedSchedule({
    teams: Array.from({ length: 30 }, (_, index) => ({ id: `t${index}`, name: `Equipe ${index}` })),
    phases: crowded,
    stations,
    intervalSeconds: 600,
    blackouts: [],
  });
  assert.ok(result.conflicts.length > 0);
});
