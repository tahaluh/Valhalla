"use client";

import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";

export function AdminAuditTab({ eventId }: { eventId: string }) {
  const { data: stations = [] } = trpc.operation.listStations.useQuery(eventId);
  const { data: terminals = [] } = trpc.operation.listTerminals.useQuery(eventId);
  const { data: teams = [] } = trpc.team.listByEvent.useQuery(eventId);
  const { data: referees = [] } = trpc.operation.listReferees.useQuery(eventId);
  const [stationId, setStationId] = useState("");
  const [terminalId, setTerminalId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const { data: logs = [], isLoading } = trpc.operation.auditLog.useQuery(
    {
      eventId,
      stationId: stationId || undefined,
      terminalId: terminalId || undefined,
      teamId: teamId || undefined,
      operatorName: operatorName || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    },
    { refetchInterval: 10000 },
  );
  const { data: drafts = [] } = trpc.operation.draftAudit.useQuery(
    {
      eventId,
      stationId: stationId || undefined,
      terminalId: terminalId || undefined,
      teamId: teamId || undefined,
      operatorName: operatorName || undefined,
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
    },
    { refetchInterval: 10000 },
  );
  const filtered = useMemo(
    () =>
      logs.filter((log) =>
        `${log.action} ${log.operatorName ?? ""} ${log.teamId ?? ""} ${log.terminalId ?? ""} ${log.reason ?? ""}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [logs, search],
  );
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold">Auditoria</h2>
        <p className="text-sm text-muted-foreground">
          Histórico imutável de tablets, mesas, sessões e alterações.
        </p>
      </div>
      <Card>
        <CardContent className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-4">
          <select
            className="h-10 rounded-md border px-3"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            <option value="">Todas as mesas</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
          >
            <option value="">Todos os tablets</option>
            {terminals.map((terminal) => (
              <option key={terminal.id} value={terminal.id}>
                {terminal.name} · {terminal.deviceKey.slice(-8)}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={operatorName}
            onChange={(e) => setOperatorName(e.target.value)}
          >
            <option value="">Todas as pessoas</option>
            {referees.map((referee) => (
              <option key={referee.id} value={referee.name}>
                {referee.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
          >
            <option value="">Todas as equipes</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
          <label className="text-xs">
            De
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs">
            Até
            <input
              type="date"
              className="mt-1 h-10 w-full rounded-md border px-3 text-sm"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <input
            className="h-10 rounded-md border px-3 xl:col-span-2"
            placeholder="Buscar ação, pessoa, tablet ou motivo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Histórico de rascunhos por tablet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {drafts.slice(0, 30).map((draft) => (
            <details key={draft.id} className="rounded-lg border bg-white p-3">
              <summary className="cursor-pointer list-none text-sm">
                <strong>{draft.session.slot.team.name}</strong> · {draft.session.slot.station.name}{" "}
                · v{draft.version}
                <span className="ml-2 text-muted-foreground">
                  {draft.operatorName ?? "Operador não informado"} ·{" "}
                  {new Date(draft.createdAt).toLocaleString("pt-BR")}
                </span>
              </summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
                {pretty(draft.scorecard)}
              </pre>
            </details>
          ))}
          {!drafts.length && (
            <p className="text-sm text-muted-foreground">Nenhum rascunho para estes filtros.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Últimas ações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p>Carregando...</p>}
          {filtered.map((log) => (
            <details key={log.id} className="rounded-lg border bg-white p-3">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{actionLabel(log.action)}</strong>
                  <span className="text-sm text-muted-foreground">
                    {new Date(log.createdAt).toLocaleString("pt-BR")}
                  </span>
                  <span className="ml-auto text-sm">
                    {log.operatorName ?? log.actorRole ?? "Sistema"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Mesa: {stations.find((item) => item.id === log.stationId)?.name ?? "—"} · Tablet:{" "}
                  {terminals.find((item) => item.id === log.terminalId)?.name ??
                    log.terminalId?.slice(-8) ??
                    "—"}{" "}
                  · Equipe:{" "}
                  {teams.find((item) => item.id === log.teamId)?.name ??
                    log.teamId?.slice(-8) ??
                    "—"}
                </p>
              </summary>
              {log.reason && (
                <p className="mt-3 rounded bg-amber-50 p-2 text-sm">
                  <strong>Motivo:</strong> {log.reason}
                </p>
              )}
              {log.authorizedByName && (
                <p className="mt-2 text-sm">
                  <strong>Autorizado por:</strong> {log.authorizedByName}
                </p>
              )}
              <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
                <pre className="max-h-52 overflow-auto rounded bg-slate-950 p-3 text-slate-100">
                  {pretty(log.before)}
                </pre>
                <pre className="max-h-52 overflow-auto rounded bg-slate-950 p-3 text-slate-100">
                  {pretty(log.after)}
                </pre>
              </div>
            </details>
          ))}
          {!isLoading && filtered.length === 0 && (
            <p className="text-muted-foreground">Nenhuma ação encontrada.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function pretty(value: string | null) {
  if (!value) return "—";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}
function actionLabel(action: string) {
  return action
    .replace(/^SESSION_/, "Sessão: ")
    .replaceAll("_", " ")
    .toLocaleLowerCase("pt-BR");
}
