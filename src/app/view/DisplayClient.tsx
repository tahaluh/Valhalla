"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc/client";

type DisplayConfig = {
  categoryId?: string;
  title?: string;
  message?: string;
  theme?: "OBR" | "DARK" | "LIGHT";
  maxItems?: number;
  imageUrl?: string;
};

function parseConfig(value: string): DisplayConfig {
  try {
    return JSON.parse(value) as DisplayConfig;
  } catch {
    return {};
  }
}

type RankingSnapshot = {
  rank: number;
  finalScore: number;
  scores: number[];
};

type RankingChange = {
  movement: number;
  scoreDelta: number;
  scoreChanged: boolean;
  teamName: string;
};

function stationStateLabel(state: string) {
  return (
    (
      {
        CALLED: "Chamada",
        CALIBRATING: "Calibração",
        IN_PROGRESS: "Em andamento",
        PAUSED: "Pausada",
        REVIEW: "Revisão",
        WAITING: "Aguardando",
        FINISHED: "Encerrada",
      } as Record<string, string>
    )[state] ?? state
  );
}

function MarkdownContent({ value }: { value: string }) {
  return (
    <div className="space-y-3">
      {value.split("\n").map((line, index) => {
        const image = line.match(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/);
        if (image)
          return (
            <img
              key={index}
              src={image[2]}
              alt={image[1]}
              className="mx-auto max-h-72 max-w-full rounded-2xl object-contain"
            />
          );
        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading)
          return (
            <h3 key={index} className="font-black text-[#f5c84c]">
              {heading[2]}
            </h3>
          );
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={index}>
            {parts.map((part, partIndex) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={partIndex}>{part.slice(2, -2)}</strong>
              ) : (
                part
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

export default function DisplayClient({ screenSlug }: { screenSlug?: string }) {
  const { data: event } = trpc.event.getActive.useQuery();
  const { data: views = [] } = trpc.view.listPublic.useQuery(
    { eventId: event?.id ?? "", screenSlug },
    {
      enabled: !!event?.id,
      refetchInterval: 10000,
    },
  );
  const { data: activeCalls = [] } = trpc.view.activeCalls.useQuery(event?.id ?? "", {
    enabled: !!event?.id,
    refetchInterval: 1500,
  });
  const { data: categories = [] } = trpc.category.listByEvent.useQuery(event?.id ?? "", {
    enabled: !!event?.id,
  });
  const [index, setIndex] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsThatFit, setRowsThatFit] = useState(8);
  const snapshots = useRef<Map<string, Map<string, RankingSnapshot>>>(new Map());
  const previousRects = useRef<Map<string, Map<string, DOMRect>>>(new Map());
  const rowElements = useRef<Map<string, HTMLTableRowElement>>(new Map());
  const [changes, setChanges] = useState<Record<string, RankingChange>>({});
  const [updateHeadline, setUpdateHeadline] = useState<string[]>([]);
  const current = views[index] ?? null;
  const config = useMemo(() => (current ? parseConfig(current.config) : {}), [current]);
  const categoryId = config.categoryId ?? categories[0]?.id ?? "";
  const { data: ranking } = trpc.score.getPublicRanking.useQuery(categoryId, {
    enabled: current?.type === "RANKING" && !!categoryId,
    refetchInterval: 8000,
  });
  const { data: schedule = [] } = trpc.operation.publicSchedule.useQuery(
    { eventId: event?.id ?? "", limit: 100 },
    { enabled: current?.type === "SCHEDULE" && !!event?.id, refetchInterval: 15000 },
  );
  const { data: recentCalls = [] } = trpc.view.recentCalls.useQuery(
    { eventId: event?.id ?? "", limit: 50 },
    { enabled: current?.type === "CALLS" && !!event?.id, refetchInterval: 3000 },
  );
  const { data: stationBoard = [] } = trpc.view.stationBoard.useQuery(event?.id ?? "", {
    enabled: current?.type === "STATIONS" && !!event?.id,
    refetchInterval: 5000,
  });
  const itemsPerPage = Math.max(3, Math.min(config.maxItems ?? 10, rowsThatFit));
  const itemCount =
    current?.type === "RANKING"
      ? (ranking?.ranking.length ?? 0)
      : current?.type === "SCHEDULE"
        ? schedule.length
        : current?.type === "CALLS"
          ? recentCalls.length
          : current?.type === "STATIONS"
            ? stationBoard.length
            : 1;
  const pageCount = Math.max(1, Math.ceil(itemCount / itemsPerPage));

  useEffect(() => {
    const calculate = () =>
      setRowsThatFit(Math.max(3, Math.floor((window.innerHeight - 315) / 72)));
    calculate();
    window.addEventListener("resize", calculate);
    return () => window.removeEventListener("resize", calculate);
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(() => {
      if (page + 1 < pageCount) setPage((value) => value + 1);
      else {
        setPage(0);
        setIndex((value) => (value + 1) % views.length);
      }
    }, current.durationSeconds * 1000);
    return () => window.clearTimeout(timer);
  }, [current, page, pageCount, views.length]);
  useEffect(() => {
    if (index >= views.length) setIndex(0);
  }, [index, views.length]);
  useEffect(() => setPage(0), [current?.id]);
  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") {
        if (page + 1 < pageCount) setPage((value) => value + 1);
        else {
          setPage(0);
          setIndex((value) => (value + 1) % views.length);
        }
      }
      if (event.key === "ArrowLeft") {
        if (page > 0) setPage((value) => value - 1);
        else {
          setPage(0);
          setIndex((value) => (value - 1 + views.length) % views.length);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, pageCount, views.length]);
  useLayoutEffect(() => {
    if (!ranking || !categoryId) return;
    const visibleTeams = ranking.ranking.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
    const oldSnapshot = snapshots.current.get(categoryId);
    const oldRects = previousRects.current.get(categoryId);
    const nextSnapshot = new Map<string, RankingSnapshot>();
    const nextRects = new Map<string, DOMRect>();
    const nextChanges: Record<string, RankingChange> = {};

    for (const team of visibleTeams) {
      const element = rowElements.current.get(team.teamId);
      const nextRect = element?.getBoundingClientRect();
      if (nextRect) nextRects.set(team.teamId, nextRect);
      const beforeRect = oldRects?.get(team.teamId);
      if (element && nextRect && beforeRect) {
        const offset = beforeRect.top - nextRect.top;
        if (
          Math.abs(offset) > 1 &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
          element.animate(
            [
              { transform: `translateY(${offset}px)`, zIndex: "5" },
              { transform: "translateY(0)", zIndex: "1" },
            ],
            { duration: 1400, easing: "cubic-bezier(.2,.85,.25,1)" },
          );
        }
      }
      const before = oldSnapshot?.get(team.teamId);
      const scoreChanged =
        !!before &&
        (before.finalScore !== team.finalScore ||
          before.scores.some((score, scoreIndex) => score !== team.scores[scoreIndex]));
      nextChanges[team.teamId] = {
        movement: before ? before.rank - team.rank : 0,
        scoreDelta: before ? team.finalScore - before.finalScore : 0,
        scoreChanged,
        teamName: team.teamName,
      };
      nextSnapshot.set(team.teamId, {
        rank: team.rank,
        finalScore: team.finalScore,
        scores: [...team.scores],
      });
    }

    snapshots.current.set(categoryId, nextSnapshot);
    previousRects.current.set(categoryId, nextRects);
    if (oldSnapshot) {
      const updated = Object.values(nextChanges).filter(
        (change) => change.scoreChanged || change.movement !== 0,
      );
      if (updated.length) {
        setChanges(nextChanges);
        setUpdateHeadline(updated.slice(0, 3).map((change) => change.teamName));
        const timer = window.setTimeout(() => {
          setUpdateHeadline([]);
          setChanges({});
        }, 5000);
        return () => window.clearTimeout(timer);
      }
    }
  }, [categoryId, itemsPerPage, page, ranking]);

  if (!event)
    return (
      <main className="display-shell grid min-h-screen place-items-center">
        Nenhum evento ativo.
      </main>
    );
  if (!current)
    return (
      <main className="display-shell grid min-h-screen place-items-center">
        A organização ainda não configurou a programação de exibição.
      </main>
    );

  return (
    <main
      className={`display-shell display-theme-${(config.theme ?? "OBR").toLowerCase()} min-h-screen px-10 py-8 text-white`}
    >
      {activeCalls.length > 0 && (
        <aside
          key={activeCalls.map((call) => call.id).join(":")}
          className="team-call-alert fixed inset-0 z-50 flex flex-col bg-[#153c67]/96 p-6 text-[#153c67] sm:p-10"
          role="alert"
          aria-live="assertive"
        >
          <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col justify-center">
            <p className="mb-4 text-center text-lg font-black tracking-[.3em] text-[#f5c84c]">
              📣 CHAMADAS AGORA
            </p>
            <div className="grid min-h-0 gap-4">
              {activeCalls.map((call, callIndex) => (
                <article
                  key={call.id}
                  className="flex min-h-0 items-stretch overflow-hidden rounded-3xl border-4 border-[#f5c84c] bg-[#fffdf5] shadow-2xl"
                >
                  <div className="grid w-24 shrink-0 place-items-center bg-[#f5c84c] text-center sm:w-32">
                    <div>
                      <span className="block text-3xl sm:text-5xl">📣</span>
                      {callIndex === 0 && activeCalls.length > 1 && (
                        <span className="mt-1 block text-[10px] font-black uppercase">
                          Mais recente
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 px-5 py-4 sm:px-8">
                    <p className="text-xs font-black tracking-[.2em] text-[#b34b24] sm:text-sm">
                      {call.callCount}ª CHAMADA
                    </p>
                    <p className="mt-1 truncate text-2xl font-black sm:text-4xl">{call.teamName}</p>
                    <p className="mt-1 truncate text-sm text-slate-600 sm:text-lg">
                      {call.institution}
                    </p>
                  </div>
                  <div className="flex min-w-44 flex-col justify-center bg-[#5484b5] px-5 text-white sm:min-w-64 sm:px-7">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-100">
                      Dirija-se a
                    </span>
                    <strong className="mt-1 text-xl sm:text-2xl">{call.stationName}</strong>
                    <span className="mt-1 text-xs text-blue-50 sm:text-sm">{call.phaseName}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </aside>
      )}
      <header className="mb-8 flex items-end justify-between border-b border-white/25 pb-5">
        <div className="flex items-center gap-5">
          {event.logoUrl && (
            <img
              src={event.logoUrl}
              alt="Logo do evento"
              className="max-h-20 max-w-40 object-contain"
            />
          )}
          <div>
            <p className="text-xs font-bold tracking-[0.32em] text-[#f5c84c]">
              OLIMPÍADA BRASILEIRA DE ROBÓTICA
            </p>
            <h1 className="mt-2 text-4xl font-black">{event.name}</h1>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold">{current.name}</p>
          <p className="mt-1 text-sm text-blue-100">Valhalla · OBR presencial</p>
        </div>
      </header>
      {current.type === "ANNOUNCEMENT" && (
        <section className="grid min-h-[65vh] place-items-center text-center">
          <div>
            <p className="text-2xl text-[#f5c84c]">AVISO</p>
            <h2 className="mt-5 max-w-5xl text-6xl font-black leading-tight">
              {config.title ?? current.name}
            </h2>
            <div className="mx-auto mt-8 max-w-4xl text-3xl leading-relaxed text-blue-50">
              <MarkdownContent
                value={config.message ?? "Acompanhe os próximos horários e resultados nesta tela."}
              />
            </div>
          </div>
        </section>
      )}
      {current.type === "IMAGE" && (
        <section className="grid min-h-[65vh] place-items-center">
          <img
            src={config.imageUrl}
            alt={config.title ?? current.name}
            className="max-h-[68vh] max-w-full rounded-3xl object-contain shadow-2xl"
          />
        </section>
      )}
      {current.type === "SCHEDULE" && (
        <section className="mx-auto max-w-6xl">
          <h2 className="mb-5 text-3xl font-black">{config.title ?? "Próximas atividades"}</h2>
          <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/10">
            <table className="w-full text-left text-xl">
              <thead className="bg-[#f5c84c] text-[#153c67]">
                <tr>
                  <th className="px-6 py-4">Horário</th>
                  <th>Equipe</th>
                  <th>Modalidade</th>
                  <th>Mesa / arena</th>
                </tr>
              </thead>
              <tbody>
                {schedule.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((slot) => (
                  <tr key={slot.id} className="border-t border-white/15">
                    <td className="px-6 py-5 font-bold">
                      {new Date(slot.scheduledAt).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="font-bold">
                      {slot.team.name}
                      <span className="ml-2 text-base font-normal text-blue-100">
                        {slot.team.institution}
                      </span>
                    </td>
                    <td>{slot.phase.name}</td>
                    <td>{slot.station.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {current.type === "CALLS" && (
        <section className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-sm font-bold tracking-[.2em] text-[#f5c84c]">EQUIPES CONVOCADAS</p>
              <h2 className="mt-1 text-3xl font-black">{config.title ?? "Chamadas recentes"}</h2>
            </div>
            <span className="text-sm text-blue-100">Mais recentes primeiro</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {recentCalls.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((call) => (
              <article
                key={call.id}
                className="flex min-h-24 items-center gap-4 rounded-2xl border border-white/20 bg-white/10 p-4"
              >
                <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#f5c84c] text-2xl font-black text-[#153c67]">
                  {call.callCount}ª
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-xl">{call.teamName}</strong>
                  <span className="block truncate text-sm text-blue-100">{call.institution}</span>
                  <span className="mt-1 block font-bold text-[#f5c84c]">
                    {call.stationName} · {call.phaseName}
                  </span>
                </div>
                <time className="text-lg font-bold">
                  {new Date(call.createdAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </article>
            ))}
          </div>
          {!recentCalls.length && (
            <p className="grid min-h-[45vh] place-items-center text-2xl text-blue-100">
              Nenhuma equipe chamada até o momento.
            </p>
          )}
        </section>
      )}
      {current.type === "STATIONS" && (
        <section className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="text-sm font-bold tracking-[.2em] text-[#f5c84c]">OPERAÇÃO AO VIVO</p>
              <h2 className="mt-1 text-3xl font-black">
                {config.title ?? "Mesas, arenas e palcos"}
              </h2>
            </div>
            <span className="text-sm text-blue-100">Atualização contínua</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stationBoard.slice(page * itemsPerPage, (page + 1) * itemsPerPage).map((station) => (
              <article
                key={station.id}
                className="overflow-hidden rounded-2xl border border-white/20 bg-white/10"
              >
                <div
                  className={`flex items-center justify-between px-5 py-3 ${station.state === "IN_PROGRESS" ? "bg-[#8ec34a] text-[#153c67]" : station.state === "PAUSED" || station.state === "SUSPENDED" ? "bg-[#f5c84c] text-[#153c67]" : "bg-white/15"}`}
                >
                  <strong className="text-xl">{station.name}</strong>
                  <span className="text-xs font-black uppercase">
                    {stationStateLabel(station.state)}
                  </span>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-100">
                      Agora
                    </span>
                    <p className="mt-1 truncate text-2xl font-black">
                      {station.currentTeam ?? "—"}
                    </p>
                    <p className="truncate text-sm text-blue-100">
                      {station.currentPhase ?? "Sem atendimento"}
                    </p>
                  </div>
                  <div className="border-t border-white/15 pt-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-100">
                      Próxima
                    </span>
                    <p className="mt-1 truncate text-lg font-bold">
                      {station.nextTeam ?? "Fila encerrada"}
                    </p>
                    {station.delayMinutes > 0 && (
                      <p className="mt-1 font-bold text-[#f5c84c]">
                        Atraso estimado: {station.delayMinutes} min
                      </p>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {current.type === "RANKING" && (
        <section className="mx-auto max-w-6xl">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-3xl font-black">{ranking?.category.name ?? "Ranking"}</h2>
            <span className="rounded-full bg-[#8ec34a] px-4 py-1 font-bold text-[#153c67]">
              {ranking?.publication.resultsStatus === "HOMOLOGATED" ? "HOMOLOGADO" : "PROVISÓRIO"}
            </span>
          </div>
          {updateHeadline.length > 0 && (
            <div className="ranking-update-banner mb-4 flex items-center gap-3 rounded-2xl border border-[#f5c84c]/60 bg-[#f5c84c] px-5 py-3 font-bold text-[#153c67] shadow-xl">
              <span className="text-2xl">↻</span>
              <span>
                Ranking atualizado · {updateHeadline.join(", ")}
                {updateHeadline.length === 3 ? "…" : ""}
              </span>
            </div>
          )}
          <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/10">
            <table className="w-full text-left text-xl">
              <thead className="bg-white/15 text-blue-50">
                <tr>
                  <th className="w-28 px-6 py-4">Pos.</th>
                  <th>Equipe</th>
                  <th>Instituição</th>
                  {ranking?.category.type === "RESCUE" && (
                    <>
                      <th className="text-center">R1</th>
                      <th className="text-center">R2</th>
                      <th className="text-center">R3</th>
                    </>
                  )}
                  <th className="pr-6 text-right">
                    {ranking?.category.type === "RESCUE" ? "Total · 2 melhores" : "Pontuação"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranking?.ranking
                  .slice(page * itemsPerPage, (page + 1) * itemsPerPage)
                  .map((team) => {
                    const change = changes[team.teamId];
                    const bestRescueRounds = [0, 1, 2]
                      .sort((a, b) => (team.scores[b * 2] ?? 0) - (team.scores[a * 2] ?? 0))
                      .slice(0, 2);
                    return (
                      <tr
                        key={team.teamId}
                        ref={(element) => {
                          if (element) rowElements.current.set(team.teamId, element);
                          else rowElements.current.delete(team.teamId);
                        }}
                        className={`ranking-row relative border-t border-white/15 ${team.rank <= 3 ? "bg-[#f5c84c]/15" : ""} ${change?.scoreChanged ? "ranking-row-updated" : ""} ${(change?.movement ?? 0) > 0 ? "ranking-row-rising" : (change?.movement ?? 0) < 0 ? "ranking-row-falling" : ""}`}
                      >
                        <td className="px-6 py-5 text-3xl font-black">
                          <span>
                            {team.rank === 1
                              ? "🥇"
                              : team.rank === 2
                                ? "🥈"
                                : team.rank === 3
                                  ? "🥉"
                                  : `${team.rank}º`}
                          </span>
                          <span
                            className={`ml-3 inline-block align-middle text-sm ${(change?.movement ?? 0) > 0 ? "ranking-arrow-up text-[#b9df7e]" : (change?.movement ?? 0) < 0 ? "ranking-arrow-down text-rose-300" : "text-blue-200/50"}`}
                          >
                            {(change?.movement ?? 0) > 0
                              ? `▲ ${change!.movement}`
                              : (change?.movement ?? 0) < 0
                                ? `▼ ${Math.abs(change!.movement)}`
                                : "—"}
                          </span>
                        </td>
                        <td className="font-bold">
                          {team.teamName}
                          {change?.scoreChanged && (
                            <span className="ranking-change-pill ml-3 inline-block rounded-full bg-[#f5c84c] px-2 py-1 align-middle text-[10px] font-black tracking-wider text-[#153c67]">
                              NOTA ATUALIZADA
                            </span>
                          )}
                        </td>
                        <td className="text-blue-100">{team.institution}</td>
                        {ranking.category.type === "RESCUE" &&
                          [0, 2, 4].map((scoreIndex, roundIndex) => (
                            <td key={scoreIndex} className="text-center font-mono font-bold">
                              <span
                                className={
                                  bestRescueRounds.includes(roundIndex)
                                    ? "rounded-lg bg-[#8ec34a] px-2 py-1 text-[#153c67]"
                                    : "text-blue-100"
                                }
                              >
                                {team.scores[scoreIndex]?.toFixed(0) ?? "—"}
                              </span>
                            </td>
                          ))}
                        <td className="pr-6 text-right text-3xl font-black text-[#f5c84c]">
                          {team.finalScore.toFixed(2)}
                          {change && change.scoreDelta !== 0 && (
                            <span className="ml-2 text-sm text-white">
                              {change.scoreDelta > 0 ? "+" : ""}
                              {change.scoreDelta.toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <footer className="fixed bottom-4 left-10 right-10 flex items-center gap-2 rounded-full bg-[#0d2e54]/45 p-2 backdrop-blur">
        {views.map((view, itemIndex) => (
          <button
            type="button"
            aria-label={`Abrir ${view.name}`}
            key={view.id}
            onClick={() => {
              setIndex(itemIndex);
              setPage(0);
            }}
            className={`h-2 flex-1 rounded-full transition ${itemIndex === index ? "bg-[#f5c84a]" : "bg-white/25 hover:bg-white/60"}`}
          />
        ))}
        {pageCount > 1 && (
          <span className="ml-2 shrink-0 text-xs font-bold text-white">
            {page + 1}/{pageCount}
          </span>
        )}
      </footer>
    </main>
  );
}
