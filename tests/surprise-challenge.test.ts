import test from "node:test";
import assert from "node:assert/strict";
import {
  TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES,
  chooseSurpriseChallenge,
  getSurpriseTiming,
} from "../src/domain/entities/surprise-challenge";

test("banco Tournamenter 2026 mantém os 15 desafios N1 e 30 N2", () => {
  assert.equal(TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES.LEVEL1.length, 15);
  assert.equal(TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES.LEVEL2.length, 30);
});

test("sorteio evita repetição enquanto houver alternativa", () => {
  const bank = ["A", "B", "C"];
  assert.equal(
    chooseSurpriseChallenge(bank, ["A"], () => 0),
    "B",
  );
  assert.equal(
    chooseSurpriseChallenge(bank, ["A", "B", "C"], () => 0),
    "A",
  );
});

test("janela operacional destaca aproximação, horário e atraso", () => {
  const scheduledAt = new Date("2026-09-10T13:00:00.000Z");
  assert.equal(
    getSurpriseTiming(scheduledAt, new Date("2026-09-10T12:19:00.000Z")).state,
    "WAITING",
  );
  assert.equal(
    getSurpriseTiming(scheduledAt, new Date("2026-09-10T12:25:00.000Z")).state,
    "UPCOMING",
  );
  assert.equal(getSurpriseTiming(scheduledAt, new Date("2026-09-10T12:31:00.000Z")).state, "DUE");
  assert.equal(
    getSurpriseTiming(scheduledAt, new Date("2026-09-10T12:36:00.000Z")).state,
    "OVERDUE",
  );
});
