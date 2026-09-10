"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";
import { Badge } from "@/presentation/components/ui/badge";
import {
  calculateRescueScore,
  parseRescueRuleset,
  type RescueScorecard,
} from "@/domain/entities/ruleset";
import {
  calculateArtisticScore,
  normalizeArtisticExtraScore,
  type ArtisticCard,
} from "@/domain/entities/artistic";
import {
  enqueueOfflineCommand,
  markOfflineCommandFailure,
  readOfflineCommands,
  removeOfflineCommand,
  updateOfflineCommandPayload,
  type OfflineCommand,
} from "@/lib/offline-queue";
import {
  chooseSurpriseChallenge,
  getSurpriseTiming,
  type SurpriseChallengeLevel,
} from "@/domain/entities/surprise-challenge";

const EMPTY_CARD: RescueScorecard = {
  startTile: false,
  checkpoints: [],
  challenges: {},
  challengeMarks: {},
  exitReached: false,
  correctVictims: 0,
  switchedVictims: 0,
  victimPlacements: [null, null, null],
  surpriseChallenge: false,
};
const CHALLENGES = [
  { key: "seesaws", label: "Gangorras" },
  { key: "intersections", label: "Interseções / becos" },
  { key: "obstacles", label: "Obstáculos" },
  { key: "ramps", label: "Rampas" },
  { key: "gaps", label: "Gaps" },
  { key: "speedBumps", label: "Lombadas" },
] as const;
const EMPTY_ARTISTIC: ArtisticCard = {
  software: 0,
  hardware: 0,
  complexity: 0,
  engineering: 0,
  teamwork: 0,
  resources: 0,
  interviewDeduction: 0,
  visual: 0,
  interaction: 0,
  features: [0, 0, 0, 0],
  interventions: 0,
  restarts: 0,
  overtimeBlocks: 0,
  presentationSeconds: 0,
  sustainability: 0,
};
type RefereeScreen = "setup" | "queue" | "officials" | "run" | "score" | "challenge";
type SetupStage = "station" | "phase";
type PendingAction = {
  state: "CALLED" | "CALIBRATING" | "IN_PROGRESS" | "PAUSED" | "REVIEW" | "ABSENT" | "RESCHEDULED";
  title: string;
  description: string;
  reason?: string;
  forceMaximumTime?: boolean;
};
type TabletPreferences = {
  stationId?: string;
  operatorName?: string;
  announcerName?: string;
  scorerName?: string;
};
type TransitionPayload = {
  slotId: string;
  state: PendingAction["state"] | "FINALIZED";
  terminalId?: string;
  operatorName: string;
  announcerName: string;
  scorerName: string;
  expectedVersion?: number;
  reason?: string;
  forceMaximumTime?: boolean;
};
type FinalizePayload = {
  stage?: "SAVE" | "SCORE" | "TRANSITION";
  sessionVersion?: number;
  save: {
    slotId: string;
    scorecard: string;
    terminalId?: string;
    operatorName: string;
    announcerName: string;
    scorerName: string;
    expectedVersion?: number;
    artisticDecision?: "NORMAL" | "DISQUALIFIED" | "ORIGINALITY" | "PROHIBITED_CONTENT";
    artisticDecisionReason?: string;
  };
  score: {
    teamId: string;
    categoryId: string;
    arenaId?: string;
    scores: Array<{ columnIndex: number; value: number; data: string }>;
  };
  transition: Omit<TransitionPayload, "expectedVersion">;
};
type SurpriseDrawPayload = {
  slotId: string;
  terminalId?: string;
  operatorName: string;
  requestedChallenge?: string;
  offlineDrawnAt?: string;
  regenerate?: boolean;
};
type SurpriseDecisionPayload = {
  slotId: string;
  status: "DECLINED" | "MISSED";
  terminalId?: string;
  operatorName: string;
};
type LocalSurpriseState = {
  challengeText?: string;
  status: "DRAWN" | "DECLINED" | "MISSED";
};

function isConnectionFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed/i.test(
    message,
  );
}

export default function RefereeDashboardClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: event } = trpc.event.getById.useQuery(eventId);
  const { data: stations = [] } = trpc.operation.listStations.useQuery(eventId);
  const { data: referees = [] } = trpc.operation.listReferees.useQuery(eventId);
  const { data: phases = [] } = trpc.operation.listPhases.useQuery(eventId);
  const [stationId, setStationId] = useState("");
  const [assignedStationId, setAssignedStationId] = useState("");
  const [setupStage, setSetupStage] = useState<SetupStage>("station");
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [phaseId, setPhaseId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [screen, setScreen] = useState<RefereeScreen>("setup");
  const [operatorName, setOperatorName] = useState("");
  const [announcerName, setAnnouncerName] = useState("");
  const [scorerName, setScorerName] = useState("");
  const [deviceKey, setDeviceKey] = useState("");
  const [terminalId, setTerminalId] = useState<string>();
  const [card, setCard] = useState<RescueScorecard>(EMPTY_CARD);
  const [artisticCard, setArtisticCard] = useState<ArtisticCard>(EMPTY_ARTISTIC);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuthorizerName, setAdminAuthorizerName] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [newOfficialRole, setNewOfficialRole] = useState<
    "operator" | "announcer" | "scorer" | null
  >(null);
  const [newOfficialName, setNewOfficialName] = useState("");
  const [newOfficialAdminName, setNewOfficialAdminName] = useState("");
  const [newOfficialPassword, setNewOfficialPassword] = useState("");
  const [message, setMessage] = useState("");
  const [officialsConfirmed, setOfficialsConfirmed] = useState(false);
  const draftVersion = useRef<number | null | undefined>(undefined);
  const lastSavedDraft = useRef("");
  const hydratedSlot = useRef("");
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "offline" | "conflict"
  >("idle");
  const [draftConflict, setDraftConflict] = useState<{ scorecard: string; version: number } | null>(
    null,
  );
  const [offlineRetry, setOfflineRetry] = useState(0);
  const [offlineCommands, setOfflineCommands] = useState<OfflineCommand[]>([]);
  const [localSurprise, setLocalSurprise] = useState<Record<string, LocalSurpriseState>>({});
  const [flushingOffline, setFlushingOffline] = useState(false);
  const flushingOfflineRef = useRef(false);
  const [selectedJudge, setSelectedJudge] = useState("");
  const [artisticDecision, setArtisticDecision] = useState<
    "NORMAL" | "DISQUALIFIED" | "ORIGINALITY" | "PROHIBITED_CONTENT"
  >("NORMAL");
  const [artisticDecisionReason, setArtisticDecisionReason] = useState("");
  const [now, setNow] = useState(Date.now());
  const queueQuery = trpc.operation.stationQueue.useQuery(
    { stationId },
    { enabled: !!stationId, refetchInterval: 5000 },
  );
  const queue = queueQuery.data ?? [];
  const selectedStation = stations.find((item) => item.id === stationId);
  const surpriseQueueQuery = trpc.operation.surpriseQueue.useQuery(eventId, {
    enabled: selectedStation?.type === "CHALLENGE_TABLE",
    refetchInterval: 5000,
  });
  const surpriseOfflineKit = trpc.operation.surpriseOfflineKit.useQuery(eventId, {
    enabled: selectedStation?.type === "CHALLENGE_TABLE",
    staleTime: Infinity,
  });
  const selectedPhase = phases.find((item) => item.id === phaseId);
  const availablePhases = phases.filter(
    (phase) =>
      phase.operationalStatus === "OPEN" && queue.some((slot) => slot.phaseId === phase.id),
  );
  const phaseQueue = queue.filter((slot) => slot.phaseId === phaseId);
  const current = phaseQueue.find((item) => item.id === slotId);
  const artisticContext = trpc.operation.artisticJudgingContext.useQuery(slotId, {
    enabled:
      !!slotId &&
      !!current &&
      ["INTERVIEW", "PERFORMANCE", "EXTRA_ROUND"].includes(current.phase.type),
  });
  const currentScorecard = current?.session?.scorecard;
  const stationCheckpointTiles = selectedStation?.arena?.checkpointTiles;
  const rules = useMemo(
    () => parseRescueRuleset(selectedStation?.arena?.scoringRules),
    [selectedStation],
  );
  const effectiveRescueCard = useMemo(
    () => ({
      ...card,
      surpriseChallenge:
        (event?.surpriseChallenge ?? false) &&
        (current?.session?.surpriseEligible ?? true) &&
        card.surpriseChallenge,
    }),
    [card, current?.session?.surpriseEligible, event?.surpriseChallenge],
  );
  const result = useMemo(
    () => calculateRescueScore(rules, effectiveRescueCard),
    [rules, effectiveRescueCard],
  );
  const checkIn = trpc.operation.checkInTerminal.useMutation({
    onSuccess: ({ terminal }) => setTerminalId(terminal.id),
    onError: (error) => setMessage(error.message),
  });
  const transition = trpc.operation.transitionSession.useMutation({
    onSuccess: async (data) => {
      draftVersion.current = data.session.version;
      await queueQuery.refetch();
      setMessage("");
    },
    onError: (error) => setMessage(error.message),
  });
  const saveCard = trpc.operation.saveScorecard.useMutation({
    onError: (error) => setMessage(error.message),
  });
  const saveDraft = trpc.operation.saveScorecardDraft.useMutation();
  const saveJudgeScore = trpc.operation.saveJudgeScore.useMutation({
    onSuccess: async () => {
      await artisticContext.refetch();
      setMessage("Nota individual do jurado salva.");
    },
    onError: (error) => setMessage(error.message),
  });
  const confirmConsensus = trpc.operation.confirmArtisticConsensus.useMutation({
    onSuccess: async () => {
      await artisticContext.refetch();
      setMessage("Ficha de consenso confirmada e pronta para finalização.");
    },
    onError: (error) => setMessage(error.message),
  });
  const addOfficial = trpc.operation.addRefereeWithApproval.useMutation({
    onSuccess: async (referee) => {
      if (newOfficialRole === "operator") setOperatorName(referee.name);
      if (newOfficialRole === "announcer") setAnnouncerName(referee.name);
      if (newOfficialRole === "scorer") setScorerName(referee.name);
      await utils.operation.listReferees.invalidate(eventId);
      setNewOfficialRole(null);
      setNewOfficialName("");
      setNewOfficialAdminName("");
      setNewOfficialPassword("");
      setMessage("Árbitro cadastrado com autorização administrativa.");
    },
    onError: (error) => setMessage(error.message),
  });
  const submitScore = trpc.score.submitBatch.useMutation({
    onError: (error) => setMessage(error.message),
  });
  const drawSurprise = trpc.operation.drawSurpriseChallenge.useMutation({
    onSuccess: async () => {
      await surpriseQueueQuery.refetch();
      setMessage("Desafio sorteado e salvo. Mostre o texto à equipe.");
    },
    onError: (error) => setMessage(error.message),
  });
  const decideSurprise = trpc.operation.setSurpriseDecision.useMutation({
    onSuccess: async () => {
      await surpriseQueueQuery.refetch();
      setMessage("Situação do desafio salva.");
    },
    onError: (error) => setMessage(error.message),
  });

  function queueOfflineCommand(kind: OfflineCommand["kind"], payload: unknown) {
    const commands = enqueueOfflineCommand(window.localStorage, {
      id: crypto.randomUUID(),
      eventId,
      kind,
      payload,
    });
    setOfflineCommands(commands.filter((command) => command.eventId === eventId));
  }

  async function runOfflineCommand(command: OfflineCommand) {
    if (command.kind === "TRANSITION") {
      await transition.mutateAsync(command.payload as TransitionPayload);
      return;
    }
    if (command.kind === "DRAW_SURPRISE") {
      await drawSurprise.mutateAsync(command.payload as SurpriseDrawPayload);
      return;
    }
    if (command.kind === "DECIDE_SURPRISE") {
      await decideSurprise.mutateAsync(command.payload as SurpriseDecisionPayload);
      return;
    }
    const payload = command.payload as FinalizePayload;
    if (!payload.stage || payload.stage === "SAVE") {
      const session = await saveCard.mutateAsync(payload.save);
      payload.stage = "SCORE";
      payload.sessionVersion = session.version;
      updateOfflineCommandPayload(window.localStorage, command.id, payload);
    }
    if (payload.stage === "SCORE") {
      await submitScore.mutateAsync(payload.score);
      payload.stage = "TRANSITION";
      updateOfflineCommandPayload(window.localStorage, command.id, payload);
    }
    await transition.mutateAsync({
      ...payload.transition,
      expectedVersion: payload.sessionVersion,
    });
  }

  async function flushOfflineCommands() {
    if (flushingOfflineRef.current || !navigator.onLine) return;
    flushingOfflineRef.current = true;
    setFlushingOffline(true);
    const commands = readOfflineCommands(window.localStorage, eventId);
    for (const command of commands) {
      try {
        await runOfflineCommand(command);
        setOfflineCommands(
          removeOfflineCommand(window.localStorage, command.id).filter(
            (item) => item.eventId === eventId,
          ),
        );
        const slotId = (command.payload as { slotId?: string }).slotId;
        if (slotId)
          setLocalSurprise((current) => {
            const next = { ...current };
            delete next[slotId];
            return next;
          });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        setOfflineCommands(
          markOfflineCommandFailure(window.localStorage, command.id, reason).filter(
            (item) => item.eventId === eventId,
          ),
        );
        setMessage(`A fila offline parou para revisão: ${reason}`);
        break;
      }
    }
    flushingOfflineRef.current = false;
    setFlushingOffline(false);
    await queueQuery.refetch();
  }
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => router.push("/login") });

  useEffect(() => {
    let key = window.localStorage.getItem("valhalla-device-key");
    if (!key) {
      key = crypto.randomUUID();
      window.localStorage.setItem("valhalla-device-key", key);
    }
    setDeviceKey(key);
    try {
      const saved = JSON.parse(
        window.localStorage.getItem(`valhalla-referee-preferences:${eventId}`) ?? "{}",
      ) as TabletPreferences;
      setStationId(saved.stationId ?? "");
      setAssignedStationId(saved.stationId ?? "");
      setOperatorName(saved.operatorName ?? "");
      setAnnouncerName(saved.announcerName ?? "");
      setScorerName(saved.scorerName ?? "");
    } catch {
      // Preferências inválidas não impedem uma nova configuração do tablet.
    }
    setOfflineCommands(readOfflineCommands(window.localStorage, eventId));
    const pendingSurprise: Record<string, LocalSurpriseState> = {};
    for (const command of readOfflineCommands(window.localStorage, eventId)) {
      if (command.kind === "DRAW_SURPRISE") {
        const payload = command.payload as SurpriseDrawPayload;
        pendingSurprise[payload.slotId] = {
          status: "DRAWN",
          challengeText: payload.requestedChallenge,
        };
      }
      if (command.kind === "DECIDE_SURPRISE") {
        const payload = command.payload as SurpriseDecisionPayload;
        pendingSurprise[payload.slotId] = {
          ...pendingSurprise[payload.slotId],
          status: payload.status,
        };
      }
    }
    setLocalSurprise(pendingSurprise);
  }, [eventId]);
  useEffect(() => {
    if (!surpriseOfflineKit.data) return;
    window.localStorage.setItem(
      `valhalla-surprise-kit:${eventId}`,
      JSON.stringify(surpriseOfflineKit.data),
    );
  }, [eventId, surpriseOfflineKit.data]);
  useEffect(() => {
    const flush = () => void flushOfflineCommands();
    window.addEventListener("online", flush);
    if (navigator.onLine && readOfflineCommands(window.localStorage, eventId).length) flush();
    return () => window.removeEventListener("online", flush);
    // As mutations são estáveis; reconectar ou trocar de evento dispara o processamento da fila.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!current?.id) return;
    try {
      const localDraft =
        current.session?.state === "FINALIZED"
          ? null
          : window.localStorage.getItem(`valhalla-draft:${eventId}:${current.id}`);
      const saved = JSON.parse(localDraft ?? currentScorecard ?? "{}") as {
        card?: RescueScorecard;
        artisticCard?: ArtisticCard;
      };
      const configuredTiles = stationCheckpointTiles
        ? (JSON.parse(stationCheckpointTiles) as number[])
        : (saved.card?.checkpoints.map((checkpoint) => checkpoint.tiles) ?? []);
      const restored = saved.card;
      const restoredPlacements = restored?.victimPlacements ?? [
        ...Array.from({ length: restored?.correctVictims ?? 0 }, () => "CORRECT" as const),
        ...Array.from({ length: restored?.switchedVictims ?? 0 }, () => "SWITCHED" as const),
      ];
      setCard({
        ...EMPTY_CARD,
        ...restored,
        checkpoints: configuredTiles.map((tiles, index) => ({
          tiles,
          attempt: restored?.checkpoints[index]?.attempt ?? 0,
          status: restored?.checkpoints[index]?.status ?? "PENDING",
        })),
        challengeMarks: restored?.challengeMarks ?? {},
        victimPlacements: Array.from(
          { length: 3 },
          (_, index) => restoredPlacements[index] ?? null,
        ),
      });
      setArtisticCard(saved.artisticCard ?? EMPTY_ARTISTIC);
      draftVersion.current = current.session?.version ?? null;
      lastSavedDraft.current = localDraft ? "" : (currentScorecard ?? "");
      hydratedSlot.current = current.id;
      setDraftConflict(null);
      setDraftStatus(current.session?.draftUpdatedAt ? "saved" : "idle");
    } catch {
      setCard(EMPTY_CARD);
    }
    // O cronômetro atualiza a sessão e a fila, mas não pode reidratar e apagar o rascunho local.
    // A ficha do servidor é carregada novamente apenas ao trocar de equipe ou de configuração da arena.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, stationCheckpointTiles]);

  useEffect(() => {
    if (!current?.id || hydratedSlot.current !== current.id || !operatorName) return;
    if (current.session?.state === "FINALIZED" || screen !== "score") return;
    const payload = JSON.stringify(
      current.phase.type === "PRACTICE_ROUND"
        ? { card: effectiveRescueCard, rules, result }
        : { artisticCard, result: calculateArtisticScore(current.phase.type, artisticCard) },
    );
    if (payload === lastSavedDraft.current) return;
    const localKey = `valhalla-draft:${eventId}:${current.id}`;
    window.localStorage.setItem(localKey, payload);
    const timer = window.setTimeout(async () => {
      setDraftStatus("saving");
      try {
        const response = await saveDraft.mutateAsync({
          slotId: current.id,
          scorecard: payload,
          expectedVersion: draftVersion.current,
          terminalId,
          operatorName,
        });
        if (!response.saved && response.conflict) {
          setDraftConflict({
            scorecard: response.conflict.scorecard,
            version: response.conflict.version,
          });
          setDraftStatus("conflict");
          return;
        }
        if (!response.saved) return;
        draftVersion.current = response.session.version;
        lastSavedDraft.current = payload;
        window.localStorage.removeItem(localKey);
        setDraftStatus("saved");
      } catch {
        setDraftStatus("offline");
      }
    }, 1500);
    return () => window.clearTimeout(timer);
    // A sessão é atualizada pelo polling, mas isso não deve reiniciar o debounce nem reenviar a ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    artisticCard,
    current?.id,
    effectiveRescueCard,
    eventId,
    operatorName,
    offlineRetry,
    result,
    rules,
    screen,
    terminalId,
  ]);

  useEffect(() => {
    const retry = () => {
      if (navigator.onLine && draftStatus === "offline") {
        setDraftStatus("idle");
        setOfflineRetry((value) => value + 1);
      }
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [draftStatus]);

  const elapsed = current?.session
    ? current.session.timerAccumulatedSeconds +
      (current.session.state === "IN_PROGRESS" && current.session.startedAt
        ? Math.max(0, Math.floor((now - new Date(current.session.startedAt).getTime()) / 1000))
        : 0)
    : 0;
  const calibrationElapsed =
    current?.session?.state === "CALIBRATING" && current.session.calibrationStartedAt
      ? Math.max(
          0,
          Math.floor((now - new Date(current.session.calibrationStartedAt).getTime()) / 1000),
        )
      : 0;
  const timerLimit =
    current?.session?.state === "CALIBRATING"
      ? selectedStation?.arena
        ? rules.calibrationSeconds
        : current.phase.calibrationSeconds
      : current?.phase.type === "PERFORMANCE"
        ? 300
        : (current?.phase.durationSeconds ?? rules.roundSeconds);
  const displayedTime = Math.max(
    0,
    timerLimit - (current?.session?.state === "CALIBRATING" ? calibrationElapsed : elapsed),
  );
  const stageElapsed = current?.session?.calledAt
    ? Math.max(
        0,
        Math.floor(
          ((current.session.finishedAt ? new Date(current.session.finishedAt).getTime() : now) -
            new Date(current.session.calledAt).getTime()) /
            1000,
        ),
      )
    : 0;
  const officialsReady = !!operatorName && !!announcerName && !!scorerName;
  function persistPreferences(overrides: Partial<TabletPreferences> = {}) {
    window.localStorage.setItem(
      `valhalla-referee-preferences:${eventId}`,
      JSON.stringify({
        stationId,
        operatorName,
        announcerName,
        scorerName,
        ...overrides,
      } satisfies TabletPreferences),
    );
  }
  function applyStation(id: string) {
    setStationId(id);
    setPhaseId("");
    setSlotId("");
    setScreen("setup");
  }
  function selectStation(id: string) {
    applyStation(id);
    setSetupStage("station");
  }
  async function confirmOfficials(nextScreen: RefereeScreen) {
    if (!officialsReady || !stationId || !deviceKey) return;
    try {
      await checkIn.mutateAsync({
        eventId,
        stationId,
        deviceKey,
        deviceName: navigator.userAgent.includes("Mobile") ? "Tablet" : "Computador",
        operatorName,
      });
    } catch {
      return;
    }
    persistPreferences();
    setOfficialsConfirmed(true);
    setScreen(nextScreen);
    setMessage("Equipe de arbitragem confirmada para este tablet.");
  }
  async function confirmChallengeOperator() {
    if (!operatorName || !stationId || !deviceKey) {
      setMessage("Selecione o Juiz de Desafio responsável por este tablet.");
      return;
    }
    try {
      await checkIn.mutateAsync({
        eventId,
        stationId,
        deviceKey,
        deviceName: navigator.userAgent.includes("Mobile") ? "Tablet" : "Computador",
        operatorName,
      });
      persistPreferences();
      setOfficialsConfirmed(true);
      setMessage("Mesa de desafio pronta para os sorteios.");
    } catch {
      // A mensagem da mutation já informa o problema.
    }
  }
  function readCachedSurpriseBanks() {
    if (surpriseOfflineKit.data?.banks) return surpriseOfflineKit.data.banks;
    try {
      const cached = JSON.parse(
        window.localStorage.getItem(`valhalla-surprise-kit:${eventId}`) ?? "{}",
      ) as { banks?: Record<SurpriseChallengeLevel, string[]> };
      return cached.banks;
    } catch {
      return undefined;
    }
  }
  function queueOfflineSurpriseDraw(
    slot: NonNullable<typeof surpriseQueueQuery.data>[number],
    regenerate = false,
  ) {
    const level = slot.team.category.competitionLevel as SurpriseChallengeLevel;
    const banks = readCachedSurpriseBanks();
    if (!banks || !["LEVEL1", "LEVEL2"].includes(level) || !banks[level]?.length) {
      setMessage(
        "Sem conexão e sem banco local deste nível. Reconecte este tablet uma vez antes de operar offline.",
      );
      return;
    }
    const previous = (surpriseQueueQuery.data ?? [])
      .filter((item) => item.teamId === slot.teamId)
      .map((item) => localSurprise[item.id]?.challengeText ?? item.session?.surpriseChallengeText);
    const challenge = chooseSurpriseChallenge(banks[level], previous);
    const payload: SurpriseDrawPayload = {
      slotId: slot.id,
      terminalId,
      operatorName,
      requestedChallenge: challenge,
      offlineDrawnAt: new Date().toISOString(),
      regenerate,
    };
    queueOfflineCommand("DRAW_SURPRISE", payload);
    setLocalSurprise((current) => ({
      ...current,
      [slot.id]: { status: "DRAWN", challengeText: challenge },
    }));
    setMessage(
      `${regenerate ? "Novo sorteio" : "Sorteio"} salvo neste tablet. Será sincronizado automaticamente ao reconectar.`,
    );
  }
  async function handleSurpriseDraw(
    slot: NonNullable<typeof surpriseQueueQuery.data>[number],
    regenerate = false,
  ) {
    if (!navigator.onLine) {
      queueOfflineSurpriseDraw(slot, regenerate);
      return;
    }
    try {
      await drawSurprise.mutateAsync({ slotId: slot.id, terminalId, operatorName, regenerate });
    } catch (error) {
      if (isConnectionFailure(error)) queueOfflineSurpriseDraw(slot, regenerate);
    }
  }
  async function handleSurpriseDecision(slotId: string, status: "DECLINED" | "MISSED") {
    const payload: SurpriseDecisionPayload = { slotId, status, terminalId, operatorName };
    if (!navigator.onLine) {
      queueOfflineCommand("DECIDE_SURPRISE", payload);
      setLocalSurprise((current) => ({
        ...current,
        [slotId]: { ...current[slotId], status },
      }));
      setMessage("Decisão salva neste tablet. Será sincronizada quando a conexão voltar.");
      return;
    }
    try {
      await decideSurprise.mutateAsync(payload);
    } catch (error) {
      if (!isConnectionFailure(error)) return;
      queueOfflineCommand("DECIDE_SURPRISE", payload);
      setLocalSurprise((current) => ({
        ...current,
        [slotId]: { ...current[slotId], status },
      }));
      setMessage("Decisão salva neste tablet. Será sincronizada quando a conexão voltar.");
    }
  }
  async function executePendingAction() {
    if (!pendingAction || !current || !officialsReady) return;
    const action = pendingAction;
    const transitionPayload: TransitionPayload = {
      slotId: current.id,
      state: action.state,
      terminalId,
      operatorName,
      announcerName,
      scorerName,
      expectedVersion: draftVersion.current ?? undefined,
      reason: action.reason,
      forceMaximumTime: action.forceMaximumTime,
    };
    if (!navigator.onLine) {
      queueOfflineCommand("TRANSITION", transitionPayload);
      setPendingAction(null);
      setMessage(`${action.title} guardado. Será enviado quando a conexão voltar.`);
      return;
    }
    setMessage(`${action.title}...`);
    try {
      await transition.mutateAsync(transitionPayload);
      await queueQuery.refetch();
      if (action.state === "ABSENT" || action.state === "RESCHEDULED") {
        setSlotId("");
        setScreen("queue");
      } else if (action.state === "IN_PROGRESS") {
        setOfficialsConfirmed(false);
        setScreen("score");
      }
      setPendingAction(null);
      setMessage(`${action.title} concluído.`);
    } catch (error) {
      setPendingAction(null);
      if (!navigator.onLine || isConnectionFailure(error)) {
        queueOfflineCommand("TRANSITION", transitionPayload);
        setMessage(`${action.title} guardado. Será enviado quando a conexão voltar.`);
        return;
      }
      setMessage(
        error instanceof Error
          ? `Não foi possível concluir: ${error.message}`
          : "Não foi possível acessar o servidor. Verifique a conexão.",
      );
    }
  }
  async function pauseImmediately() {
    if (!current || !officialsReady || current.session?.state !== "IN_PROGRESS") return;
    const transitionPayload: TransitionPayload = {
      slotId: current.id,
      state: "PAUSED",
      terminalId,
      operatorName,
      announcerName,
      scorerName,
      expectedVersion: draftVersion.current ?? undefined,
    };
    if (!navigator.onLine) {
      queueOfflineCommand("TRANSITION", transitionPayload);
      setMessage("Pausa guardada. Será enviada quando a conexão voltar.");
      return;
    }
    setMessage("Pausando cronômetro...");
    try {
      await transition.mutateAsync(transitionPayload);
      await queueQuery.refetch();
      setMessage("Cronômetro pausado.");
    } catch (error) {
      if (!navigator.onLine || isConnectionFailure(error)) {
        queueOfflineCommand("TRANSITION", transitionPayload);
        setMessage("Pausa guardada. Será enviada quando a conexão voltar.");
        return;
      }
      setMessage(
        error instanceof Error
          ? `Não foi possível pausar: ${error.message}`
          : "Não foi possível acessar o servidor.",
      );
    }
  }
  async function finalize() {
    if (!current || !officialsReady) return setMessage("Selecione os árbitros envolvidos.");
    if (!officialsConfirmed)
      return setMessage("Confirme operador, anunciador e pontuador antes de finalizar.");
    const isArtistic = ["INTERVIEW", "PERFORMANCE", "EXTRA_ROUND"].includes(current.phase.type);
    const judging = artisticContext.data;
    if (isArtistic && (!judging || judging.judgeScores.length < judging.minimumJudges))
      return setMessage(
        `Salve as notas de pelo menos ${judging?.minimumJudges ?? 2} jurados antes de finalizar.`,
      );
    if (
      current.phase.type !== "INTERVIEW" &&
      isArtistic &&
      judging &&
      !judging.judgeScores.some((judge) => judging.interviewJudgeNames.includes(judge.judgeName))
    )
      return setMessage("Ao menos um jurado da apresentação deve ter participado da entrevista.");
    if (isArtistic && artisticDecision !== "NORMAL" && !artisticDecisionReason.trim())
      return setMessage(
        "Informe a fundamentação da decisão de desclassificação/originalidade/conteúdo.",
      );
    const isCorrection = current.session?.state === "FINALIZED";
    if (isArtistic && artisticDecision === "NORMAL" && judging?.consensusTotal == null)
      return setMessage("Confirme a ficha de consenso dos jurados antes de finalizar.");
    let consensusCard = artisticCard;
    if (judging?.consensusScorecard) {
      try {
        consensusCard = {
          ...EMPTY_ARTISTIC,
          ...(JSON.parse(judging.consensusScorecard) as ArtisticCard),
        };
      } catch {
        return setMessage("A ficha de consenso salva está inválida. Confirme-a novamente.");
      }
    }
    const effectiveArtisticCard =
      current.phase.type === "PERFORMANCE" || current.phase.type === "EXTRA_ROUND"
        ? {
            ...consensusCard,
            presentationSeconds: consensusCard.presentationSeconds || elapsed,
            overtimeBlocks:
              consensusCard.overtimeBlocks ||
              Math.ceil(Math.max(0, elapsed - 300, stageElapsed - 420) / 10),
          }
        : consensusCard;
    const calculatedArtistic = calculateArtisticScore(current.phase.type, effectiveArtisticCard);
    const consensusTotal = judging?.consensusTotal ?? calculatedArtistic.total;
    const artistic = { ...calculatedArtistic, total: consensusTotal };
    const payload =
      current.phase.type === "PRACTICE_ROUND"
        ? { card: effectiveRescueCard, rules, result }
        : { artisticCard: effectiveArtisticCard, result: artistic };
    const savePayload = {
      slotId: current.id,
      scorecard: JSON.stringify(payload),
      expectedVersion: draftVersion.current ?? undefined,
      terminalId,
      operatorName,
      announcerName,
      scorerName,
      adminPassword: isCorrection ? adminPassword : undefined,
      adminAuthorizerName: isCorrection ? adminAuthorizerName : undefined,
      reason: isCorrection ? correctionReason : undefined,
      artisticDecision: isArtistic ? artisticDecision : undefined,
      artisticDecisionReason: isArtistic ? artisticDecisionReason || undefined : undefined,
    };
    const scoreValue =
      current.phase.type === "PRACTICE_ROUND"
        ? result.total
        : artisticDecision === "NORMAL"
          ? current.phase.type === "EXTRA_ROUND"
            ? normalizeArtisticExtraScore(consensusTotal, current.phase.artisticNormalizationFactor)
            : consensusTotal
          : 0;
    const performanceIndex = phases
      .filter((item) => item.type === "PERFORMANCE")
      .findIndex((item) => item.id === current.phase.id);
    const columnIndex =
      current.phase.type === "INTERVIEW"
        ? 0
        : current.phase.type === "PERFORMANCE"
          ? 1 + Math.max(0, performanceIndex)
          : current.phase.type === "EXTRA_ROUND"
            ? 5
            : Math.max(0, (current.phase.sequence - 1) * 2);
    const scores = [
      { columnIndex, value: scoreValue, data: JSON.stringify(payload) },
      ...(current.phase.type === "PRACTICE_ROUND"
        ? [
            {
              columnIndex: columnIndex + 1,
              data: JSON.stringify(payload),
              value: current.session?.endedEarly
                ? rules.roundSeconds
                : Math.min(elapsed, rules.roundSeconds),
            },
          ]
        : []),
      ...(current.phase.type === "INTERVIEW"
        ? [
            {
              columnIndex: 4,
              value: effectiveArtisticCard.sustainability,
              data: JSON.stringify(payload),
            },
          ]
        : []),
      ...(current.phase.type === "PERFORMANCE"
        ? [
            {
              columnIndex: 3,
              value: (judging?.otherPresentationPenalties ?? 0) + artistic.penalties,
              data: JSON.stringify(payload),
            },
          ]
        : []),
    ];
    const scorePayload = {
      teamId: current.teamId,
      categoryId: current.team.categoryId,
      arenaId: selectedStation?.arenaId ?? undefined,
      scores,
      adminPassword: isCorrection ? adminPassword : undefined,
      adminAuthorizerName: isCorrection ? adminAuthorizerName : undefined,
      reason: isCorrection ? correctionReason : undefined,
    };
    const finalTransitionPayload = {
      slotId: current.id,
      state: "FINALIZED",
      terminalId,
      operatorName,
      announcerName,
      scorerName,
      reason: correctionReason || undefined,
    } satisfies Omit<TransitionPayload, "expectedVersion">;
    if (!navigator.onLine && !isCorrection) {
      queueOfflineCommand("FINALIZE", {
        save: savePayload,
        score: {
          teamId: scorePayload.teamId,
          categoryId: scorePayload.categoryId,
          arenaId: scorePayload.arenaId,
          scores: scorePayload.scores,
        },
        transition: finalTransitionPayload,
      } satisfies FinalizePayload);
      setMessage("Finalização guardada neste tablet. Será enviada quando a conexão voltar.");
      setSlotId("");
      setScreen("queue");
      setOfficialsConfirmed(false);
      return;
    }
    let stage: FinalizePayload["stage"] = "SAVE";
    let sessionVersion: number | undefined;
    try {
      const session = await saveCard.mutateAsync(savePayload);
      sessionVersion = session.version;
      stage = "SCORE";
      await submitScore.mutateAsync(scorePayload);
      stage = "TRANSITION";
      await transition.mutateAsync({ ...finalTransitionPayload, expectedVersion: session.version });
    } catch (error) {
      if (!isCorrection && (!navigator.onLine || isConnectionFailure(error))) {
        queueOfflineCommand("FINALIZE", {
          stage,
          sessionVersion,
          save: savePayload,
          score: {
            teamId: scorePayload.teamId,
            categoryId: scorePayload.categoryId,
            arenaId: scorePayload.arenaId,
            scores: scorePayload.scores,
          },
          transition: finalTransitionPayload,
        } satisfies FinalizePayload);
        setMessage(
          "Conexão interrompida. A finalização continuará automaticamente do ponto salvo.",
        );
        setSlotId("");
        setScreen("queue");
        setOfficialsConfirmed(false);
        return;
      }
      setMessage(error instanceof Error ? error.message : "Não foi possível finalizar a ficha.");
      return;
    }
    await Promise.all([queueQuery.refetch(), utils.score.getRanking.invalidate()]);
    setSlotId("");
    setScreen("queue");
    setOfficialsConfirmed(false);
    setMessage("Ficha finalizada e ranking atualizado.");
  }

  function resolveDraftConflict(useServer: boolean) {
    if (!draftConflict || !current) return;
    draftVersion.current = draftConflict.version;
    if (useServer) {
      try {
        const saved = JSON.parse(draftConflict.scorecard) as {
          card?: RescueScorecard;
          artisticCard?: ArtisticCard;
        };
        if (saved.card) setCard({ ...EMPTY_CARD, ...saved.card });
        if (saved.artisticCard) setArtisticCard({ ...EMPTY_ARTISTIC, ...saved.artisticCard });
        lastSavedDraft.current = draftConflict.scorecard;
      } catch {
        setMessage("A versão do servidor não pôde ser recuperada.");
      }
    } else {
      lastSavedDraft.current = "";
    }
    setDraftConflict(null);
    setDraftStatus("idle");
  }

  const surpriseAttentionCount = (surpriseQueueQuery.data ?? []).filter((slot) => {
    const status: string =
      localSurprise[slot.id]?.status ?? slot.session?.surpriseStatus ?? "PENDING";
    return (
      status === "PENDING" && getSurpriseTiming(slot.scheduledAt, new Date(now)).state !== "WAITING"
    );
  }).length;

  return (
    <div className="valhalla-shell min-h-screen pb-12">
      <header className="sticky top-0 z-40 border-b-4 border-[#f5c84c] bg-gradient-to-r from-[#153c67] via-[#5484b5] to-[#659bcf] text-white shadow-lg">
        <div className="mx-auto max-w-5xl px-3 py-2 sm:px-4">
          <div className="flex min-h-11 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] tracking-[.25em] text-blue-200">VALHALLA · OPERAÇÃO</p>
              <p className="truncate font-bold">
                {selectedStation?.name ?? "Escolha uma mesa"}
                {selectedPhase ? ` · ${selectedPhase.name}` : ""}
              </p>
              {current && (
                <p className="truncate text-xs text-blue-100">Equipe: {current.team.name}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => logout.mutate()}
              className="h-9 shrink-0 border-white/50 bg-white/10 px-3 font-semibold text-white hover:bg-white/20 hover:text-white"
            >
              Sair
            </Button>
          </div>
          {current && (screen === "run" || screen === "score") && (
            <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto] gap-2 border-t border-white/15 pt-2">
              <div className="flex min-w-0 items-center justify-between rounded-lg border border-white/15 bg-[#0d3558] px-3 py-1 shadow-inner">
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-blue-200">
                    {current?.session?.state === "CALIBRATING" ? "Calibração" : "Tempo restante"}
                  </p>
                  <div className="font-mono text-2xl font-black tabular-nums sm:text-3xl">
                    {formatTime(displayedTime)}
                  </div>
                  {current?.phase.type === "PERFORMANCE" && current.session?.calledAt && (
                    <p className="text-[10px] text-blue-100">
                      Palco total: {formatTime(stageElapsed)} / 07:00
                    </p>
                  )}
                </div>
                <Status status={current.session?.state ?? current.status} />
              </div>
              <Button
                size="sm"
                onClick={() =>
                  setPendingAction({
                    state: "IN_PROGRESS",
                    title:
                      current.session?.state === "PAUSED" ? "Retomar rodada" : "Iniciar rodada",
                    description: "O cronômetro será iniciado e a ficha será aberta.",
                  })
                }
                disabled={!current || current.session?.state === "IN_PROGRESS"}
                aria-label="Iniciar ou retomar cronômetro"
                className="h-auto min-h-12 border border-[#b9df7e] bg-[#9dcc55] px-3 text-lg font-bold text-[#123b63] shadow-sm hover:bg-[#b1dc70] hover:text-[#123b63] disabled:border-white/10 disabled:bg-white/10 disabled:text-white/40"
              >
                ▶<span className="sr-only sm:not-sr-only sm:ml-1">Play</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={pauseImmediately}
                disabled={current?.session?.state !== "IN_PROGRESS" || transition.isPending}
                aria-label="Pausar cronômetro"
                className="h-auto min-h-12 border-[#ffe08a] bg-[#f5c84c] px-3 text-lg font-bold text-[#123b63] shadow-sm hover:bg-[#ffe08a] hover:text-[#123b63] disabled:border-white/10 disabled:bg-white/10 disabled:text-white/40"
              >
                Ⅱ<span className="sr-only sm:not-sr-only sm:ml-1">Pausar</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPendingAction({
                    state: "REVIEW",
                    title: "Encerrar cronômetro",
                    description: "A rodada irá para revisão e a ficha continuará disponível.",
                  })
                }
                disabled={!current}
                aria-label="Parar cronômetro e revisar"
                className="h-auto min-h-12 border-rose-300 bg-rose-600 px-3 text-lg font-bold text-white shadow-sm hover:bg-rose-500 hover:text-white disabled:border-white/10 disabled:bg-white/10 disabled:text-white/40"
              >
                ■<span className="sr-only sm:not-sr-only sm:ml-1">Parar</span>
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
        {screen !== "challenge" && <StepTrail screen={screen} />}

        {message && (
          <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            {message}
          </p>
        )}
        {offlineCommands.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <span>
              <strong>{offlineCommands.length} ação(ões) aguardando envio.</strong> A ordem foi
              preservada neste tablet.
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={flushingOffline || (typeof navigator !== "undefined" && !navigator.onLine)}
              onClick={() => void flushOfflineCommands()}
            >
              {flushingOffline ? "Enviando…" : "Enviar agora"}
            </Button>
          </div>
        )}

        {screen === "setup" && (
          <Card>
            <CardHeader>
              <p className="text-sm font-bold text-[#164c78]">PASSO 1</p>
              <CardTitle>Onde você vai operar?</CardTitle>
              <p className="text-sm text-muted-foreground">
                Escolha primeiro a mesa e depois o turno ou rodada.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {setupStage === "station" && (
                <div>
                  <p className="mb-2 text-sm font-semibold">1. Mesa, arena ou palco</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {stations.map((station) => (
                      <button
                        key={station.id}
                        type="button"
                        onClick={() => selectStation(station.id)}
                        className={`min-h-16 rounded-xl border-2 p-4 text-left font-bold transition ${stationId === station.id ? "border-[#164c78] bg-blue-50 text-[#164c78] shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`}
                      >
                        {stationId === station.id ? "✓ " : ""}
                        {station.name}
                        {assignedStationId === station.id && (
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            Mesa vinculada a este tablet
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  {stationId && (
                    <Button
                      size="lg"
                      className="mt-4 h-12 w-full text-base sm:w-auto"
                      onClick={() => {
                        setAssignedStationId(stationId);
                        persistPreferences({ stationId });
                        if (selectedStation?.type === "CHALLENGE_TABLE") {
                          setOfficialsConfirmed(false);
                          setScreen("challenge");
                        } else {
                          setSetupStage("phase");
                        }
                      }}
                    >
                      {selectedStation?.type === "CHALLENGE_TABLE"
                        ? `Abrir ${selectedStation.name} →`
                        : `Confirmar ${selectedStation?.name} →`}
                    </Button>
                  )}
                </div>
              )}

              {setupStage === "phase" && stationId && (
                <div>
                  <Button
                    variant="outline"
                    className="mb-4"
                    onClick={() => setSetupStage("station")}
                  >
                    ← Trocar mesa
                  </Button>
                  <p className="mb-2 text-sm font-semibold">2. Turno / rodada</p>
                  {queueQuery.isLoading ? (
                    <p className="rounded-lg bg-slate-50 p-4 text-sm">Carregando agenda...</p>
                  ) : availablePhases.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {availablePhases.map((phase) => {
                        const pending = queue.filter(
                          (slot) =>
                            slot.phaseId === phase.id &&
                            !["FINALIZED", "ABSENT", "RESCHEDULED", "CANCELLED"].includes(
                              slot.status,
                            ),
                        ).length;
                        return (
                          <button
                            key={phase.id}
                            type="button"
                            onClick={() => setPhaseId(phase.id)}
                            className={`min-h-16 rounded-xl border-2 p-4 text-left transition ${phaseId === phase.id ? "border-[#164c78] bg-blue-50 text-[#164c78] shadow-sm" : "border-slate-200 bg-white hover:border-blue-300"}`}
                          >
                            <strong>
                              {phaseId === phase.id ? "✓ " : ""}
                              {phase.name}
                            </strong>
                            <span className="mt-1 block text-xs font-normal text-muted-foreground">
                              {pending} pendente{pending === 1 ? "" : "s"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Não há turnos com equipes agendadas nesta mesa.
                    </p>
                  )}
                </div>
              )}

              {setupStage === "phase" && (
                <Button
                  size="lg"
                  className="h-12 w-full text-base sm:w-auto"
                  disabled={!stationId || !phaseId}
                  onClick={() => {
                    setSlotId("");
                    setScreen("queue");
                  }}
                >
                  Abrir fila deste turno →
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {screen === "challenge" && selectedStation?.type === "CHALLENGE_TABLE" && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Button
                  variant="outline"
                  className="mb-2 w-fit"
                  onClick={() => {
                    setOfficialsConfirmed(false);
                    setScreen("setup");
                    setSetupStage("station");
                  }}
                >
                  ← Trocar mesa
                </Button>
                <p className="text-sm font-bold text-[#164c78]">MESA DE DESAFIO</p>
                <CardTitle>Sorteio do desafio surpresa</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Geração individual por equipe, 30 minutos antes da 2ª e 3ª rodadas. Se for preciso
                  gerar novamente, a substituição também fica salva no histórico.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <OfficialSelect
                  label="Juiz de Desafio neste tablet"
                  value={operatorName}
                  setValue={(value) => {
                    setOperatorName(value);
                    setOfficialsConfirmed(false);
                  }}
                  names={referees.map((referee) => referee.name)}
                  onAddNew={() => setNewOfficialRole("operator")}
                />
                <Button
                  className="h-12 w-full sm:w-auto"
                  disabled={!operatorName || checkIn.isPending || officialsConfirmed}
                  onClick={confirmChallengeOperator}
                >
                  {officialsConfirmed ? "✓ Juiz confirmado" : "Confirmar juiz e liberar sorteios"}
                </Button>
              </CardContent>
            </Card>

            {newOfficialRole === "operator" && (
              <Card className="border-amber-300 bg-amber-50">
                <CardHeader>
                  <CardTitle>Cadastrar novo Juiz de Desafio</CardTitle>
                  <p className="text-sm text-amber-900">
                    A inclusão imediata exige autorização administrativa.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <Input
                    placeholder="Nome do novo juiz"
                    value={newOfficialName}
                    onChange={(event) => setNewOfficialName(event.target.value)}
                  />
                  <Input
                    placeholder="Nome do admin autorizador"
                    value={newOfficialAdminName}
                    onChange={(event) => setNewOfficialAdminName(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Senha do administrador"
                    value={newOfficialPassword}
                    onChange={(event) => setNewOfficialPassword(event.target.value)}
                  />
                  <div className="flex gap-2 md:col-span-3">
                    <Button
                      disabled={
                        !newOfficialName.trim() ||
                        !newOfficialAdminName.trim() ||
                        newOfficialPassword.length < 4 ||
                        addOfficial.isPending
                      }
                      onClick={() =>
                        addOfficial.mutate({
                          eventId,
                          name: newOfficialName,
                          adminAuthorizerName: newOfficialAdminName,
                          adminPassword: newOfficialPassword,
                        })
                      }
                    >
                      Autorizar e cadastrar
                    </Button>
                    <Button variant="outline" onClick={() => setNewOfficialRole(null)}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Equipes aguardadas</CardTitle>
                  {surpriseAttentionCount > 0 && (
                    <Badge className="animate-pulse bg-red-600 text-white">
                      {surpriseAttentionCount} sorteio(s) exigem atenção
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {surpriseQueueQuery.isLoading && <p>Carregando equipes...</p>}
                {(surpriseQueueQuery.data ?? []).map((slot) => {
                  const local = localSurprise[slot.id];
                  const status: string = local?.status ?? slot.session?.surpriseStatus ?? "PENDING";
                  const locked = status !== "PENDING";
                  const timing = getSurpriseTiming(slot.scheduledAt, new Date(now));
                  const drawAt = timing.drawAt;
                  const challengeText = local?.challengeText ?? slot.session?.surpriseChallengeText;
                  return (
                    <div
                      key={slot.id}
                      className={`rounded-xl border p-4 ${
                        status === "PENDING" && timing.state === "OVERDUE"
                          ? "border-red-500 bg-red-50 shadow-md"
                          : status === "PENDING" && timing.state === "DUE"
                            ? "border-orange-400 bg-orange-50"
                            : status === "PENDING" && timing.state === "UPCOMING"
                              ? "border-amber-300 bg-amber-50"
                              : "bg-white"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <strong className="text-lg text-[#153c67]">{slot.team.name}</strong>
                          <p className="text-sm text-muted-foreground">
                            {slot.phase.name} · rodada às{" "}
                            {new Date(slot.scheduledAt).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="text-sm font-semibold text-amber-800">
                            Sorteio previsto:{" "}
                            {drawAt.toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          {status === "PENDING" && timing.state !== "WAITING" && (
                            <p className="mt-1 font-bold text-red-700">
                              {timing.state === "OVERDUE"
                                ? "⚠ Sorteio atrasado"
                                : timing.state === "DUE"
                                  ? "● Sortear agora"
                                  : `Sorteio em ${Math.max(1, Math.ceil(timing.deltaMs / 60000))} min`}
                            </p>
                          )}
                        </div>
                        <Badge variant={status === "DRAWN" ? "default" : "secondary"}>
                          {surpriseStatusLabel(status)}
                        </Badge>
                      </div>
                      {challengeText && (
                        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-950">
                          <p className="text-xs font-bold uppercase tracking-wide">
                            Desafio sorteado
                          </p>
                          <p className="mt-1 whitespace-pre-wrap font-semibold">{challengeText}</p>
                        </div>
                      )}
                      {status === "DRAWN" && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <Button
                            className="h-12 bg-[#164c78] font-bold text-white hover:bg-[#153c67]"
                            disabled={!officialsConfirmed || drawSurprise.isPending}
                            onClick={() =>
                              confirm(
                                `Gerar outro desafio somente para ${slot.team.name}? O desafio atual será substituído e a troca ficará no histórico.`,
                              ) && void handleSurpriseDraw(slot, true)
                            }
                          >
                            🎲 Gerar novamente
                          </Button>
                          <Button
                            variant="outline"
                            className="h-12 border-amber-400 text-amber-900"
                            disabled={!officialsConfirmed || decideSurprise.isPending}
                            onClick={() =>
                              confirm(
                                `Registrar que ${slot.team.name} desistiu de executar o desafio já sorteado?`,
                              ) && void handleSurpriseDecision(slot.id, "DECLINED")
                            }
                          >
                            Registrar desistência
                          </Button>
                        </div>
                      )}
                      {!locked && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <Button
                            className="h-12 bg-[#8dbf45] font-bold text-[#123b63] hover:bg-[#a5d060]"
                            disabled={!officialsConfirmed || drawSurprise.isPending}
                            onClick={() =>
                              confirm(`Gerar agora o desafio individual de ${slot.team.name}?`) &&
                              void handleSurpriseDraw(slot)
                            }
                          >
                            🎲 Sortear e salvar
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!officialsConfirmed || decideSurprise.isPending}
                            onClick={() =>
                              confirm(`Registrar que ${slot.team.name} recusou o desafio?`) &&
                              void handleSurpriseDecision(slot.id, "DECLINED")
                            }
                          >
                            Equipe recusou
                          </Button>
                          <Button
                            variant="outline"
                            className="border-amber-400 text-amber-900"
                            disabled={!officialsConfirmed || decideSurprise.isPending}
                            onClick={() =>
                              confirm(
                                `Registrar que ${slot.team.name} não compareceu ao sorteio?`,
                              ) && void handleSurpriseDecision(slot.id, "MISSED")
                            }
                          >
                            Não compareceu
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {!surpriseQueueQuery.isLoading && (surpriseQueueQuery.data?.length ?? 0) === 0 && (
                  <p className="py-10 text-center text-muted-foreground">
                    Gere as filas da 2ª e 3ª rodadas práticas para listar as equipes aqui.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {screen === "queue" && (
          <Card>
            <CardHeader className="space-y-3">
              <Button variant="outline" className="w-fit" onClick={() => setScreen("setup")}>
                ← Trocar mesa ou turno
              </Button>
              <div>
                <p className="text-sm font-bold text-[#164c78]">PASSO 2</p>
                <CardTitle>Fila de {selectedStation?.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{selectedPhase?.name}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {phaseQueue.length ? (
                phaseQueue.map((slot, index) => (
                  <button
                    key={slot.id}
                    type="button"
                    onClick={async () => {
                      setSlotId(slot.id);
                      setMessage("");
                      if (officialsReady) await confirmOfficials("run");
                      else setScreen("officials");
                    }}
                    className="flex min-h-20 w-full items-center gap-3 rounded-xl border-2 border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 hover:bg-blue-50 sm:p-4"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#164c78] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <strong className="block truncate text-base sm:text-lg">
                        {slot.team.name}
                      </strong>
                      <span className="block truncate text-xs text-muted-foreground sm:text-sm">
                        {new Date(slot.scheduledAt).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}{" "}
                        · {slot.team.institution}
                      </span>
                    </span>
                    <Status status={slot.session?.state ?? slot.status} />
                    <span className="text-xl text-[#164c78]">›</span>
                  </button>
                ))
              ) : (
                <p className="py-12 text-center text-muted-foreground">Fila vazia neste turno.</p>
              )}
            </CardContent>
          </Card>
        )}

        {screen === "officials" && current && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <Button
                  variant="outline"
                  className="mb-2 w-fit"
                  onClick={() => {
                    setSlotId("");
                    setScreen("queue");
                  }}
                >
                  ← Voltar para fila
                </Button>
                <p className="text-sm font-bold text-[#164c78]">PASSO 3</p>
                <CardTitle>Confirme a equipe de arbitragem</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {current.team.name} · {current.team.institution}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <OfficialSelect
                  label="Operador deste tablet"
                  value={operatorName}
                  setValue={setOperatorName}
                  names={referees.map((r) => r.name)}
                  onAddNew={() => setNewOfficialRole("operator")}
                />
                <OfficialSelect
                  label="Árbitro anunciador"
                  value={announcerName}
                  setValue={setAnnouncerName}
                  names={referees.map((r) => r.name)}
                  onAddNew={() => setNewOfficialRole("announcer")}
                />
                <OfficialSelect
                  label="Árbitro pontuador"
                  value={scorerName}
                  setValue={setScorerName}
                  names={referees.map((r) => r.name)}
                  onAddNew={() => setNewOfficialRole("scorer")}
                />
                <Button
                  size="lg"
                  className="h-12 w-full text-base"
                  disabled={!officialsReady || checkIn.isPending}
                  onClick={() => confirmOfficials("run")}
                >
                  {checkIn.isPending ? "Confirmando..." : "Confirmar e abrir atendimento →"}
                </Button>
              </CardContent>
            </Card>

            {newOfficialRole && (
              <Card className="border-amber-300 bg-amber-50">
                <CardHeader>
                  <CardTitle>Cadastrar novo árbitro</CardTitle>
                  <p className="text-sm text-amber-900">
                    Esta inclusão exige autorização administrativa.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <Input
                    placeholder="Nome do novo árbitro"
                    value={newOfficialName}
                    onChange={(e) => setNewOfficialName(e.target.value)}
                  />
                  <Input
                    placeholder="Nome do admin autorizador"
                    value={newOfficialAdminName}
                    onChange={(e) => setNewOfficialAdminName(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Senha do administrador"
                    value={newOfficialPassword}
                    onChange={(e) => setNewOfficialPassword(e.target.value)}
                  />
                  <div className="flex gap-2 md:col-span-3">
                    <Button
                      disabled={
                        !newOfficialName.trim() ||
                        !newOfficialAdminName.trim() ||
                        newOfficialPassword.length < 4 ||
                        addOfficial.isPending
                      }
                      onClick={() =>
                        addOfficial.mutate({
                          eventId,
                          name: newOfficialName,
                          adminAuthorizerName: newOfficialAdminName,
                          adminPassword: newOfficialPassword,
                        })
                      }
                    >
                      Autorizar e cadastrar
                    </Button>
                    <Button variant="outline" onClick={() => setNewOfficialRole(null)}>
                      Cancelar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {screen === "run" && current && (
          <Card>
            <CardHeader>
              <Button
                variant="outline"
                className="mb-2 w-fit"
                onClick={() => setScreen("officials")}
              >
                ← Revisar árbitros
              </Button>
              <p className="text-sm font-bold text-[#164c78]">PASSO 4</p>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-2xl">{current.team.name}</CardTitle>
                <Status status={current.session?.state ?? current.status} />
              </div>
              <p className="text-sm text-muted-foreground">{current.team.institution}</p>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Button
                  className="h-16 text-base"
                  variant="outline"
                  disabled={transition.isPending}
                  onClick={() =>
                    setPendingAction({
                      state: "CALLED",
                      title: current.session?.callCount ? "Repetir chamada" : "Chamar equipe",
                      description: `A ${current.session?.callCount ? `${current.session.callCount + 1}ª` : "1ª"} chamada de ${current.team.name} aparecerá na tela pública.`,
                    })
                  }
                >
                  📣{" "}
                  {current.session?.callCount
                    ? `Repetir chamada · ${current.session.callCount + 1}ª`
                    : "Fazer 1ª chamada"}
                </Button>
                {(current.phase.calibrationSeconds > 0 || selectedStation?.arena) && (
                  <Button
                    className="h-16 text-base"
                    variant="outline"
                    onClick={() =>
                      setPendingAction({
                        state: "CALIBRATING",
                        title: "Iniciar calibração",
                        description: "O cronômetro de calibração começará imediatamente.",
                      })
                    }
                  >
                    ⚙ Iniciar calibração
                  </Button>
                )}
                <Button
                  className="h-16 bg-[#8dbf45] text-base font-bold text-[#123b63] hover:bg-[#a5d060]"
                  onClick={() =>
                    setPendingAction({
                      state: "IN_PROGRESS",
                      title: "Iniciar rodada",
                      description: "O cronômetro será iniciado e a ficha de pontuação será aberta.",
                    })
                  }
                >
                  ▶ Iniciar rodada
                </Button>
                <Button className="h-16 text-base" onClick={() => setScreen("score")}>
                  ✎ Abrir ficha de pontuação
                </Button>
              </div>
              <div className="grid gap-2 border-t pt-4 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-12 border-amber-400 text-amber-800"
                  onClick={() =>
                    setPendingAction({
                      state: "ABSENT",
                      title: "Marcar equipe como ausente",
                      description: "A equipe sairá desta fila. Confirme somente após as chamadas.",
                      reason: "Equipe não compareceu",
                    })
                  }
                >
                  Marcar como ausente
                </Button>
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() =>
                    setPendingAction({
                      state: "RESCHEDULED",
                      title: "Solicitar reagendamento",
                      description:
                        "A equipe será retirada desta fila e ficará marcada para reorganização.",
                      reason: "Reagendamento operacional",
                    })
                  }
                >
                  Solicitar reagendamento
                </Button>
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Próxima equipe:{" "}
                {phaseQueue[phaseQueue.findIndex((slot) => slot.id === current.id) + 1]?.team
                  .name ?? "—"}
              </p>
            </CardContent>
          </Card>
        )}

        {screen === "score" && current && (
          <div className="space-y-4">
            <Button variant="outline" onClick={() => setScreen("run")}>
              ← Voltar aos controles
            </Button>
            <div
              className={`rounded-lg border px-3 py-2 text-sm ${draftStatus === "offline" ? "border-amber-300 bg-amber-50 text-amber-900" : draftStatus === "conflict" ? "border-red-300 bg-red-50 text-red-900" : "border-blue-200 bg-blue-50 text-[#153c67]"}`}
            >
              {draftStatus === "saving"
                ? "Salvando rascunho…"
                : draftStatus === "saved"
                  ? "✓ Rascunho salvo no servidor e recuperável em outro tablet"
                  : draftStatus === "offline"
                    ? "Sem conexão: rascunho guardado neste tablet e pendente de envio"
                    : draftStatus === "conflict"
                      ? "Conflito: esta ficha também foi alterada em outro tablet"
                      : "O rascunho será salvo automaticamente"}
            </div>
            {draftConflict && (
              <Card className="border-red-300 bg-red-50">
                <CardHeader>
                  <CardTitle>Comparar versões da ficha</CardTitle>
                  <p className="text-sm">
                    A versão do servidor é a v{draftConflict.version}. Escolha qual base deve
                    continuar; nenhuma versão é apagada do histórico.
                  </p>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={() => resolveDraftConflict(true)}>
                    Recuperar versão do servidor
                  </Button>
                  <Button onClick={() => resolveDraftConflict(false)}>
                    Manter e reenviar esta versão
                  </Button>
                </CardContent>
              </Card>
            )}
            {current.phase.type === "PRACTICE_ROUND" ? (
              <PracticeSheet
                card={card}
                setCard={setCard}
                quantities={selectedStation?.arena ?? null}
                points={rules.challengePoints}
                result={result}
                surpriseEnabled={event?.surpriseChallenge ?? false}
                surpriseEligible={current.session?.surpriseEligible ?? true}
                surpriseText={current.session?.surpriseChallengeText}
              />
            ) : (
              <>
                <ArtisticSheet
                  type={current.phase.type}
                  card={artisticCard}
                  setCard={setArtisticCard}
                />
                <Card>
                  <CardHeader>
                    <CardTitle>Notas individuais dos jurados</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Mínimo: {artisticContext.data?.minimumJudges ?? "…"}. Cada jurado salva sua
                      própria ficha. Depois, o grupo confirma uma única ficha de consenso oficial.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                      <select
                        className="h-11 rounded-md border px-3"
                        value={selectedJudge}
                        onChange={(event) => setSelectedJudge(event.target.value)}
                      >
                        <option value="">Selecione o jurado desta nota…</option>
                        {referees.map((referee) => (
                          <option key={referee.id} value={referee.name}>
                            {referee.name}
                          </option>
                        ))}
                      </select>
                      <Button
                        disabled={!selectedJudge || saveJudgeScore.isPending}
                        onClick={() =>
                          (() => {
                            const judgingCard =
                              current.phase.type === "INTERVIEW"
                                ? artisticCard
                                : {
                                    ...artisticCard,
                                    presentationSeconds:
                                      artisticCard.presentationSeconds || elapsed,
                                    overtimeBlocks:
                                      artisticCard.overtimeBlocks ||
                                      Math.ceil(
                                        Math.max(0, elapsed - 300, stageElapsed - 420) / 10,
                                      ),
                                  };
                            saveJudgeScore.mutate({
                              slotId: current.id,
                              judgeName: selectedJudge,
                              scorecard: JSON.stringify(judgingCard),
                              total: calculateArtisticScore(current.phase.type, judgingCard).total,
                              terminalId,
                              operatorName,
                            });
                          })()
                        }
                      >
                        Salvar nota deste jurado
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(artisticContext.data?.judgeScores ?? []).map((judge) => (
                        <Badge key={judge.id}>
                          {judge.judgeName} · {judge.total.toFixed(1)}
                        </Badge>
                      ))}
                    </div>
                    {current.phase.type !== "INTERVIEW" && (
                      <p className="text-xs text-muted-foreground">
                        Jurado(s) da entrevista:{" "}
                        {artisticContext.data?.interviewJudgeNames.join(", ") ||
                          "nenhum registrado"}
                      </p>
                    )}
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <p className="text-sm font-semibold text-[#164c78]">
                        A ficha aberta acima será registrada como o consenso do grupo.
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          disabled={confirmConsensus.isPending}
                          onClick={() =>
                            (() => {
                              const consensusCard =
                                current.phase.type === "INTERVIEW"
                                  ? artisticCard
                                  : {
                                      ...artisticCard,
                                      presentationSeconds:
                                        artisticCard.presentationSeconds || elapsed,
                                      overtimeBlocks:
                                        artisticCard.overtimeBlocks ||
                                        Math.ceil(
                                          Math.max(0, elapsed - 300, stageElapsed - 420) / 10,
                                        ),
                                    };
                              confirmConsensus.mutate({
                                slotId: current.id,
                                scorecard: JSON.stringify(consensusCard),
                                total: calculateArtisticScore(current.phase.type, consensusCard)
                                  .total,
                                confirmedByName: scorerName || operatorName,
                                terminalId,
                                operatorName,
                              });
                            })()
                          }
                        >
                          Confirmar ficha de consenso
                        </Button>
                        {artisticContext.data?.consensusTotal != null && (
                          <Badge>
                            Consenso: {artisticContext.data.consensusTotal.toFixed(1)} ·{" "}
                            {artisticContext.data.consensusConfirmedBy}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Alterar ou salvar novamente uma nota individual invalida esta confirmação.
                      </p>
                    </div>
                    {current.phase.type === "EXTRA_ROUND" && (
                      <p className="rounded-lg bg-violet-50 p-3 text-sm text-violet-900">
                        Nota normalizada:{" "}
                        {calculateArtisticScore(current.phase.type, artisticCard).total.toFixed(1)}{" "}
                        × {current.phase.artisticNormalizationFactor} ={" "}
                        {normalizeArtisticExtraScore(
                          calculateArtisticScore(current.phase.type, artisticCard).total,
                          current.phase.artisticNormalizationFactor,
                        ).toFixed(1)}
                      </p>
                    )}
                    <div className="grid gap-2 border-t pt-3 md:grid-cols-2">
                      <label className="text-sm font-semibold">
                        Decisão oficial
                        <select
                          className="mt-1 h-10 w-full rounded border px-3"
                          value={artisticDecision}
                          onChange={(event) =>
                            setArtisticDecision(event.target.value as typeof artisticDecision)
                          }
                        >
                          <option value="NORMAL">Avaliação normal</option>
                          <option value="DISQUALIFIED">Desclassificação</option>
                          <option value="ORIGINALITY">Problema de originalidade</option>
                          <option value="PROHIBITED_CONTENT">Conteúdo proibido</option>
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        Fundamentação
                        <input
                          className="mt-1 h-10 w-full rounded border px-3"
                          value={artisticDecisionReason}
                          onChange={(event) => setArtisticDecisionReason(event.target.value)}
                          placeholder="Obrigatória para decisões especiais"
                        />
                      </label>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            <Card
              className={
                officialsConfirmed ? "border-[#8ec34a] bg-[#8ec34a]/10" : "border-[#78a7d4]"
              }
            >
              <CardHeader>
                <CardTitle>Confirme quem participou desta ficha</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Os nomes vieram preenchidos deste tablet. Você pode alterá-los sem senha.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <OfficialSelect
                    label="Operador do tablet"
                    value={operatorName}
                    setValue={(value) => {
                      setOperatorName(value);
                      setOfficialsConfirmed(false);
                    }}
                    names={referees.map((referee) => referee.name)}
                  />
                  <OfficialSelect
                    label="Árbitro anunciador"
                    value={announcerName}
                    setValue={(value) => {
                      setAnnouncerName(value);
                      setOfficialsConfirmed(false);
                    }}
                    names={referees.map((referee) => referee.name)}
                  />
                  <OfficialSelect
                    label="Árbitro pontuador"
                    value={scorerName}
                    setValue={(value) => {
                      setScorerName(value);
                      setOfficialsConfirmed(false);
                    }}
                    names={referees.map((referee) => referee.name)}
                  />
                </div>
                <Button
                  variant={officialsConfirmed ? "outline" : "default"}
                  className="h-12 w-full"
                  disabled={!officialsReady || checkIn.isPending || officialsConfirmed}
                  onClick={() => confirmOfficials("score")}
                >
                  {officialsConfirmed
                    ? "✓ Equipe de arbitragem confirmada"
                    : checkIn.isPending
                      ? "Confirmando..."
                      : "Confirmar equipe de arbitragem"}
                </Button>
              </CardContent>
            </Card>
            {current.session?.state === "FINALIZED" && (
              <Card className="border-amber-300 bg-amber-50">
                <CardHeader>
                  <CardTitle>Correção autorizada pelo administrador</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 pt-0 md:grid-cols-3">
                  <Input
                    placeholder="Nome do admin autorizador"
                    value={adminAuthorizerName}
                    onChange={(e) => setAdminAuthorizerName(e.target.value)}
                  />
                  <Input
                    placeholder="Motivo obrigatório da correção"
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="Senha do administrador"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                  />
                </CardContent>
              </Card>
            )}
            <div className="sticky bottom-3 rounded-xl border bg-white/95 p-2 shadow-xl backdrop-blur">
              {current.phase.type === "PRACTICE_ROUND" &&
                current.session?.state !== "FINALIZED" && (
                  <Button
                    variant="outline"
                    className="mb-2 h-12 w-full border-amber-400 text-amber-900"
                    onClick={() =>
                      setPendingAction({
                        state: "REVIEW",
                        title: "Encerrar a rodada agora",
                        description:
                          "Registra desistência/fim antecipado e aplica 5:00 no desempate.",
                        reason: "Fim antecipado/desistência",
                        forceMaximumTime: true,
                      })
                    }
                  >
                    Fim da rodada / desistência
                  </Button>
                )}
              <Button
                size="lg"
                className="h-14 w-full text-base"
                onClick={finalize}
                disabled={
                  !officialsConfirmed ||
                  saveCard.isPending ||
                  submitScore.isPending ||
                  transition.isPending
                }
              >
                {saveCard.isPending || submitScore.isPending || transition.isPending
                  ? "Salvando..."
                  : "Finalizar ficha e atualizar ranking"}
              </Button>
            </div>
          </div>
        )}
      </main>
      {pendingAction && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-action-title"
        >
          <Card className="w-full max-w-md border-2 border-white shadow-2xl">
            <CardHeader>
              <p className="text-sm font-bold text-[#164c78]">CONFIRMAR AÇÃO</p>
              <CardTitle id="confirm-action-title" className="text-2xl">
                {pendingAction.title}?
              </CardTitle>
              <p className="text-sm text-muted-foreground">{pendingAction.description}</p>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-12"
                disabled={transition.isPending}
                onClick={() => setPendingAction(null)}
              >
                Cancelar
              </Button>
              <Button
                className="h-12 font-bold"
                disabled={transition.isPending}
                onClick={executePendingAction}
              >
                {transition.isPending ? "Processando..." : "Sim, confirmar"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StepTrail({ screen }: { screen: RefereeScreen }) {
  const steps = [
    { id: "setup", label: "Mesa" },
    { id: "queue", label: "Fila" },
    { id: "officials", label: "Árbitros" },
    { id: "run", label: "Rodada" },
    { id: "score", label: "Ficha" },
  ] as const;
  const currentIndex = steps.findIndex((step) => step.id === screen);

  return (
    <ol className="flex items-center overflow-hidden rounded-xl border bg-white px-2 py-3 shadow-sm">
      {steps.map((step, index) => (
        <li key={step.id} className="flex min-w-0 flex-1 items-center">
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index <= currentIndex ? "bg-[#164c78] text-white" : "bg-slate-200 text-slate-500"}`}
          >
            {index < currentIndex ? "✓" : index + 1}
          </span>
          <span
            className={`ml-1 hidden truncate text-xs font-semibold min-[430px]:block ${index === currentIndex ? "text-[#164c78]" : "text-slate-500"}`}
          >
            {step.label}
          </span>
          {index < steps.length - 1 && (
            <span
              className={`mx-1 h-px flex-1 ${index < currentIndex ? "bg-[#164c78]" : "bg-slate-200"}`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

function PracticeSheet({
  card,
  setCard,
  quantities,
  points,
  result,
  surpriseEnabled,
  surpriseEligible,
  surpriseText,
}: {
  card: RescueScorecard;
  setCard: (card: RescueScorecard) => void;
  quantities: {
    seesaws: number;
    intersections: number;
    obstacles: number;
    ramps: number;
    gaps: number;
    speedBumps: number;
  } | null;
  points: Record<string, number>;
  result: { base: number; multiplier: number; total: number; failures: number };
  surpriseEnabled: boolean;
  surpriseEligible: boolean;
  surpriseText?: string | null;
}) {
  const victimPlacements = card.victimPlacements ?? [null, null, null];
  function updateVictim(index: number, placement: "CORRECT" | "SWITCHED" | null) {
    const next = Array.from(
      { length: 3 },
      (_, victimIndex) => victimPlacements[victimIndex] ?? null,
    );
    next[index] = placement;
    setCard({
      ...card,
      victimPlacements: next,
      correctVictims: next.filter((value) => value === "CORRECT").length,
      switchedVictims: next.filter((value) => value === "SWITCHED").length,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ficha de pontuação prática</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Toggle
          label="Robô superou o ladrilho de partida"
          checked={card.startTile}
          onChange={(value) => setCard({ ...card, startTile: value })}
        />
        <div>
          <h3 className="font-bold">Trechos entre checkpoints</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Marque em qual tentativa o robô alcançou cada checkpoint. Toque novamente para
            desmarcar.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {card.checkpoints.map((checkpoint, index) => (
              <div key={index} className="rounded-xl border bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <strong>Checkpoint {index + 1}</strong>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-muted-foreground shadow-sm">
                    {checkpoint.tiles} ladrilho{checkpoint.tiles === 1 ? "" : "s"} no trecho
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((attempt) => {
                    const selected =
                      checkpoint.attempt === attempt && checkpoint.status === "REACHED";
                    return (
                      <button
                        key={attempt}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setCard({
                            ...card,
                            checkpoints: card.checkpoints.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    attempt: selected ? 0 : attempt,
                                    status: selected ? "PENDING" : "REACHED",
                                  }
                                : item,
                            ),
                          })
                        }
                        className={`min-h-16 rounded-xl border-2 text-center transition ${selected ? "border-[#65952e] bg-[#8ec34a]/20 text-[#153c67] shadow-sm" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        <span className="block text-xl font-black">{selected ? "✓" : attempt}</span>
                        <span className="text-xs">
                          {attempt <= 3 ? `${attempt}ª tentativa` : `${attempt}ª+ · sem pontos`}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCard({
                        ...card,
                        checkpoints: card.checkpoints.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                attempt: 3,
                                status: item.status === "NOT_REACHED" ? "PENDING" : "NOT_REACHED",
                              }
                            : item,
                        ),
                      })
                    }
                    className={`min-h-11 rounded-lg border-2 text-sm font-bold ${checkpoint.status === "NOT_REACHED" ? "border-rose-500 bg-rose-50 text-rose-800" : "border-slate-200 bg-white"}`}
                  >
                    Não superado
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCard({
                        ...card,
                        checkpoints: card.checkpoints.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                attempt: Math.max(3, item.attempt),
                                status: item.status === "ABANDONED" ? "PENDING" : "ABANDONED",
                              }
                            : item,
                        ),
                      })
                    }
                    className={`min-h-11 rounded-lg border-2 text-sm font-bold ${checkpoint.status === "ABANDONED" ? "border-amber-500 bg-amber-50 text-amber-900" : "border-slate-200 bg-white"}`}
                  >
                    Trecho abandonado
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="font-bold">Elementos do percurso</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Cada quadrado representa um elemento existente na arena.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {CHALLENGES.filter(({ key }) => (quantities?.[key] ?? 0) > 0).map(({ key, label }) => {
              const total = quantities?.[key] ?? 0;
              const marks = Array.from(
                { length: total },
                (_, index) =>
                  card.challengeMarks?.[key]?.[index] ?? index < (card.challenges[key] ?? 0),
              );
              return (
                <MarkGrid
                  key={key}
                  label={label}
                  detail={`${points[key]} pontos cada`}
                  marks={marks}
                  onChange={(nextMarks) =>
                    setCard({
                      ...card,
                      challenges: {
                        ...card.challenges,
                        [key]: nextMarks.filter(Boolean).length,
                      },
                      challengeMarks: { ...card.challengeMarks, [key]: nextMarks },
                    })
                  }
                />
              );
            })}
          </div>
        </div>
        <div>
          <h3 className="font-bold">Resgate das vítimas</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Marque onde cada vítima foi entregue. Sem seleção significa que não foi resgatada.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            {["Vítima viva 1", "Vítima viva 2", "Vítima morta"].map((label, index) => (
              <div key={label} className="rounded-xl border bg-slate-50 p-3">
                <strong className="text-sm">{label}</strong>
                <div className="mt-2 grid gap-2">
                  {(
                    [
                      ["CORRECT", "Área correta · ×1,3"],
                      ["SWITCHED", "Área invertida · ×1,1"],
                    ] as const
                  ).map(([value, optionLabel]) => {
                    const selected = victimPlacements[index] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => updateVictim(index, selected ? null : value)}
                        className={`min-h-12 rounded-lg border-2 px-3 text-left text-sm font-semibold ${selected ? "border-[#65952e] bg-[#8ec34a]/20 text-[#153c67]" : "border-slate-200 bg-white text-slate-600"}`}
                      >
                        {selected ? "✓ " : "○ "}
                        {optionLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Toggle
            label="Robô concluiu o ladrilho de chegada"
            checked={card.exitReached}
            onChange={(value) => setCard({ ...card, exitReached: value })}
          />
          {surpriseEnabled && (
            <div className="space-y-2">
              {surpriseText && (
                <p className="rounded bg-blue-50 p-3 text-sm text-blue-900">
                  <strong>Desafio sorteado:</strong> {surpriseText}
                </p>
              )}
              <Toggle
                label={
                  surpriseEligible
                    ? "Desafio surpresa concluído"
                    : "Sem direito ao desafio surpresa nesta rodada"
                }
                checked={surpriseEligible && card.surpriseChallenge}
                disabled={!surpriseEligible}
                onChange={(value) => setCard({ ...card, surpriseChallenge: value })}
              />
            </div>
          )}
        </div>
        <div className="rounded-xl bg-[#164c78] p-5 text-white">
          <p>
            Base: {result.base} · Multiplicador: {result.multiplier}× · Falhas: {result.failures}
          </p>
          <p className="mt-1 text-4xl font-black">{result.total} pontos</p>
        </div>
      </CardContent>
    </Card>
  );
}
function ArtisticSheet({
  type,
  card,
  setCard,
}: {
  type: string;
  card: ArtisticCard;
  setCard: (card: ArtisticCard) => void;
}) {
  const result = calculateArtisticScore(type, card);
  const field = (key: keyof ArtisticCard, value: number) => setCard({ ...card, [key]: value });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {type === "INTERVIEW"
            ? "Ficha · Entrevista técnica"
            : type === "EXTRA_ROUND"
              ? "Ficha · Apresentação extra"
              : "Ficha · Apresentação no palco"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {type === "INTERVIEW" ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <NumberBox
                label="Software /20"
                value={card.software}
                max={20}
                onChange={(v) => field("software", v)}
              />
              <NumberBox
                label="Hardware /30"
                value={card.hardware}
                max={30}
                onChange={(v) => field("hardware", v)}
              />
              <NumberBox
                label="Dificuldade tecnológica /10"
                value={card.complexity}
                max={10}
                onChange={(v) => field("complexity", v)}
              />
              <NumberBox
                label="Engenharia e design /20"
                value={card.engineering}
                max={20}
                onChange={(v) => field("engineering", v)}
              />
              <NumberBox
                label="Trabalho em equipe /8"
                value={card.teamwork}
                max={8}
                onChange={(v) => field("teamwork", v)}
              />
              <NumberBox
                label="Recursos /12"
                value={card.resources}
                max={12}
                onChange={(v) => field("resources", v)}
              />
              <NumberBox
                label="Dedução dos juízes"
                value={card.interviewDeduction}
                onChange={(v) => field("interviewDeduction", v)}
              />
              <NumberBox
                label="Sustentabilidade extra /5"
                value={card.sustainability}
                max={5}
                onChange={(v) => field("sustainability", v)}
              />
            </div>
          </>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <NumberBox
                label="Impacto visual /30"
                value={card.visual}
                max={30}
                onChange={(v) => field("visual", v)}
              />
              <NumberBox
                label="Interação e integração /30"
                value={card.interaction}
                max={30}
                onChange={(v) => field("interaction", v)}
              />
              {card.features.map((value, index) => (
                <NumberBox
                  key={index}
                  label={`Recurso ${index + 1} /10`}
                  value={value}
                  max={10}
                  onChange={(v) =>
                    setCard({
                      ...card,
                      features: card.features.map((old, i) => (i === index ? v : old)),
                    })
                  }
                />
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <NumberBox
                label="Intervenções (−3)"
                value={card.interventions}
                onChange={(v) => field("interventions", v)}
              />
              <NumberBox
                label="Reinícios (−3)"
                value={card.restarts}
                onChange={(v) => field("restarts", v)}
              />
              <NumberBox
                label="Blocos de 10s excedidos (−3)"
                value={card.overtimeBlocks}
                onChange={(v) => field("overtimeBlocks", v)}
              />
              <NumberBox
                label="Duração da apresentação (s)"
                value={card.presentationSeconds}
                onChange={(v) => field("presentationSeconds", v)}
              />
            </div>
            {card.presentationSeconds > 0 && card.presentationSeconds < 90 && (
              <p className="rounded bg-red-50 p-3 text-sm text-red-800">
                Abaixo de 1:30: a apresentação recebe nota zero conforme o manual.
              </p>
            )}
          </>
        )}
        <div className="rounded-xl bg-[#164c78] p-5 text-white">
          <p>
            Bruto: {result.raw} · Penalidades: {result.penalties}
          </p>
          <p className="text-4xl font-black">{result.total} pontos</p>
        </div>
      </CardContent>
    </Card>
  );
}

function OfficialSelect({
  label,
  value,
  setValue,
  names,
  onAddNew,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  names: string[];
  onAddNew?: () => void;
}) {
  return (
    <label className="space-y-1 text-xs">
      <span>{label}</span>
      <select
        className="h-11 w-full rounded-md border bg-white px-3 text-sm"
        value={value}
        onChange={(e) => {
          if (e.target.value === "__ADD_NEW__") onAddNew?.();
          else setValue(e.target.value);
        }}
      >
        <option value="">Selecionar...</option>
        {names.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
        {onAddNew && <option value="__ADD_NEW__">Outro · cadastrar com admin…</option>}
      </select>
    </label>
  );
}
function MarkGrid({
  label,
  detail,
  marks,
  onChange,
}: {
  label: string;
  detail: string;
  marks: boolean[];
  onChange: (marks: boolean[]) => void;
}) {
  return (
    <div className="rounded-xl border bg-slate-50 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <strong>{label}</strong>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {marks.map((marked, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={marked}
            aria-label={`${label} ${index + 1}: ${marked ? "concluído" : "não concluído"}`}
            onClick={() =>
              onChange(marks.map((value, markIndex) => (markIndex === index ? !value : value)))
            }
            className={`aspect-square min-h-12 rounded-xl border-2 text-lg font-black transition ${marked ? "border-[#65952e] bg-[#8ec34a]/20 text-[#153c67] shadow-sm" : "border-slate-300 bg-white text-slate-500"}`}
          >
            {marked ? "✓" : index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
function Toggle({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-lg border px-4 py-3 text-left font-medium ${checked ? "border-[#65952e] bg-[#8ec34a]/15 text-[#153c67]" : "bg-white"}`}
      onClick={() => !disabled && onChange(!checked)}
    >
      {checked ? "✓ " : "○ "}
      {label}
    </button>
  );
}
function NumberBox({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) =>
          onChange(Math.max(min, Math.min(max ?? Infinity, Number(e.target.value) || 0)))
        }
      />
    </label>
  );
}
function Status({ status }: { status: string }) {
  const labels: Record<string, string> = {
    SCHEDULED: "Aguardando",
    CALLED: "Chamada",
    CALIBRATING: "Calibrando",
    IN_PROGRESS: "Em andamento",
    PAUSED: "Pausado",
    REVIEW: "Revisão",
    FINALIZED: "Finalizado",
    ABSENT: "Ausente",
    RESCHEDULED: "Reagendado",
  };
  return <Badge variant="secondary">{labels[status] ?? status}</Badge>;
}
function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function surpriseStatusLabel(status: string) {
  return (
    {
      PENDING: "Aguardando sorteio",
      DRAWN: "Sorteado",
      DECLINED: "Equipe recusou",
      MISSED: "Não compareceu",
      DEMONSTRATED: "Desafio surpresa concluído",
      NOT_DEMONSTRATED: "Desafio surpresa não concluído",
    }[status] ?? status
  );
}
