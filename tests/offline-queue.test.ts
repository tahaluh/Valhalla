import test from "node:test";
import assert from "node:assert/strict";
import {
  enqueueOfflineCommand,
  markOfflineCommandFailure,
  readOfflineCommands,
  removeOfflineCommand,
  updateOfflineCommandPayload,
} from "../src/lib/offline-queue";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

test("fila offline preserva ordem, falha e remoção", () => {
  const storage = memoryStorage();
  enqueueOfflineCommand(storage, {
    id: "1",
    eventId: "event",
    kind: "TRANSITION",
    payload: { state: "CALLED" },
  });
  enqueueOfflineCommand(storage, {
    id: "3",
    eventId: "event",
    kind: "DRAW_SURPRISE",
    payload: { slotId: "slot", requestedChallenge: "Desafio local" },
  });
  enqueueOfflineCommand(storage, {
    id: "2",
    eventId: "event",
    kind: "TRANSITION",
    payload: { state: "IN_PROGRESS" },
  });
  assert.deepEqual(
    readOfflineCommands(storage, "event").map((item) => item.id),
    ["1", "3", "2"],
  );
  markOfflineCommandFailure(storage, "1", "sem rede");
  assert.equal(readOfflineCommands(storage)[0]?.attempts, 1);
  updateOfflineCommandPayload(storage, "2", { stage: "TRANSITION" });
  assert.deepEqual(readOfflineCommands(storage)[2]?.payload, { stage: "TRANSITION" });
  removeOfflineCommand(storage, "1");
  assert.deepEqual(
    readOfflineCommands(storage).map((item) => item.id),
    ["3", "2"],
  );
});
