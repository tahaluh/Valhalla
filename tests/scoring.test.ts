import test from "node:test";
import assert from "node:assert/strict";
import { applyFormula, rankTeams } from "../src/application/services/scoring.service";
import { RESCUE_SCORING_FORMULA, ARTISTIC_SCORING_FORMULA } from "../src/domain/entities/category";

test("Resgate soma as duas melhores entre três rodadas", () => {
  const [total] = applyFormula(RESCUE_SCORING_FORMULA, [100, 210, 80, 180, 120, 250]);
  assert.equal(total, 220);
});

test("Resgate usa os três tempos no primeiro desempate e 300 para ausente/desistência", () => {
  const rows = rankTeams(
    [
      {
        teamId: "a",
        teamName: "A",
        institution: "I",
        city: "C",
        state: "PE",
        scores: [100, 200, 100, 200, 0, 300],
      },
      {
        teamId: "b",
        teamName: "B",
        institution: "I",
        city: "C",
        state: "PE",
        scores: [100, 210, 100, 210, 0, 300],
      },
    ],
    RESCUE_SCORING_FORMULA,
  );
  assert.equal(rows[0]?.teamId, "a");
  assert.equal(rows[0]?.finalScore, 200);
});

test("Artística combina entrevista, melhor apresentação e sustentabilidade", () => {
  const [total] = applyFormula(ARTISTIC_SCORING_FORMULA, [80, 70, 90, 6, 5]);
  assert.equal(total, 91);
});

test("Artística usa apresentação extra normalizada apenas como último desempate", () => {
  const rows = rankTeams(
    [
      {
        teamId: "a",
        teamName: "A",
        institution: "I",
        city: "C",
        state: "PE",
        scores: [80, 90, 70, 3, 0, 75],
      },
      {
        teamId: "b",
        teamName: "B",
        institution: "I",
        city: "C",
        state: "PE",
        scores: [80, 90, 70, 3, 0, 81],
      },
    ],
    ARTISTIC_SCORING_FORMULA,
  );
  assert.equal(rows[0]?.teamId, "b");
});
