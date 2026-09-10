"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES } from "@/domain/entities/surprise-challenge";

type Category = { id: string; name: string; type: string };
const STATION_LABELS: Record<string, string> = {
  PRACTICE_ARENA: "Arena prática",
  INTERVIEW_TABLE: "Mesa de entrevista",
  STAGE: "Palco",
  CHALLENGE_TABLE: "Desafio surpresa",
};

export function AdminOperationsTab({
  eventId,
  categories,
}: {
  eventId: string;
  categories: Category[];
}) {
  const utils = trpc.useUtils();
  const [scheduleExportPhase, setScheduleExportPhase] = useState("");
  const { data: referees = [] } = trpc.operation.listReferees.useQuery(eventId);
  const { data: stations = [] } = trpc.operation.listStations.useQuery(eventId);
  const { data: phases = [] } = trpc.operation.listPhases.useQuery(eventId);
  const { data: schedule = [] } = trpc.operation.listSchedule.useQuery(eventId);
  const { data: blackouts = [] } = trpc.operation.listBlackouts.useQuery(eventId);
  const { data: arenas = [] } = trpc.arena.listByEvent.useQuery(eventId);
  const { data: event } = trpc.event.getById.useQuery(eventId);
  const { data: surpriseOverview = [] } = trpc.operation.surpriseQueue.useQuery(eventId, {
    enabled: Boolean(event?.surpriseChallenge),
    refetchInterval: 5000,
  });
  const { data: savedSurpriseBank = { LEVEL1: [], LEVEL2: [] } } =
    trpc.operation.getSurpriseChallengeBank.useQuery(eventId);
  const invalidate = () =>
    Promise.all([
      utils.operation.listReferees.invalidate(eventId),
      utils.operation.listStations.invalidate(eventId),
      utils.operation.listPhases.invalidate(eventId),
      utils.operation.listSchedule.invalidate(eventId),
    ]);
  const createReferee = trpc.operation.createReferee.useMutation({ onSuccess: invalidate });
  const removeReferee = trpc.operation.removeReferee.useMutation({ onSuccess: invalidate });
  const createStation = trpc.operation.createStation.useMutation({ onSuccess: invalidate });
  const removeStation = trpc.operation.removeStation.useMutation({ onSuccess: invalidate });
  const createPhase = trpc.operation.createPhase.useMutation({ onSuccess: invalidate });
  const setNormalization = trpc.operation.setPhaseNormalizationFactor.useMutation({
    onSuccess: invalidate,
  });
  const createDefaults = trpc.operation.createDefaultPhases.useMutation({ onSuccess: invalidate });
  const removePhase = trpc.operation.removePhase.useMutation({ onSuccess: invalidate });
  const setPhaseStatus = trpc.operation.setPhaseStatus.useMutation({ onSuccess: invalidate });
  const generate = trpc.operation.generateQueue.useMutation({ onSuccess: invalidate });
  const generateAdvanced = trpc.operation.generateAdvancedQueue.useMutation({
    onSuccess: invalidate,
  });
  const generateTiebreak = trpc.operation.generateArtisticTiebreakQueue.useMutation({
    onSuccess: invalidate,
  });
  const createBlackout = trpc.operation.createBlackout.useMutation({
    onSuccess: () => utils.operation.listBlackouts.invalidate(eventId),
  });
  const removeBlackout = trpc.operation.removeBlackout.useMutation({
    onSuccess: () => utils.operation.listBlackouts.invalidate(eventId),
  });
  const exportSchedule = trpc.operation.exportSchedule.useQuery(
    { eventId, phaseId: scheduleExportPhase || undefined, format: "CSV" },
    { enabled: false },
  );
  const exportMarkdown = trpc.operation.exportSchedule.useQuery(
    { eventId, phaseId: scheduleExportPhase || undefined, format: "MARKDOWN" },
    { enabled: false },
  );
  const move = trpc.operation.moveSlot.useMutation({ onSuccess: invalidate });
  const swap = trpc.operation.swapSlots.useMutation({ onSuccess: invalidate });
  const clearQueue = trpc.operation.clearPhaseQueue.useMutation({ onSuccess: invalidate });
  const assignSurprise = trpc.operation.setSurpriseAssignment.useMutation({
    onSuccess: () => Promise.all([invalidate(), utils.operation.surpriseQueue.invalidate(eventId)]),
  });
  const exportSessionPdf = trpc.robustness.exportSessionScorecardPdf.useMutation();
  const saveSurpriseBank = trpc.operation.setSurpriseChallengeBank.useMutation({
    onSuccess: () => utils.operation.getSurpriseChallengeBank.invalidate(eventId),
  });
  const updateEvent = trpc.event.update.useMutation({
    onSuccess: () => utils.event.getById.invalidate(eventId),
  });
  const [refereeName, setRefereeName] = useState("");
  const [station, setStation] = useState({
    name: "",
    type: "PRACTICE_ARENA" as "PRACTICE_ARENA" | "INTERVIEW_TABLE" | "STAGE" | "CHALLENGE_TABLE",
    arenaId: "",
  });
  const [phase, setPhase] = useState({
    name: "Rodada 1",
    type: "PRACTICE_ROUND" as "PRACTICE_ROUND" | "INTERVIEW" | "PERFORMANCE" | "EXTRA_ROUND",
    durationSeconds: 300,
    calibrationSeconds: 120,
    artisticNormalizationFactor: 1,
  });
  const [queue, setQueue] = useState({
    phaseId: "",
    categoryId: "",
    startsAt: "",
    intervalMinutes: 10,
    stationIds: [] as string[],
  });
  const [surprise, setSurprise] = useState({
    slotId: "",
    challengeText: "",
    judgeName: "",
    eligible: true,
  });
  const [surpriseBank, setSurpriseBank] = useState<{ LEVEL1: string[]; LEVEL2: string[] }>({
    LEVEL1: [""],
    LEVEL2: [""],
  });
  const [surpriseLeadMinutes, setSurpriseLeadMinutes] = useState(30);
  const [advanced, setAdvanced] = useState({
    categoryId: "",
    intervalMinutes: 10,
    starts: ["", "", ""],
  });
  const [blackout, setBlackout] = useState({ name: "Almoço", startsAt: "", endsAt: "" });
  const [tiebreak, setTiebreak] = useState({
    categoryId: "",
    phaseId: "",
    stationId: "",
    startsAt: "",
    intervalMinutes: 10,
  });
  const nextSequence = useMemo(
    () => Math.max(0, ...phases.map((item) => item.sequence)) + 1,
    [phases],
  );
  const eligibleSurprisePhaseIds = useMemo(
    () =>
      phases
        .filter((item) => item.type === "PRACTICE_ROUND")
        .sort((first, second) => first.sequence - second.sequence)
        .slice(1, 3)
        .map((item) => item.id),
    [phases],
  );
  const practicePhases = useMemo(
    () =>
      phases
        .filter((item) => item.type === "PRACTICE_ROUND")
        .sort((a, b) => a.sequence - b.sequence)
        .slice(0, 3),
    [phases],
  );
  async function downloadSchedule() {
    const result = await exportSchedule.refetch();
    if (!result.data) return;
    const url = URL.createObjectURL(new Blob([result.data], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `horarios-obr-${scheduleExportPhase || "completo"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  async function downloadSessionPdf(sessionId: string, teamName: string) {
    const data = await exportSessionPdf.mutateAsync(sessionId);
    const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ficha-${teamName.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  useEffect(() => {
    setSurpriseBank({
      LEVEL1: savedSurpriseBank.LEVEL1.length ? savedSurpriseBank.LEVEL1 : [""],
      LEVEL2: savedSurpriseBank.LEVEL2.length ? savedSurpriseBank.LEVEL2 : [""],
    });
  }, [savedSurpriseBank]);
  useEffect(() => {
    if (event) setSurpriseLeadMinutes(event.surpriseLeadMinutes);
  }, [event]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Operação e agenda</h2>
        <p className="text-sm text-muted-foreground">
          Cadastre a equipe de arbitragem, postos, fases e gere as filas por mesa.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Árbitros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <input
                className="h-10 flex-1 rounded-md border px-3"
                placeholder="Nome do árbitro"
                value={refereeName}
                onChange={(e) => setRefereeName(e.target.value)}
              />
              <Button
                onClick={() => {
                  if (refereeName.trim())
                    createReferee.mutate(
                      { eventId, name: refereeName.trim() },
                      { onSuccess: () => setRefereeName("") },
                    );
                }}
              >
                Adicionar
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {referees.map((referee) => (
                <span
                  key={referee.id}
                  className="inline-flex items-center gap-2 rounded-full border bg-slate-50 px-3 py-1 text-sm"
                >
                  {referee.name}
                  <button className="text-red-600" onClick={() => removeReferee.mutate(referee.id)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Mesas, arenas e palcos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="h-10 rounded-md border px-3"
                placeholder="Nome do posto"
                value={station.name}
                onChange={(e) => setStation((old) => ({ ...old, name: e.target.value }))}
              />
              <select
                className="h-10 rounded-md border px-3"
                value={station.type}
                onChange={(e) =>
                  setStation((old) => ({ ...old, type: e.target.value as typeof old.type }))
                }
              >
                {Object.entries(STATION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {station.type === "PRACTICE_ARENA" && (
              <select
                className="h-10 w-full rounded-md border px-3"
                value={station.arenaId}
                onChange={(e) => setStation((old) => ({ ...old, arenaId: e.target.value }))}
              >
                <option value="">Vincular ruleset de arena...</option>
                {arenas.map((arena) => (
                  <option key={arena.id} value={arena.id}>
                    {arena.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              onClick={() => {
                if (station.name.trim())
                  createStation.mutate(
                    {
                      eventId,
                      name: station.name.trim(),
                      type: station.type,
                      order: stations.length,
                      arenaId: station.arenaId || undefined,
                    },
                    { onSuccess: () => setStation((old) => ({ ...old, name: "" })) },
                  );
              }}
            >
              Adicionar posto
            </Button>
            <div className="space-y-2">
              {stations.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                >
                  <span>
                    <strong>{item.name}</strong> · {STATION_LABELS[item.type] ?? item.type}
                  </span>
                  <button
                    className="text-red-600"
                    onClick={() =>
                      confirm(
                        `Remover ${item.name}? Isso apaga permanentemente toda a agenda, fichas e notas desta mesa.`,
                      ) && removeStation.mutate(item.id)
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Fases e rodadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {phases.length === 0 && (
            <Button type="button" variant="outline" onClick={() => createDefaults.mutate(eventId)}>
              Criar fases padrão OBR 2026
            </Button>
          )}
          <div className="grid gap-2 md:grid-cols-6">
            <input
              className="h-10 rounded-md border px-3"
              value={phase.name}
              onChange={(e) => setPhase((old) => ({ ...old, name: e.target.value }))}
            />
            <select
              className="h-10 rounded-md border px-3"
              value={phase.type}
              onChange={(e) =>
                setPhase((old) => ({ ...old, type: e.target.value as typeof old.type }))
              }
            >
              <option value="PRACTICE_ROUND">Rodada prática</option>
              <option value="INTERVIEW">Entrevista</option>
              <option value="PERFORMANCE">Apresentação</option>
              <option value="EXTRA_ROUND">Apresentação extra (Artística)</option>
            </select>
            <NumberInput
              label="Duração (s)"
              value={phase.durationSeconds}
              onChange={(value) => setPhase((old) => ({ ...old, durationSeconds: value }))}
            />
            <NumberInput
              label="Calibração (s)"
              value={phase.calibrationSeconds}
              onChange={(value) => setPhase((old) => ({ ...old, calibrationSeconds: value }))}
            />
            {phase.type === "EXTRA_ROUND" ? (
              <label className="text-xs font-semibold">
                Fator de normalização
                <input
                  className="mt-1 h-10 w-full rounded-md border px-3"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={phase.artisticNormalizationFactor}
                  onChange={(event) =>
                    setPhase((old) => ({
                      ...old,
                      artisticNormalizationFactor: Number(event.target.value),
                    }))
                  }
                />
              </label>
            ) : (
              <div />
            )}
            <Button
              onClick={() => createPhase.mutate({ eventId, ...phase, sequence: nextSequence })}
            >
              Adicionar fase
            </Button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {phases.map((item) => (
              <div key={item.id} className="rounded-xl border bg-white p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <strong>
                      {item.sequence}. {item.name}
                    </strong>{" "}
                    · {Math.floor(item.durationSeconds / 60)} min
                    {item.type === "EXTRA_ROUND"
                      ? ` · normalização ${item.artisticNormalizationFactor}×`
                      : ""}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-bold ${item.operationalStatus === "OPEN" ? "bg-green-100 text-green-800" : item.operationalStatus === "SUSPENDED" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-700"}`}
                  >
                    {item.operationalStatus === "OPEN"
                      ? "ABERTA"
                      : item.operationalStatus === "SUSPENDED"
                        ? "SUSPENSA"
                        : "FECHADA"}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.type === "EXTRA_ROUND" && (
                    <label className="flex items-center gap-2 text-xs font-semibold">
                      Normalização
                      <input
                        className="h-8 w-20 rounded border px-2"
                        type="number"
                        min="0.01"
                        step="0.01"
                        defaultValue={item.artisticNormalizationFactor}
                        onBlur={(event) => {
                          const factor = Number(event.target.value);
                          if (factor > 0 && factor !== item.artisticNormalizationFactor)
                            setNormalization.mutate({ phaseId: item.id, factor });
                        }}
                      />
                    </label>
                  )}
                  <Button
                    size="sm"
                    disabled={item.operationalStatus === "OPEN"}
                    onClick={() => setPhaseStatus.mutate({ phaseId: item.id, status: "OPEN" })}
                  >
                    Abrir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={item.operationalStatus === "SUSPENDED"}
                    onClick={() =>
                      setPhaseStatus.mutate({
                        phaseId: item.id,
                        status: "SUSPENDED",
                        reason: "Suspensão operacional pelo admin",
                      })
                    }
                  >
                    Suspender
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={item.operationalStatus === "CLOSED"}
                    onClick={() =>
                      confirm(`Fechar ${item.name}? Novos atendimentos serão bloqueados.`) &&
                      setPhaseStatus.mutate({ phaseId: item.id, status: "CLOSED" })
                    }
                  >
                    Fechar
                  </Button>
                  <button
                    className="ml-auto text-red-600"
                    onClick={() => confirm(`Remover ${item.name}?`) && removePhase.mutate(item.id)}
                  >
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {event?.surpriseChallenge && (
        <Card>
          <CardHeader>
            <CardTitle>Desafios surpresa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className={`rounded-xl border-2 p-4 ${
                event.surpriseWindowOpen
                  ? "border-green-500 bg-green-50"
                  : "border-slate-300 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[#153c67]">
                    Entrega {event.surpriseWindowOpen ? "aberta" : "fechada"}
                  </h3>
                  <p className="text-sm text-slate-700">
                    O admin controla a liberação. A previsão de 30 minutos não bloqueia nem abre
                    automaticamente os sorteios.
                  </p>
                </div>
                <Button
                  type="button"
                  className={
                    event.surpriseWindowOpen
                      ? "bg-red-700 text-white hover:bg-red-800"
                      : "bg-green-700 text-white hover:bg-green-800"
                  }
                  disabled={updateEvent.isPending}
                  onClick={() => {
                    const nextOpen = !event.surpriseWindowOpen;
                    if (
                      confirm(
                        nextOpen
                          ? "Abrir agora a entrega dos desafios surpresa?"
                          : "Fechar agora a entrega? Novos sorteios ficarão bloqueados.",
                      )
                    )
                      updateEvent.mutate({ id: eventId, surpriseWindowOpen: nextOpen });
                  }}
                >
                  {updateEvent.isPending
                    ? "Salvando..."
                    : event.surpriseWindowOpen
                      ? "Fechar entrega"
                      : "Abrir entrega"}
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-bold text-[#153c67]">Horário de referência</h3>
              <p className="mb-3 text-sm text-blue-950">
                O padrão é avisar 30 minutos antes. Esse valor só calcula os alertas; a abertura e o
                fechamento acima são sempre manuais.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="space-y-1 text-sm font-semibold">
                  Minutos antes da rodada
                  <input
                    type="number"
                    min={0}
                    className="block h-10 w-36 rounded-md border bg-white px-3"
                    value={surpriseLeadMinutes}
                    onChange={(event) =>
                      setSurpriseLeadMinutes(Math.max(0, Number(event.target.value) || 0))
                    }
                  />
                </label>
                {[1, 2, 5, 15, 30].map((minutes) => (
                  <Button
                    key={minutes}
                    type="button"
                    variant={surpriseLeadMinutes === minutes ? "default" : "outline"}
                    onClick={() => setSurpriseLeadMinutes(minutes)}
                  >
                    {minutes} min
                  </Button>
                ))}
                <Button
                  type="button"
                  disabled={updateEvent.isPending}
                  onClick={() => updateEvent.mutate({ id: eventId, surpriseLeadMinutes })}
                >
                  {updateEvent.isPending ? "Salvando..." : "Salvar referência"}
                </Button>
              </div>
              {updateEvent.isSuccess && (
                <p className="mt-2 text-sm font-semibold text-green-700">
                  Antecedência atualizada para {event?.surpriseLeadMinutes} minuto(s).
                </p>
              )}
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-bold">Acompanhamento geral</h3>
                  <p className="text-sm text-muted-foreground">
                    Situação da 2ª e 3ª rodadas, atualizada a cada cinco segundos.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {(
                    [
                      "PENDING",
                      "DRAWN",
                      "DEMONSTRATED",
                      "NOT_DEMONSTRATED",
                      "DECLINED",
                      "MISSED",
                    ] as const
                  ).map((status) => (
                    <span key={status} className="rounded-full border px-2 py-1">
                      {surpriseStatusAdminLabel(status)}:{" "}
                      {
                        surpriseOverview.filter(
                          (slot) => (slot.session?.surpriseStatus ?? "PENDING") === status,
                        ).length
                      }
                    </span>
                  ))}
                </div>
              </div>
              <div className="max-h-96 overflow-auto rounded-lg border">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="sticky top-0 bg-[#153c67] text-white">
                    <tr>
                      <th className="p-2">Equipe</th>
                      <th className="p-2">Nível</th>
                      <th className="p-2">Rodada</th>
                      <th className="p-2">Sorteio previsto</th>
                      <th className="p-2">Situação</th>
                      <th className="p-2">Desafio</th>
                      <th className="p-2">Juiz / tablet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {surpriseOverview.map((slot) => {
                      const status = slot.session?.surpriseStatus ?? "PENDING";
                      const drawAt = new Date(
                        new Date(slot.scheduledAt).getTime() -
                          (event?.surpriseLeadMinutes ?? 30) * 60 * 1000,
                      );
                      return (
                        <tr key={slot.id} className="border-t even:bg-slate-50">
                          <td className="p-2 font-semibold">{slot.team.name}</td>
                          <td className="p-2">
                            {slot.team.category.competitionLevel === "LEVEL1"
                              ? "N1"
                              : slot.team.category.competitionLevel === "LEVEL2"
                                ? "N2"
                                : "Não definido"}
                          </td>
                          <td className="p-2">{slot.phase.name}</td>
                          <td className="p-2">{drawAt.toLocaleString("pt-BR")}</td>
                          <td className="p-2 font-semibold">{surpriseStatusAdminLabel(status)}</td>
                          <td className="max-w-sm p-2 text-xs">
                            {slot.session?.surpriseChallengeText ?? "-"}
                          </td>
                          <td className="p-2">
                            {slot.session?.surpriseJudgeName ?? "-"} ·{" "}
                            {slot.session?.surpriseTerminalId ?? "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="rounded-xl border bg-slate-50 p-4">
              <h3 className="font-bold">Bancos para sorteio por nível</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                O Juiz de Desafio gera uma opção individual para cada equipe na 2ª e 3ª rodadas e
                pode substituí-la de forma auditada antes da conclusão.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {(["LEVEL1", "LEVEL2"] as const).map((level) => (
                  <details key={level} className="rounded-lg border bg-white p-3">
                    <summary className="cursor-pointer font-bold text-[#153c67]">
                      {level === "LEVEL1" ? "Nível 1" : "Nível 2"} ·{" "}
                      {surpriseBank[level].filter((item) => item.trim()).length} desafios
                    </summary>
                    <div className="mt-3 space-y-2">
                      {surpriseBank[level].map((challenge, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            className="h-10 flex-1 rounded-md border px-3"
                            placeholder={`Desafio ${index + 1}`}
                            value={challenge}
                            onChange={(event) =>
                              setSurpriseBank((old) => ({
                                ...old,
                                [level]: old[level].map((item, itemIndex) =>
                                  itemIndex === index ? event.target.value : item,
                                ),
                              }))
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            aria-label={`Remover desafio ${index + 1}`}
                            onClick={() =>
                              setSurpriseBank((old) => ({
                                ...old,
                                [level]: old[level].filter((_, i) => i !== index),
                              }))
                            }
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() =>
                          setSurpriseBank((old) => ({ ...old, [level]: [...old[level], ""] }))
                        }
                      >
                        + Adicionar ao {level === "LEVEL1" ? "N1" : "N2"}
                      </Button>
                    </div>
                  </details>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setSurpriseBank({
                      LEVEL1: [...TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES.LEVEL1],
                      LEVEL2: [...TOURNAMENTER_OBR_2026_SURPRISE_CHALLENGES.LEVEL2],
                    })
                  }
                >
                  Restaurar banco Tournamenter 2026
                </Button>
                <Button
                  type="button"
                  disabled={
                    saveSurpriseBank.isPending ||
                    ![...surpriseBank.LEVEL1, ...surpriseBank.LEVEL2].some((item) => item.trim())
                  }
                  onClick={() =>
                    saveSurpriseBank.mutate({
                      eventId,
                      level1: surpriseBank.LEVEL1.map((item) => item.trim()).filter(Boolean),
                      level2: surpriseBank.LEVEL2.map((item) => item.trim()).filter(Boolean),
                    })
                  }
                >
                  {saveSurpriseBank.isPending ? "Salvando..." : "Salvar banco"}
                </Button>
              </div>
              {saveSurpriseBank.isSuccess && (
                <p className="mt-2 text-sm text-green-700">Banco de desafios salvo.</p>
              )}
              {saveSurpriseBank.error && (
                <p className="mt-2 text-sm text-red-700">{saveSurpriseBank.error.message}</p>
              )}
            </div>
            <div className="border-t pt-4">
              <h3 className="font-bold">Registro manual excepcional</h3>
              <p className="mb-3 text-sm text-muted-foreground">
                Use somente para registrar um sorteio feito fora da mesa de desafio.
              </p>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto]">
                <select
                  className="h-10 rounded-md border px-3"
                  value={surprise.slotId}
                  onChange={(e) => setSurprise((old) => ({ ...old, slotId: e.target.value }))}
                >
                  <option value="">Equipe e rodada...</option>
                  {schedule
                    .filter((slot) => eligibleSurprisePhaseIds.includes(slot.phaseId))
                    .map((slot) => (
                      <option key={slot.id} value={slot.id}>
                        {slot.team.name} · {slot.phase.name}
                      </option>
                    ))}
                </select>
                <input
                  className="h-10 rounded-md border px-3"
                  placeholder="Descrição/código do desafio sorteado"
                  value={surprise.challengeText}
                  onChange={(e) =>
                    setSurprise((old) => ({ ...old, challengeText: e.target.value }))
                  }
                />
                <input
                  className="h-10 rounded-md border px-3"
                  placeholder="Juiz responsável pelo sorteio"
                  value={surprise.judgeName}
                  onChange={(event) =>
                    setSurprise((old) => ({ ...old, judgeName: event.target.value }))
                  }
                />
                <label className="flex items-center rounded-md border px-3 text-sm">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={surprise.eligible}
                    onChange={(e) => setSurprise((old) => ({ ...old, eligible: e.target.checked }))}
                  />
                  Elegível
                </label>
              </div>
              <Button
                disabled={
                  !surprise.slotId ||
                  !surprise.judgeName.trim() ||
                  (surprise.eligible && !surprise.challengeText.trim()) ||
                  assignSurprise.isPending
                }
                onClick={() =>
                  assignSurprise.mutate({
                    slotId: surprise.slotId,
                    eligible: surprise.eligible,
                    challengeText: surprise.challengeText || undefined,
                    judgeName: surprise.judgeName,
                  })
                }
              >
                Registrar sorteio
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Gerador avançado OBR · três níveis</CardTitle>
          <p className="text-sm text-muted-foreground">
            Distribui cada equipe por arenas fácil, média e difícil, pula pausas e bloqueia rodadas
            sobrepostas.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className="h-10 rounded-md border px-3"
              value={advanced.categoryId}
              onChange={(event) =>
                setAdvanced((old) => ({ ...old, categoryId: event.target.value }))
              }
            >
              <option value="">Categoria de resgate…</option>
              {categories
                .filter((category) => category.type === "RESCUE")
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
            {practicePhases.map((phase, index) => (
              <label key={phase.id} className="text-xs">
                Início · {phase.name}
                <input
                  type="datetime-local"
                  className="mt-1 h-10 w-full rounded-md border px-2 text-sm"
                  value={advanced.starts[index] ?? ""}
                  onChange={(event) =>
                    setAdvanced((old) => ({
                      ...old,
                      starts: old.starts.map((value, itemIndex) =>
                        itemIndex === index ? event.target.value : value,
                      ),
                    }))
                  }
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <NumberInput
              label="Intervalo (min)"
              value={advanced.intervalMinutes}
              onChange={(value) => setAdvanced((old) => ({ ...old, intervalMinutes: value }))}
            />
            <span className="text-sm">
              Arenas:{" "}
              {stations
                .filter((station) => station.type === "PRACTICE_ARENA")
                .map(
                  (station) =>
                    `${station.name} (${station.arena?.difficulty === "EASY" ? "fácil" : station.arena?.difficulty === "HARD" ? "difícil" : "média"})`,
                )
                .join(", ") || "nenhuma"}
            </span>
          </div>
          <Button
            disabled={
              !advanced.categoryId ||
              advanced.starts.some((value) => !value) ||
              practicePhases.length !== 3 ||
              generateAdvanced.isPending
            }
            onClick={() =>
              generateAdvanced.mutate({
                eventId,
                categoryId: advanced.categoryId,
                phaseStarts: practicePhases.map((phase, index) => ({
                  phaseId: phase.id,
                  startsAt: new Date(advanced.starts[index]!).toISOString(),
                })),
                stationIds: stations
                  .filter((station) => station.type === "PRACTICE_ARENA")
                  .map((station) => station.id),
                intervalSeconds: advanced.intervalMinutes * 60,
              })
            }
          >
            Gerar as três rodadas equilibradas
          </Button>
          {generateAdvanced.data?.conflicts.map((conflict) => (
            <p key={conflict} className="rounded bg-red-50 p-2 text-sm text-red-800">
              {conflict}
            </p>
          ))}
          {generateAdvanced.error && (
            <p className="text-sm text-red-700">{generateAdvanced.error.message}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Desempate automático da Artística</CardTitle>
          <p className="text-sm text-muted-foreground">
            Localiza equipes empatadas após nota final, soma das apresentações e penalidades, e cria
            a fila da apresentação extra.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-5">
            <select
              className="h-10 rounded-md border px-3"
              value={tiebreak.categoryId}
              onChange={(event) =>
                setTiebreak((old) => ({ ...old, categoryId: event.target.value }))
              }
            >
              <option value="">Categoria artística…</option>
              {categories
                .filter((category) => category.type === "ARTISTIC")
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
            <select
              className="h-10 rounded-md border px-3"
              value={tiebreak.phaseId}
              onChange={(event) => setTiebreak((old) => ({ ...old, phaseId: event.target.value }))}
            >
              <option value="">Apresentação extra…</option>
              {phases
                .filter((phase) => phase.type === "EXTRA_ROUND")
                .map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
            </select>
            <select
              className="h-10 rounded-md border px-3"
              value={tiebreak.stationId}
              onChange={(event) =>
                setTiebreak((old) => ({ ...old, stationId: event.target.value }))
              }
            >
              <option value="">Palco…</option>
              {stations
                .filter((station) => station.type === "STAGE")
                .map((station) => (
                  <option key={station.id} value={station.id}>
                    {station.name}
                  </option>
                ))}
            </select>
            <input
              className="h-10 rounded-md border px-3"
              type="datetime-local"
              value={tiebreak.startsAt}
              onChange={(event) => setTiebreak((old) => ({ ...old, startsAt: event.target.value }))}
            />
            <NumberInput
              label="Intervalo (min)"
              value={tiebreak.intervalMinutes}
              onChange={(value) => setTiebreak((old) => ({ ...old, intervalMinutes: value }))}
            />
          </div>
          <Button
            disabled={
              generateTiebreak.isPending ||
              !tiebreak.categoryId ||
              !tiebreak.phaseId ||
              !tiebreak.stationId ||
              !tiebreak.startsAt
            }
            onClick={() =>
              generateTiebreak.mutate({
                eventId,
                categoryId: tiebreak.categoryId,
                phaseId: tiebreak.phaseId,
                stationId: tiebreak.stationId,
                startsAt: new Date(tiebreak.startsAt).toISOString(),
                intervalSeconds: tiebreak.intervalMinutes * 60,
              })
            }
          >
            Gerar fila das equipes empatadas
          </Button>
          {generateTiebreak.data && (
            <p className="text-sm text-green-700">
              {generateTiebreak.data.created} equipe(s) adicionada(s) em{" "}
              {generateTiebreak.data.groups.length} grupo(s) de empate.
            </p>
          )}
          {generateTiebreak.error && (
            <p className="text-sm text-red-700">{generateTiebreak.error.message}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pausas e períodos indisponíveis</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-4">
            <input
              className="h-10 rounded-md border px-3"
              value={blackout.name}
              onChange={(event) => setBlackout((old) => ({ ...old, name: event.target.value }))}
              placeholder="Almoço / manutenção"
            />
            <input
              type="datetime-local"
              className="h-10 rounded-md border px-2"
              value={blackout.startsAt}
              onChange={(event) => setBlackout((old) => ({ ...old, startsAt: event.target.value }))}
            />
            <input
              type="datetime-local"
              className="h-10 rounded-md border px-2"
              value={blackout.endsAt}
              onChange={(event) => setBlackout((old) => ({ ...old, endsAt: event.target.value }))}
            />
            <Button
              disabled={!blackout.name || !blackout.startsAt || !blackout.endsAt}
              onClick={() =>
                createBlackout.mutate({
                  eventId,
                  name: blackout.name,
                  startsAt: new Date(blackout.startsAt).toISOString(),
                  endsAt: new Date(blackout.endsAt).toISOString(),
                })
              }
            >
              Adicionar período
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {blackouts.map((period) => (
              <span key={period.id} className="rounded-full border bg-amber-50 px-3 py-2 text-sm">
                {period.name} · {new Date(period.startsAt).toLocaleString("pt-BR")}–
                {new Date(period.endsAt).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                <button
                  className="ml-2 text-red-700"
                  onClick={() => removeBlackout.mutate(period.id)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Gerar fila automaticamente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <select
              className="h-10 rounded-md border px-3"
              value={queue.phaseId}
              onChange={(e) => setQueue((old) => ({ ...old, phaseId: e.target.value }))}
            >
              <option value="">Fase...</option>
              {phases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              className="h-10 rounded-md border px-3"
              value={queue.categoryId}
              onChange={(e) => setQueue((old) => ({ ...old, categoryId: e.target.value }))}
            >
              <option value="">Categoria...</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              className="h-10 rounded-md border px-3"
              type="datetime-local"
              value={queue.startsAt}
              onChange={(e) => setQueue((old) => ({ ...old, startsAt: e.target.value }))}
            />
            <NumberInput
              label="Intervalo (min)"
              value={queue.intervalMinutes}
              onChange={(value) => setQueue((old) => ({ ...old, intervalMinutes: value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {stations.map((item) => (
              <label key={item.id} className="rounded-full border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={queue.stationIds.includes(item.id)}
                  onChange={(e) =>
                    setQueue((old) => ({
                      ...old,
                      stationIds: e.target.checked
                        ? [...old.stationIds, item.id]
                        : old.stationIds.filter((id) => id !== item.id),
                    }))
                  }
                />
                {item.name}
              </label>
            ))}
          </div>
          <Button
            disabled={
              !queue.phaseId ||
              !queue.categoryId ||
              !queue.startsAt ||
              queue.stationIds.length === 0
            }
            onClick={() =>
              generate.mutate({
                eventId,
                phaseId: queue.phaseId,
                categoryId: queue.categoryId,
                stationIds: queue.stationIds,
                startsAt: new Date(queue.startsAt).toISOString(),
                intervalSeconds: queue.intervalMinutes * 60,
              })
            }
          >
            Gerar horários
          </Button>
          {queue.phaseId && schedule.some((slot) => slot.phaseId === queue.phaseId) && (
            <Button
              variant="outline"
              onClick={() =>
                confirm("Apagar toda a fila desta fase, incluindo fichas vinculadas?") &&
                clearQueue.mutate(queue.phaseId)
              }
            >
              Limpar fila da fase
            </Button>
          )}
          {generate.error && <p className="text-sm text-red-700">{generate.error.message}</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Agenda gerada</CardTitle>
            <div className="flex gap-2">
              <select
                className="h-9 rounded-md border px-2 text-sm"
                value={scheduleExportPhase}
                onChange={(event) => setScheduleExportPhase(event.target.value)}
                aria-label="Rodada para exportar ou imprimir"
              >
                <option value="">Todas as rodadas</option>
                {phases.map((phase) => (
                  <option key={phase.id} value={phase.id}>
                    {phase.name}
                  </option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={downloadSchedule}>
                Exportar CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const result = await exportMarkdown.refetch();
                  if (result.data) await navigator.clipboard.writeText(result.data);
                }}
              >
                Copiar Markdown
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()}>
                Imprimir tabelas
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {move.error && <p className="text-sm text-red-700">{move.error.message}</p>}
          {swap.error && <p className="text-sm text-red-700">{swap.error.message}</p>}
          {(() => {
            const visibleSlots = schedule.filter(
              (slot) => !scheduleExportPhase || slot.phaseId === scheduleExportPhase,
            );
            return visibleSlots.map((slot, index) => (
              <div
                key={slot.id}
                className="grid items-center gap-2 rounded-md border p-3 text-sm md:grid-cols-[150px_1fr_1fr_1fr_auto]"
              >
                <input
                  type="datetime-local"
                  className="rounded border px-2 py-1"
                  defaultValue={toLocalInput(slot.scheduledAt)}
                  onBlur={(e) =>
                    move.mutate({
                      id: slot.id,
                      scheduledAt: new Date(e.target.value).toISOString(),
                    })
                  }
                />
                <strong>{slot.team.name}</strong>
                <span>{slot.phase.name}</span>
                <select
                  className="rounded border px-2 py-1"
                  value={slot.stationId}
                  onChange={(e) => move.mutate({ id: slot.id, stationId: e.target.value })}
                >
                  {stations.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <span className="mr-2 rounded bg-slate-100 px-2 py-1 text-xs">
                    {slot.session?.state ?? slot.status}
                  </span>
                  {slot.session && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadSessionPdf(slot.session!.id, slot.team.name)}
                    >
                      Ficha PDF
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    onClick={() =>
                      visibleSlots[index - 1] &&
                      swap.mutate({ firstId: slot.id, secondId: visibleSlots[index - 1]!.id })
                    }
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === visibleSlots.length - 1}
                    onClick={() =>
                      visibleSlots[index + 1] &&
                      swap.mutate({ firstId: slot.id, secondId: visibleSlots[index + 1]!.id })
                    }
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ));
          })()}
          {schedule.length === 0 && <p className="text-muted-foreground">Nenhum horário gerado.</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function surpriseStatusAdminLabel(status: string) {
  return (
    {
      PENDING: "Aguardando",
      DRAWN: "Sorteado",
      DECLINED: "Recusado",
      MISSED: "Não compareceu",
      DEMONSTRATED: "Concluído",
      NOT_DEMONSTRATED: "Não demonstrado",
    }[status] ?? status
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="relative">
      <span className="absolute -top-2 left-2 bg-white px-1 text-[10px] text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        min="0"
        className="h-10 w-full rounded-md border px-3"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </label>
  );
}
function toLocalInput(value: string | Date) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
