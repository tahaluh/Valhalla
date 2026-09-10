import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateArtisticScore,
  normalizeArtisticExtraScore,
  sumArtisticPresentationPenalties,
  findArtisticTiebreakGroups,
} from "../src/domain/entities/artistic";

test("servidor pode recalcular a ficha artística sem confiar no total do navegador", () => {
  assert.equal(
    calculateArtisticScore("INTERVIEW", {
      software: 20,
      hardware: 30,
      complexity: 10,
      engineering: 20,
      teamwork: 8,
      resources: 12,
      interviewDeduction: 4,
      visual: 0,
      interaction: 0,
      features: [0, 0, 0, 0],
      interventions: 0,
      restarts: 0,
      overtimeBlocks: 0,
      presentationSeconds: 0,
      sustainability: 0,
    }).total,
    96,
  );
});

test("desempate automático considera os critérios anteriores à rodada extra", () => {
  assert.deepEqual(
    findArtisticTiebreakGroups([
      { teamId: "a", criteria: [90, -150, 3, -70] },
      { teamId: "b", criteria: [90, -150, 3, -80] },
      { teamId: "c", criteria: [89, -160, 0, 0] },
    ]),
    [["a", "b"]],
  );
});

test("normalização da apresentação extra é configurável e estável", () => {
  assert.equal(normalizeArtisticExtraScore(83.333, 0.9), 75);
});

test("penalidades das duas apresentações são acumuladas", () => {
  assert.equal(
    sumArtisticPresentationPenalties([
      JSON.stringify({ result: { penalties: 6 } }),
      JSON.stringify({ result: { penalties: 9 } }),
      "inválido",
    ]),
    15,
  );
});
