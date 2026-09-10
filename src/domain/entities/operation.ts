export type PhaseOperationalStatus = "CLOSED" | "OPEN" | "SUSPENDED";

export function canStartPhase(status: string) {
  return status === "OPEN";
}

export function hasVersionConflict(
  currentVersion: number | undefined,
  expectedVersion: number | null | undefined,
) {
  if (expectedVersion === undefined) return false;
  if (expectedVersion === null) return currentVersion !== undefined;
  return currentVersion !== expectedVersion;
}

export function requiresAdminCorrection(alreadyExists: boolean) {
  return alreadyExists;
}

export function buildPublicationSnapshot(scores: Array<{ id: string; value: number }>) {
  return scores.map((score) => ({ scoreId: score.id, publicValue: score.value }));
}
