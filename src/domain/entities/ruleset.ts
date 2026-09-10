export type RescueRuleset = {
  challengePoints: {
    seesaws: number;
    intersections: number;
    obstacles: number;
    ramps: number;
    gaps: number;
    speedBumps: number;
  };
  checkpointAttemptPoints: number[];
  startTilePoints: number;
  exitBonusPoints: number;
  exitPenaltyPerFailure: number;
  correctVictimMultiplier: number;
  switchedVictimMultiplier: number;
  surpriseChallengeMultiplier: number;
  calibrationSeconds: number;
  roundSeconds: number;
};

export const DEFAULT_RESCUE_RULESET_2026: RescueRuleset = {
  challengePoints: {
    seesaws: 20,
    intersections: 10,
    obstacles: 20,
    ramps: 10,
    gaps: 10,
    speedBumps: 10,
  },
  checkpointAttemptPoints: [5, 3, 1],
  startTilePoints: 5,
  exitBonusPoints: 60,
  exitPenaltyPerFailure: 5,
  correctVictimMultiplier: 1.3,
  switchedVictimMultiplier: 1.1,
  surpriseChallengeMultiplier: 1.5,
  calibrationSeconds: 120,
  roundSeconds: 300,
};

export function parseRescueRuleset(value?: string | null): RescueRuleset {
  if (!value) return DEFAULT_RESCUE_RULESET_2026;
  try {
    const parsed = JSON.parse(value) as Partial<RescueRuleset>;
    return {
      ...DEFAULT_RESCUE_RULESET_2026,
      ...parsed,
      challengePoints: {
        ...DEFAULT_RESCUE_RULESET_2026.challengePoints,
        ...(parsed.challengePoints ?? {}),
      },
    };
  } catch {
    return DEFAULT_RESCUE_RULESET_2026;
  }
}

export type RescueScorecard = {
  startTile: boolean;
  checkpoints: Array<{
    tiles: number;
    attempt: number;
    status?: "PENDING" | "REACHED" | "NOT_REACHED" | "ABANDONED";
  }>;
  challenges: Partial<Record<keyof RescueRuleset["challengePoints"], number>>;
  challengeMarks?: Partial<Record<keyof RescueRuleset["challengePoints"], boolean[]>>;
  exitReached: boolean;
  correctVictims: number;
  switchedVictims: number;
  victimPlacements?: Array<"CORRECT" | "SWITCHED" | null>;
  surpriseChallenge: boolean;
};

export function calculateRescueScore(rules: RescueRuleset, card: RescueScorecard) {
  let base = card.startTile ? rules.startTilePoints : 0;
  let failures = 0;
  for (const checkpoint of card.checkpoints) {
    if (checkpoint.status === "NOT_REACHED" || checkpoint.status === "ABANDONED") {
      failures += Math.max(1, checkpoint.attempt || 3);
      continue;
    }
    if (checkpoint.attempt < 1) continue;
    const points = rules.checkpointAttemptPoints[checkpoint.attempt - 1] ?? 0;
    base += checkpoint.tiles * points;
    failures += checkpoint.attempt > 3 ? checkpoint.attempt : Math.max(0, checkpoint.attempt - 1);
  }
  for (const [key, completed] of Object.entries(card.challenges)) {
    base +=
      (completed ?? 0) * (rules.challengePoints[key as keyof typeof rules.challengePoints] ?? 0);
  }
  if (card.exitReached)
    base += Math.max(0, rules.exitBonusPoints - failures * rules.exitPenaltyPerFailure);
  const multiplier =
    Math.pow(rules.correctVictimMultiplier, card.correctVictims) *
    Math.pow(rules.switchedVictimMultiplier, card.switchedVictims) *
    (card.surpriseChallenge ? rules.surpriseChallengeMultiplier : 1);
  return {
    base,
    multiplier: Math.round(multiplier * 1000) / 1000,
    total: Math.ceil(base * multiplier),
    failures,
  };
}
