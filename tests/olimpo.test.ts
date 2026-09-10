import test from "node:test";
import assert from "node:assert/strict";
import { buildOlimpoSteps } from "../src/server/services/olimpo.service";
import { ARTISTIC_SCORING_FORMULA } from "../src/domain/entities/category";

test("Olimpo separa etapas e preserva a ficha no dataMap", () => {
  const steps = buildOlimpoSteps([
    {
      scoringFormula: ARTISTIC_SCORING_FORMULA,
      scoreColumns: [{ name: "Entrevista", order: 0 }],
      teams: [
        {
          id: "local-a",
          name: "Equipe A",
          institution: "Escola",
          city: "João Pessoa",
          state: "PB",
          externalId: "olimpo-a",
          externalEventToken: "token",
          externalStepId: "etapa-a",
          scores: [{ columnIndex: 0, value: 80, data: '{"ficha":"consenso"}' }],
        },
        {
          id: "local-b",
          name: "Equipe B",
          institution: "Escola",
          city: "Campina Grande",
          state: "PB",
          externalId: "olimpo-b",
          externalEventToken: "token",
          externalStepId: "etapa-b",
          scores: [],
        },
      ],
    },
  ]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0]?.scores[0]?.dataMap.Entrevista, '{"ficha":"consenso"}');
  assert.equal(steps[1]?.id, "etapa-b");
});
