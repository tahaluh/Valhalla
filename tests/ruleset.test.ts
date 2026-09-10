import test from "node:test";
import assert from "node:assert/strict";
import { calculateRescueScore, DEFAULT_RESCUE_RULESET_2026 } from "../src/domain/entities/ruleset";

test("checkpoint alcançado e não alcançado preservam falhas distintas", () => {
  const result = calculateRescueScore(DEFAULT_RESCUE_RULESET_2026, {
    startTile: true,
    checkpoints: [
      { tiles: 2, attempt: 1, status: "REACHED" },
      { tiles: 3, attempt: 3, status: "NOT_REACHED" },
      { tiles: 1, attempt: 3, status: "REACHED" },
    ],
    challenges: {},
    exitReached: true,
    correctVictims: 0,
    switchedVictims: 0,
    surpriseChallenge: false,
  });
  assert.equal(result.failures, 5);
  assert.equal(result.base, 51);
});

test("multiplicadores de vítimas e desafio são aplicados sobre a base", () => {
  const result = calculateRescueScore(DEFAULT_RESCUE_RULESET_2026, {
    startTile: true,
    checkpoints: [],
    challenges: { seesaws: 1 },
    exitReached: false,
    correctVictims: 1,
    switchedVictims: 0,
    surpriseChallenge: true,
  });
  assert.equal(result.total, 49);
});

test("4ª tentativa não pontua ladrilhos e desconta quatro falhas da saída", () => {
  const result = calculateRescueScore(DEFAULT_RESCUE_RULESET_2026, {
    startTile: false,
    checkpoints: [{ tiles: 2, attempt: 4, status: "REACHED" }],
    challenges: {},
    exitReached: true,
    correctVictims: 0,
    switchedVictims: 0,
    surpriseChallenge: false,
  });
  assert.equal(result.failures, 4);
  assert.equal(result.base, 40);
  assert.equal(result.total, 40);
});
