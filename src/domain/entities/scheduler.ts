export type ArenaDifficulty = "EASY" | "MEDIUM" | "HARD";

export type AdvancedScheduleInput = {
  teams: Array<{ id: string; name: string }>;
  phases: Array<{ id: string; name: string; startsAt: Date }>;
  stations: Array<{ id: string; name: string; difficulty: ArenaDifficulty }>;
  intervalSeconds: number;
  blackouts: Array<{ startsAt: Date; endsAt: Date }>;
};

export type GeneratedSlot = {
  teamId: string;
  phaseId: string;
  stationId: string;
  scheduledAt: Date;
  order: number;
  difficulty: ArenaDifficulty;
};

const LEVELS: ArenaDifficulty[] = ["EASY", "MEDIUM", "HARD"];

function nextAvailable(
  start: Date,
  durationMs: number,
  blackouts: AdvancedScheduleInput["blackouts"],
) {
  let value = start.getTime();
  let changed = true;
  while (changed) {
    changed = false;
    for (const period of blackouts) {
      const slotEnd = value + durationMs;
      if (value < period.endsAt.getTime() && slotEnd > period.startsAt.getTime()) {
        value = period.endsAt.getTime();
        changed = true;
      }
    }
  }
  return new Date(value);
}

export function generateAdvancedSchedule(input: AdvancedScheduleInput) {
  if (input.phases.length !== 3) throw new Error("Selecione exatamente três rodadas práticas.");
  for (const level of LEVELS) {
    if (!input.stations.some((station) => station.difficulty === level))
      throw new Error(`Cadastre ao menos uma arena ${level.toLowerCase()}.`);
  }
  const stationsByLevel = new Map(
    LEVELS.map((level) => [
      level,
      input.stations.filter((station) => station.difficulty === level),
    ]),
  );
  const slots: GeneratedSlot[] = [];
  const endings: Date[] = [];
  input.phases.forEach((phase, roundIndex) => {
    const stationCounts = new Map(input.stations.map((station) => [station.id, 0]));
    const stationNextTime = new Map(
      input.stations.map((station) => [station.id, phase.startsAt.getTime()]),
    );
    for (const [teamIndex, team] of input.teams.entries()) {
      const difficulty = LEVELS[(teamIndex + roundIndex) % LEVELS.length]!;
      const candidates = stationsByLevel.get(difficulty)!;
      const station = [...candidates].sort(
        (a, b) => (stationCounts.get(a.id) ?? 0) - (stationCounts.get(b.id) ?? 0),
      )[0]!;
      const sequence = stationCounts.get(station.id) ?? 0;
      let scheduledAt = new Date(stationNextTime.get(station.id) ?? phase.startsAt.getTime());
      scheduledAt = nextAvailable(scheduledAt, input.intervalSeconds * 1000, input.blackouts);
      stationCounts.set(station.id, sequence + 1);
      stationNextTime.set(station.id, scheduledAt.getTime() + input.intervalSeconds * 1000);
      slots.push({
        teamId: team.id,
        phaseId: phase.id,
        stationId: station.id,
        scheduledAt,
        order: roundIndex * input.teams.length + teamIndex,
        difficulty,
      });
    }
    const phaseSlots = slots.filter((slot) => slot.phaseId === phase.id);
    endings.push(
      new Date(
        Math.max(...phaseSlots.map((slot) => slot.scheduledAt.getTime())) +
          input.intervalSeconds * 1000,
      ),
    );
  });
  const conflicts: string[] = [];
  for (let index = 1; index < input.phases.length; index++) {
    if (input.phases[index]!.startsAt < endings[index - 1]!)
      conflicts.push(
        `${input.phases[index]!.name} começa antes do término estimado de ${input.phases[index - 1]!.name}.`,
      );
  }
  return { slots, endings, conflicts };
}
