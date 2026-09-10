"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/presentation/components/ui/card";
import { Input } from "@/presentation/components/ui/input";

export function AdminRobustnessTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const { data: event } = trpc.event.getById.useQuery(eventId);
  const { data: teams = [] } = trpc.team.listByEvent.useQuery(eventId);
  const { data: appeals = [] } = trpc.robustness.listAppeals.useQuery(eventId);
  const backupQuery = trpc.robustness.exportBackup.useQuery(eventId, { enabled: false });
  const csvQuery = trpc.robustness.exportResultsCsv.useQuery(eventId, { enabled: false });
  const pdfQuery = trpc.robustness.exportResultsPdf.useQuery(eventId, { enabled: false });
  const { data: snapshots = [] } = trpc.robustness.listSnapshots.useQuery(eventId);
  const { data: diagnostics, refetch: refreshDiagnostics } = trpc.robustness.diagnostics.useQuery(
    eventId,
    { refetchInterval: 10000 },
  );
  const createSnapshot = trpc.robustness.createSnapshot.useMutation({
    onSuccess: () => utils.robustness.listSnapshots.invalidate(eventId),
  });
  const configureBackup = trpc.robustness.configureAutomaticBackup.useMutation({
    onSuccess: () => utils.event.getById.invalidate(eventId),
  });
  const validateBackup = trpc.robustness.validateBackup.useMutation();
  const testOlimpo = trpc.robustness.testOlimpoConnection.useMutation();
  const configureOlimpo = trpc.robustness.configureOlimpoSync.useMutation({
    onSuccess: () => utils.event.getById.invalidate(eventId),
  });
  const restore = trpc.robustness.restoreBackup.useMutation({
    onSuccess: () => window.location.reload(),
  });
  const createAppeal = trpc.robustness.createAppeal.useMutation({
    onSuccess: () => utils.robustness.listAppeals.invalidate(eventId),
  });
  const decide = trpc.robustness.decideAppeal.useMutation({
    onSuccess: () => utils.robustness.listAppeals.invalidate(eventId),
  });
  const homologate = trpc.robustness.homologate.useMutation({
    onSuccess: () => utils.event.getById.invalidate(eventId),
  });
  const syncOlimpo = trpc.robustness.syncOlimpo.useMutation({
    onSuccess: () => utils.event.getById.invalidate(eventId),
  });
  const [restoreFile, setRestoreFile] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ teamId: "", title: "", description: "", deadlineAt: "" });
  const [backupOperator, setBackupOperator] = useState("Administração");

  async function download(kind: "backup" | "csv") {
    const result = await (kind === "backup" ? backupQuery.refetch() : csvQuery.refetch());
    if (!result.data) return;
    const extension = kind === "backup" ? "json" : "csv";
    const blob = new Blob([result.data], {
      type: kind === "backup" ? "application/json" : "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `valhalla-${kind}-${new Date().toISOString().slice(0, 10)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  async function downloadPdf() {
    const result = await pdfQuery.refetch();
    if (!result.data) return;
    const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `valhalla-resultados-${new Date().toISOString().slice(0, 10)}.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Contingência e homologação</h2>
        <p className="text-sm text-muted-foreground">
          Backups portáveis, exportação, recursos formais e fechamento oficial dos resultados.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Manual operacional rápido</CardTitle>
        </CardHeader>
        <CardContent>
          <details className="group rounded-lg border bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold text-[#164c78]">
              Abrir procedimentos de abertura, operação e contingência
            </summary>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
              <li>
                Confira o diagnóstico, crie um snapshot manual e teste o acesso dos tablets pela
                rede local.
              </li>
              <li>
                Abra o turno em Operação, confirme arena/mesa e árbitros e só então chame a equipe.
              </li>
              <li>
                Se um tablet falhar, abra a mesma mesa em outro aparelho: o rascunho salvo será
                recuperado.
              </li>
              <li>
                Em conflito de ficha, compare as revisões antes de escolher qual versão restaurar.
              </li>
              <li>
                Se a internet cair, continue no servidor local; a sincronização com o Olimpo tentará
                novamente no próximo intervalo.
              </li>
              <li>
                Antes de homologar, publique o último lote, resolva recursos e baixe backup, CSV e
                PDF.
              </li>
            </ol>
            <a
              href="/CONTINGENCY_MANUAL.md"
              target="_blank"
              className="mt-4 inline-block text-sm font-semibold text-[#164c78]"
            >
              Abrir manual completo ↗
            </a>
          </details>
        </CardContent>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Servidor e diagnóstico</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <span className="rounded bg-green-50 p-3">
                <strong>Estado</strong>
                <br />
                {diagnostics?.status ?? "…"}
              </span>
              <span className="rounded bg-blue-50 p-3">
                <strong>Banco</strong>
                <br />
                {diagnostics?.databaseLatencyMs ?? "…"} ms
              </span>
              <span className="rounded bg-slate-50 p-3">
                <strong>Uptime</strong>
                <br />
                {diagnostics ? Math.floor(diagnostics.uptimeSeconds / 60) : "…"} min
              </span>
              <span className="rounded bg-slate-50 p-3">
                <strong>Rascunhos pendentes</strong>
                <br />
                {diagnostics?.pendingDrafts ?? "…"}
              </span>
            </div>
            <Button variant="outline" onClick={() => refreshDiagnostics()}>
              Atualizar diagnóstico
            </Button>
            <a
              href="/api/health"
              target="_blank"
              className="ml-2 text-sm font-semibold text-[#164c78]"
            >
              Abrir health check ↗
            </a>
            {diagnostics?.lastFailures.map((failure) => (
              <p key={failure.id} className="rounded bg-red-50 p-2 text-xs text-red-800">
                {new Date(failure.createdAt).toLocaleString("pt-BR")} · {failure.action} ·{" "}
                {failure.reason}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Backup e exportação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => download("backup")}>Baixar backup completo</Button>
              <Button variant="outline" onClick={() => download("csv")}>
                Exportar resultados CSV
              </Button>
              <Button variant="outline" onClick={downloadPdf}>
                Baixar PDF oficial
              </Button>
              <a
                href="/CONTINGENCY_MANUAL.md"
                target="_blank"
                className="inline-flex h-10 items-center rounded-md border bg-white px-4 text-sm font-medium"
              >
                Manual de contingência
              </a>
            </div>
            <div className="rounded-lg border p-3">
              <strong>Snapshots no servidor</strong>
              <div className="mt-2 flex flex-wrap gap-2">
                <Input
                  className="max-w-60"
                  value={backupOperator}
                  onChange={(event) => setBackupOperator(event.target.value)}
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    createSnapshot.mutate({
                      eventId,
                      createdByName: backupOperator,
                      kind: "MANUAL",
                    })
                  }
                >
                  Criar snapshot agora
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={event?.autoBackupEnabled ?? false}
                    onChange={(e) =>
                      configureBackup.mutate({
                        eventId,
                        enabled: e.target.checked,
                        intervalMinutes: event?.backupIntervalMinutes ?? 10,
                      })
                    }
                  />{" "}
                  Automático
                </label>
                <select
                  className="rounded border px-2"
                  value={event?.backupIntervalMinutes ?? 10}
                  onChange={(e) =>
                    configureBackup.mutate({
                      eventId,
                      enabled: event?.autoBackupEnabled ?? false,
                      intervalMinutes: Number(e.target.value),
                    })
                  }
                >
                  <option value="5">5 min</option>
                  <option value="10">10 min</option>
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                </select>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {snapshots.length} snapshot(s) retidos · último:{" "}
                {snapshots[0] ? new Date(snapshots[0].createdAt).toLocaleString("pt-BR") : "nenhum"}
              </p>
            </div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <strong>Restaurar backup deste evento</strong>
              <p className="mb-3 text-xs text-red-800">
                Substitui agenda, fichas, equipes, regras e histórico. As senhas atuais são
                preservadas.
              </p>
              <input
                type="file"
                accept="application/json,.json"
                className="mb-2 block text-sm"
                onChange={async (e) =>
                  setRestoreFile(e.target.files?.[0] ? await e.target.files[0].text() : "")
                }
              />
              <div className="grid gap-2 md:grid-cols-2">
                <Input
                  type="password"
                  placeholder="Senha de admin"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <Input
                  placeholder="Digite RESTAURAR"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                />
              </div>
              <Button
                className="mt-3"
                variant="destructive"
                disabled={!restoreFile || confirmation !== "RESTAURAR" || restore.isPending}
                onClick={() =>
                  restore.mutate({
                    eventId,
                    adminPassword,
                    confirmation: "RESTAURAR",
                    backup: restoreFile,
                  })
                }
              >
                Restaurar agora
              </Button>
              <Button
                className="ml-2 mt-3"
                variant="outline"
                disabled={!restoreFile || validateBackup.isPending}
                onClick={() => validateBackup.mutate({ eventId, backup: restoreFile })}
              >
                Validar sem restaurar
              </Button>
              {validateBackup.data && (
                <p className="mt-2 text-sm text-green-800">
                  ✓ Backup íntegro · {validateBackup.data.counts.teams} equipes · SHA-256{" "}
                  {validateBackup.data.checksum.slice(0, 12)}…
                </p>
              )}
              {restore.error && (
                <p className="mt-2 text-sm text-red-800">{restore.error.message}</p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Resultado oficial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              className={`rounded-xl p-5 ${event?.resultsStatus === "HOMOLOGATED" ? "border border-[#8ec34a] bg-[#8ec34a]/15 text-[#153c67]" : "bg-amber-50 text-amber-900"}`}
            >
              <p className="text-xs font-bold uppercase tracking-wider">Situação</p>
              <p className="text-2xl font-black">
                {event?.resultsStatus === "HOMOLOGATED"
                  ? "Resultados homologados"
                  : "Resultados provisórios"}
              </p>
              {event?.resultsHomologatedAt && (
                <p className="text-sm">
                  Em {new Date(event.resultsHomologatedAt).toLocaleString("pt-BR")}
                </p>
              )}
            </div>
            <Button
              onClick={() =>
                homologate.mutate({ eventId, homologated: event?.resultsStatus !== "HOMOLOGATED" })
              }
            >
              {event?.resultsStatus === "HOMOLOGATED"
                ? "Reabrir resultados"
                : "Homologar resultados"}
            </Button>
            {homologate.error && <p className="text-sm text-red-700">{homologate.error.message}</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Sincronização com o Sistema Olimpo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <Button disabled={syncOlimpo.isPending} onClick={() => syncOlimpo.mutate(eventId)}>
            {syncOlimpo.isPending ? "Enviando…" : "Enviar resultados agora"}
          </Button>
          <Button
            variant="outline"
            disabled={testOlimpo.isPending}
            onClick={() => testOlimpo.mutate(eventId)}
          >
            Testar conexão
          </Button>
          <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={event?.olimpoAutoSyncEnabled ?? false}
              onChange={(e) =>
                configureOlimpo.mutate({
                  eventId,
                  enabled: e.target.checked,
                  intervalSeconds: event?.olimpoSyncIntervalSeconds ?? 600,
                })
              }
            />
            Sincronização automática
          </label>
          <label className="text-sm">
            Intervalo
            <select
              className="ml-2 rounded border px-2 py-1"
              value={event?.olimpoSyncIntervalSeconds ?? 600}
              onChange={(e) =>
                configureOlimpo.mutate({
                  eventId,
                  enabled: event?.olimpoAutoSyncEnabled ?? false,
                  intervalSeconds: Number(e.target.value),
                })
              }
            >
              <option value="60">1 min</option>
              <option value="300">5 min</option>
              <option value="600">10 min</option>
              <option value="900">15 min</option>
              <option value="1800">30 min</option>
            </select>
          </label>
          {testOlimpo.data && (
            <span className="text-sm font-semibold text-green-800">
              Conectado · HTTP {testOlimpo.data.status}
            </span>
          )}
          <div className="text-sm">
            <strong>Última tentativa:</strong>{" "}
            {event?.olimpoLastSyncAt
              ? new Date(event.olimpoLastSyncAt).toLocaleString("pt-BR")
              : "nunca"}{" "}
            · {event?.olimpoLastSyncStatus ?? "sem status"}
          </div>
          {(syncOlimpo.error || event?.olimpoLastSyncStatus === "ERROR") && (
            <p className="w-full rounded bg-red-50 p-3 text-sm text-red-800">
              {syncOlimpo.error?.message ?? event?.olimpoLastSyncMessage}
            </p>
          )}
          <p className="w-full text-xs text-muted-foreground">
            Usa o contrato <code>{`{ steps }`}</code> do Tournamenter OBR. No modo automático, o
            próprio servidor envia mesmo sem o painel aberto.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recursos formais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 md:grid-cols-2">
            <select
              className="h-10 rounded-md border px-3"
              value={form.teamId}
              onChange={(e) => setForm((old) => ({ ...old, teamId: e.target.value }))}
            >
              <option value="">Equipe (opcional)</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name} · {team.category.name}
                </option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={form.deadlineAt}
              onChange={(e) => setForm((old) => ({ ...old, deadlineAt: e.target.value }))}
            />
            <Input
              className="md:col-span-2"
              placeholder="Título do recurso"
              value={form.title}
              onChange={(e) => setForm((old) => ({ ...old, title: e.target.value }))}
            />
            <textarea
              className="min-h-24 rounded-md border p-3 md:col-span-2"
              placeholder="Descrição e evidências"
              value={form.description}
              onChange={(e) => setForm((old) => ({ ...old, description: e.target.value }))}
            />
          </div>
          <Button
            disabled={!form.title.trim() || !form.description.trim()}
            onClick={() =>
              createAppeal.mutate(
                {
                  eventId,
                  teamId: form.teamId || undefined,
                  title: form.title,
                  description: form.description,
                  deadlineAt: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : undefined,
                },
                {
                  onSuccess: () =>
                    setForm({ teamId: "", title: "", description: "", deadlineAt: "" }),
                },
              )
            }
          >
            Registrar recurso
          </Button>
          <div className="space-y-2">
            {appeals.map((appeal) => (
              <div key={appeal.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap gap-2">
                  <strong>{appeal.title}</strong>
                  <span className="text-sm text-muted-foreground">
                    {appeal.team?.name ?? "Sem equipe"}
                  </span>
                  <select
                    className="ml-auto rounded border px-2 py-1 text-sm"
                    value={appeal.status}
                    onChange={(e) =>
                      decide.mutate({
                        id: appeal.id,
                        status: e.target.value as "OPEN" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED",
                      })
                    }
                  >
                    <option value="OPEN">Aberto</option>
                    <option value="UNDER_REVIEW">Em análise</option>
                    <option value="ACCEPTED">Deferido</option>
                    <option value="REJECTED">Indeferido</option>
                  </select>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{appeal.description}</p>
                <textarea
                  className="mt-3 min-h-20 w-full rounded border p-2 text-sm"
                  placeholder="Parecer/decisão da comissão"
                  value={decisions[appeal.id] ?? appeal.decision ?? ""}
                  onChange={(e) => setDecisions((old) => ({ ...old, [appeal.id]: e.target.value }))}
                  onBlur={(e) =>
                    decide.mutate({
                      id: appeal.id,
                      status: appeal.status as "OPEN" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED",
                      decision: e.target.value || undefined,
                    })
                  }
                />
                {appeal.deadlineAt && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Prazo: {new Date(appeal.deadlineAt).toLocaleString("pt-BR")}
                  </p>
                )}
              </div>
            ))}
            {appeals.length === 0 && (
              <p className="text-muted-foreground">Nenhum recurso registrado.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
