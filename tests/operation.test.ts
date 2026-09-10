import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPublicationSnapshot,
  canStartPhase,
  hasVersionConflict,
  requiresAdminCorrection,
} from "../src/domain/entities/operation";

test("somente rodada aberta aceita início operacional", () => {
  assert.equal(canStartPhase("OPEN"), true);
  assert.equal(canStartPhase("CLOSED"), false);
  assert.equal(canStartPhase("SUSPENDED"), false);
});

test("controle otimista detecta concorrência de tablets", () => {
  assert.equal(hasVersionConflict(8, 7), true);
  assert.equal(hasVersionConflict(8, 8), false);
  assert.equal(hasVersionConflict(8, undefined), false);
  assert.equal(hasVersionConflict(8, null), true);
  assert.equal(hasVersionConflict(undefined, null), false);
});

test("sobrescrita de nota exige fluxo administrativo", () => {
  assert.equal(requiresAdminCorrection(true), true);
  assert.equal(requiresAdminCorrection(false), false);
});

test("lote publica snapshot imutável dos valores atuais", () => {
  const source = [{ id: "s1", value: 42 }];
  const snapshot = buildPublicationSnapshot(source);
  source[0]!.value = 99;
  assert.deepEqual(snapshot, [{ scoreId: "s1", publicValue: 42 }]);
});
