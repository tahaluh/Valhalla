"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/presentation/components/ui/badge";
import { Card, CardContent } from "@/presentation/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/presentation/components/ui/table";

interface CategoryListItem {
  id: string;
  name: string;
  type: string;
}

interface AdminScoringTabProps {
  eventId: string;
  categories: CategoryListItem[];
}

interface EditingCell {
  teamId: string;
  columnIndex: number;
  value: string;
  reason: string;
  adminAuthorizerName: string;
}

export function AdminScoringTab({ eventId, categories }: AdminScoringTabProps) {
  const utils = trpc.useUtils();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categories[0]?.id ?? "");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [saveError, setSaveError] = useState("");
  const [publisherName, setPublisherName] = useState("Administração");
  const [publicationNote, setPublicationNote] = useState("");
  const { data: publicationBatches = [] } = trpc.score.listPublicationBatches.useQuery(eventId);

  const { data: rankingData, isLoading: loadingRanking } = trpc.score.getRanking.useQuery(
    selectedCategoryId,
    { enabled: !!selectedCategoryId },
  );
  const { data: history } = trpc.score.getHistory.useQuery(
    { categoryId: selectedCategoryId },
    { enabled: !!selectedCategoryId },
  );

  const submitScoreMutation = trpc.score.submitScore.useMutation({
    onSuccess: async () => {
      setSaveError("");
      setEditingCell(null);
      await utils.score.getRanking.invalidate(selectedCategoryId);
    },
    onError: (err) => {
      setSaveError(err.message || "Erro ao salvar a pontuação.");
    },
  });
  const publishMutation = trpc.score.publishRanking.useMutation({
    onSuccess: async () => {
      await utils.score.getRanking.invalidate();
      await utils.score.listPublicationBatches.invalidate(eventId);
    },
  });
  const restoreBatch = trpc.score.restorePublicationBatch.useMutation({
    onSuccess: async () => {
      await utils.score.getRanking.invalidate();
      await utils.score.listPublicationBatches.invalidate(eventId);
    },
  });
  const publicationModeMutation = trpc.score.setPublicationMode.useMutation({
    onSuccess: async () => {
      await utils.score.getRanking.invalidate();
    },
  });

  function handleEditScore(teamId: string, columnIndex: number, currentValue: number) {
    setEditingCell({
      teamId,
      columnIndex,
      value: currentValue.toString(),
      reason: "",
      adminAuthorizerName: "",
    });
    setSaveError("");
  }

  function handleSaveScore() {
    if (!editingCell || !selectedCategoryId) return;

    const newValue = parseFloat(editingCell.value);
    if (isNaN(newValue)) {
      setSaveError("Valor inválido");
      return;
    }
    if (!editingCell.reason.trim() || !editingCell.adminAuthorizerName.trim()) {
      setSaveError("Informe o motivo e o nome do administrador responsável.");
      return;
    }

    submitScoreMutation.mutate({
      teamId: editingCell.teamId,
      categoryId: selectedCategoryId,
      columnIndex: editingCell.columnIndex,
      value: newValue,
      reason: editingCell.reason.trim(),
      adminAuthorizerName: editingCell.adminAuthorizerName.trim(),
    });
  }

  function handleCancelEdit() {
    setEditingCell(null);
    setSaveError("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleSaveScore();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  }

  return (
    <div className="space-y-6">
      {/* Category tabs */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => {
                setSelectedCategoryId(cat.id);
                setEditingCell(null);
              }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategoryId === cat.id
                  ? "bg-[#164c78] text-white"
                  : "border bg-white text-[#526b80] hover:bg-[#e5f0f7]"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {!selectedCategoryId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Selecione uma categoria acima para editar pontuações.
          </CardContent>
        </Card>
      )}

      {selectedCategoryId && loadingRanking && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Carregando pontuações...
          </CardContent>
        </Card>
      )}

      {rankingData && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">{rankingData.category.name}</h2>
            <Badge variant={rankingData.category.type === "RESCUE" ? "default" : "secondary"}>
              {rankingData.category.type === "RESCUE" ? "Resgate" : "Artística"}
            </Badge>
          </div>

          <Card className="border-[#bfd0dc] bg-[#e5f0f7]/60">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-semibold">Publicação do ranking</p>
                <p className="text-sm text-muted-foreground">
                  {rankingData.publication.mode === "LIVE"
                    ? "Ao vivo: cada correção aparece imediatamente na tela pública."
                    : "Manual: as correções ficam em revisão até você publicar o próximo lote."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-[#e5f0f7] disabled:opacity-50"
                  disabled={
                    publicationModeMutation.isPending || rankingData.publication.mode === "LIVE"
                  }
                  onClick={() => publicationModeMutation.mutate({ eventId, mode: "LIVE" })}
                >
                  Atualizar sempre
                </button>
                <button
                  className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-[#e5f0f7] disabled:opacity-50"
                  disabled={
                    publicationModeMutation.isPending || rankingData.publication.mode === "MANUAL"
                  }
                  onClick={() => publicationModeMutation.mutate({ eventId, mode: "MANUAL" })}
                >
                  Publicar em lotes
                </button>
                {rankingData.publication.mode === "MANUAL" && (
                  <div className="grid w-full gap-2 border-t pt-3 sm:grid-cols-[1fr_2fr_auto]">
                    <input
                      className="h-10 rounded-md border bg-white px-3 text-sm"
                      value={publisherName}
                      onChange={(event) => setPublisherName(event.target.value)}
                      placeholder="Responsável"
                    />
                    <input
                      className="h-10 rounded-md border bg-white px-3 text-sm"
                      value={publicationNote}
                      onChange={(event) => setPublicationNote(event.target.value)}
                      placeholder="Observação deste lote"
                    />
                    <button
                      className="rounded-md bg-[#164c78] px-3 py-2 text-sm font-semibold text-white hover:bg-[#123b63] disabled:opacity-50"
                      disabled={publishMutation.isPending || publisherName.trim().length < 2}
                      onClick={() =>
                        publishMutation.mutate({
                          eventId,
                          createdByName: publisherName.trim(),
                          note: publicationNote.trim() || undefined,
                        })
                      }
                    >
                      {publishMutation.isPending ? "Publicando..." : "Publicar lote"}
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          {publicationBatches.length > 0 && (
            <Card>
              <CardContent className="space-y-2 py-4">
                <h3 className="font-semibold">Histórico dos lotes publicados</h3>
                {publicationBatches.map((batch) => (
                  <div
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <span>
                      <strong>{new Date(batch.createdAt).toLocaleString("pt-BR")}</strong> ·{" "}
                      {batch.createdByName}
                      {batch.note ? ` · ${batch.note}` : ""}
                    </span>
                    <button
                      className="font-semibold text-[#164c78]"
                      disabled={restoreBatch.isPending}
                      onClick={() =>
                        confirm("Restaurar exatamente os valores públicos deste lote?") &&
                        restoreBatch.mutate({
                          batchId: batch.id,
                          createdByName: publisherName.trim() || "Administração",
                          note: "Restauração solicitada no painel",
                        })
                      }
                    >
                      Restaurar publicação
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {saveError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-md text-sm">
              {saveError}
            </div>
          )}

          {rankingData.ranking.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Nenhuma equipe confirmada ou com pontuação nesta categoria.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Pos.</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Instituição</TableHead>
                      <TableHead>Cidade/UF</TableHead>
                      {rankingData.columns.map((col, i) => (
                        <TableHead key={i} className="text-right">
                          {col}
                        </TableHead>
                      ))}
                      <TableHead className="text-right font-bold">Pontuação Final</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rankingData.ranking.map((team) => (
                      <TableRow
                        key={team.teamId}
                        className={`group ${team.rank <= 3 ? "bg-yellow-50/50" : ""}`}
                      >
                        <TableCell className="font-bold">{team.rank}°</TableCell>
                        <TableCell className="font-semibold">{team.teamName}</TableCell>
                        <TableCell className="text-muted-foreground">{team.institution}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {team.city}/{team.state}
                        </TableCell>
                        {team.scores.map((score, colIdx) => (
                          <TableCell key={colIdx} className="text-right">
                            {editingCell?.teamId === team.teamId &&
                            editingCell.columnIndex === colIdx ? (
                              <div className="flex min-w-72 flex-col items-stretch gap-1">
                                <input
                                  type="number"
                                  value={editingCell.value}
                                  onChange={(e) =>
                                    setEditingCell((prev) =>
                                      prev ? { ...prev, value: e.target.value } : null,
                                    )
                                  }
                                  onKeyDown={handleKeyDown}
                                  className="w-16 px-2 py-1 border rounded-md text-right text-sm"
                                  autoFocus
                                  step="0.1"
                                />
                                <input
                                  className="rounded border px-2 py-1 text-xs"
                                  placeholder="Motivo da correção"
                                  value={editingCell.reason}
                                  onChange={(e) =>
                                    setEditingCell((old) =>
                                      old ? { ...old, reason: e.target.value } : null,
                                    )
                                  }
                                />
                                <input
                                  className="rounded border px-2 py-1 text-xs"
                                  placeholder="Admin responsável"
                                  value={editingCell.adminAuthorizerName}
                                  onChange={(e) =>
                                    setEditingCell((old) =>
                                      old ? { ...old, adminAuthorizerName: e.target.value } : null,
                                    )
                                  }
                                />
                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={handleSaveScore}
                                    disabled={submitScoreMutation.isPending}
                                    className="text-green-700"
                                  >
                                    ✓ Salvar
                                  </button>
                                  <button onClick={handleCancelEdit} className="text-red-700">
                                    ✕ Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <span>{score}</span>
                                <button
                                  onClick={() => handleEditScore(team.teamId, colIdx, score)}
                                  className="p-1 text-[#164c78] opacity-0 transition-opacity hover:text-[#123b63] group-hover:opacity-100"
                                  title="Editar"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="text-right font-bold text-[#153c67]">
                          {team.finalScore.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <div className="border-b px-4 py-3">
                <h3 className="font-semibold">Histórico de alterações</h3>
                <p className="text-sm text-muted-foreground">
                  As últimas 100 inclusões ou correções desta categoria.
                </p>
              </div>
              {history && history.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Equipe</TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead>Alteração</TableHead>
                      <TableHead>Por</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell className="font-medium">{entry.score.team.name}</TableCell>
                        <TableCell>
                          {rankingData.columns[entry.score.columnIndex] ??
                            `Campo ${entry.score.columnIndex + 1}`}
                        </TableCell>
                        <TableCell>
                          {entry.previousValue ?? "—"} → <strong>{entry.nextValue}</strong>
                          {entry.reason ? (
                            <span className="ml-2 text-muted-foreground">({entry.reason})</span>
                          ) : null}
                        </TableCell>
                        <TableCell>{entry.changedBy}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="px-4 py-6 text-sm text-muted-foreground">
                  Nenhuma alteração registrada ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
