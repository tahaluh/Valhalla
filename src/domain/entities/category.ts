// Domain entity types for Category

export type CategoryType = "RESCUE" | "ARTISTIC";

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  order: number;
  scoringFormula: string;
  eventId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ScoreColumn {
  id: string;
  name: string;
  order: number;
  isReadOnly: boolean;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateCategoryInput = {
  name: string;
  type: CategoryType;
  eventId: string;
  order?: number;
  scoringFormula: string;
};

export type UpdateCategoryInput = Partial<Omit<CreateCategoryInput, "eventId" | "type">>;

export type CategoryPreset = {
  columns: string[];
  scoringFormula: string;
};

// ─── Default categories ───────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES: Array<{ name: string; type: CategoryType }> = [
  { name: "Resgate Nível 1", type: "RESCUE" },
  { name: "Resgate Nível 2", type: "RESCUE" },
  { name: "Artística Nível 1", type: "ARTISTIC" },
  { name: "Artística Nível 2", type: "ARTISTIC" },
];

// ─── Preset score column names ────────────────────────────────────────────────

export const RESCUE_COLUMNS = ["Round 1", "Time 1", "Round 2", "Time 2", "Round 3", "Time 3"];

export const ARTISTIC_COLUMNS = [
  "Interview",
  "Presentation 1",
  "Presentation 2",
  "Penalties",
  "Sustainability",
  "Extra Round (Normalized)",
];

// ─── Preset scoring formulas ──────────────────────────────────────────────────

/**
 * Rescue scoring: sum of the best two rounds, discard the worst.
 * Official 2026 tiebreakers: total time of all three rounds, fastest time
 * among the highest-scoring rounds, discarded score, then rounds 1–3.
 *
 * Columns: [Round1, Time1, Round2, Time2, Round3, Time3]
 * Indices:  [0,      1,     2,      3,     4,      5    ]
 */
export const RESCUE_SCORING_FORMULA = `(function(scores) {
  var rounds = [scores[0], scores[2], scores[4]];
  var times  = [scores[1] || 300, scores[3] || 300, scores[5] || 300];

  // Find index of worst round
  var worstIdx = 0;
  for (var i = 1; i < rounds.length; i++) {
    if (rounds[i] < rounds[worstIdx]) worstIdx = i;
  }

  var total = 0;
  var totalTime = times[0] + times[1] + times[2];
  for (var j = 0; j < rounds.length; j++) {
    if (j !== worstIdx) {
      total += rounds[j];
    }
  }
  var highest = Math.max(rounds[0], rounds[1], rounds[2]);
  var fastestHighest = 300;
  for (var k = 0; k < rounds.length; k++) {
    if (rounds[k] === highest && times[k] < fastestHighest) fastestHighest = times[k];
  }
  return [total, totalTime, fastestHighest, -rounds[worstIdx], -rounds[0], -rounds[1], -rounds[2]];
})`;

/**
 * Artistic scoring formula as specified.
 *
 * Columns: [Interview, Presentation1, Presentation2, Penalties, Sustainability, Extra]
 */
export const ARTISTIC_SCORING_FORMULA = `(function(scores) {
  var max = scores[1] > scores[2] ? scores[1] : scores[2];
  var score = (scores[0] * 0.4) + (max * 0.6) + scores[4];
  var sum_palco = scores[1] + scores[2];
  return [score, -sum_palco, scores[3], -(scores[5] || 0)];
})`;

export const CATEGORY_PRESETS: Record<CategoryType, CategoryPreset> = {
  RESCUE: {
    columns: RESCUE_COLUMNS,
    scoringFormula: RESCUE_SCORING_FORMULA,
  },
  ARTISTIC: {
    columns: ARTISTIC_COLUMNS,
    scoringFormula: ARTISTIC_SCORING_FORMULA,
  },
};

export function getCategoryPreset(type: CategoryType): CategoryPreset {
  return CATEGORY_PRESETS[type];
}
