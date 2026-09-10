export type ArtisticCard = {
  software: number;
  hardware: number;
  complexity: number;
  engineering: number;
  teamwork: number;
  resources: number;
  interviewDeduction: number;
  visual: number;
  interaction: number;
  features: number[];
  interventions: number;
  restarts: number;
  overtimeBlocks: number;
  presentationSeconds: number;
  sustainability: number;
};

export function calculateArtisticScore(type: string, card: ArtisticCard) {
  if (type === "INTERVIEW") {
    const raw =
      card.software +
      card.hardware +
      card.complexity +
      card.engineering +
      card.teamwork +
      card.resources;
    return {
      raw,
      penalties: card.interviewDeduction,
      total: Math.max(0, Math.min(100, raw - card.interviewDeduction)),
    };
  }
  const raw = card.visual + card.interaction + card.features.reduce((sum, value) => sum + value, 0);
  const penalties = (card.interventions + card.restarts + card.overtimeBlocks) * 3;
  return {
    raw,
    penalties,
    total: card.presentationSeconds < 90 ? 0 : Math.max(0, Math.min(100, raw - penalties)),
  };
}

export function normalizeArtisticExtraScore(score: number, factor: number) {
  if (!Number.isFinite(score) || !Number.isFinite(factor) || factor <= 0)
    throw new Error("Nota e fator de normalização devem ser números válidos.");
  return Math.round(score * factor * 1000) / 1000;
}

export function sumArtisticPresentationPenalties(scorecards: Array<string | null | undefined>) {
  return scorecards.reduce<number>((total, value) => {
    if (!value) return total;
    try {
      const parsed = JSON.parse(value) as { result?: { penalties?: unknown } };
      const penalty = Number(parsed.result?.penalties ?? 0);
      return total + (Number.isFinite(penalty) ? penalty : 0);
    } catch {
      return total;
    }
  }, 0);
}
