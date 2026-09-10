"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { formatDateRange } from "@/lib/utils";
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

export default function RankingClient() {
  const searchParams = useSearchParams();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    searchParams.get("categoryId") ?? "",
  );

  const { data: activeEvent } = trpc.event.getActive.useQuery();
  const { data: categories } = trpc.category.listByEvent.useQuery(activeEvent?.id ?? "", {
    enabled: !!activeEvent?.id,
  });
  const { data: rankingData, isLoading: loadingRanking } = trpc.score.getPublicRanking.useQuery(
    selectedCategoryId,
    { enabled: !!selectedCategoryId, refetchInterval: 10000 },
  );
  const previousRanks = useRef<Map<string, number>>(new Map());
  const [rankMovement, setRankMovement] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!rankingData) return;
    const nextMovement: Record<string, number> = {};
    for (const team of rankingData.ranking) {
      const previousRank = previousRanks.current.get(team.teamId);
      nextMovement[team.teamId] = previousRank === undefined ? 0 : previousRank - team.rank;
    }
    previousRanks.current = new Map(rankingData.ranking.map((team) => [team.teamId, team.rank]));
    setRankMovement(nextMovement);
  }, [rankingData]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b-4 border-[#f5c84c] bg-gradient-to-r from-[#153c67] via-[#5484b5] to-[#659bcf] text-white shadow-2xl">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-[#f5c84c]">OBR · Valhalla</p>
            <h1 className="text-xl font-semibold tracking-tight">Placar</h1>
          </div>
          {activeEvent && (
            <div className="max-w-md text-right">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <p className="font-semibold">{activeEvent.name}</p>
                <Badge variant="secondary" className="rounded-sm bg-white/15 text-white">
                  Evento ativo
                </Badge>
              </div>
              <p className="mt-1 text-sm text-blue-100">
                {formatDateRange(activeEvent.startDate, activeEvent.endDate)}
                {activeEvent.location ? ` • ${activeEvent.location}` : ""}
              </p>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-5">
        {!activeEvent ? (
          <div className="text-center py-16">
            <p className="text-xl text-muted-foreground">Nenhum evento ativo no momento.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Category tabs */}
            {categories && categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                      selectedCategoryId === cat.id
                        ? "bg-[#f5c84c] text-[#153c67]"
                        : "border border-white/15 bg-white/5 text-slate-200 hover:bg-white/10"
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
                  Selecione uma categoria acima para ver o ranking.
                </CardContent>
              </Card>
            )}

            {selectedCategoryId && loadingRanking && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Carregando ranking...
                </CardContent>
              </Card>
            )}

            {rankingData && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-3xl font-black">{rankingData.category.name}</h2>
                  <Badge variant={rankingData.category.type === "RESCUE" ? "default" : "secondary"}>
                    {rankingData.category.type === "RESCUE" ? "Resgate" : "Artística"}
                  </Badge>
                </div>

                {rankingData.ranking.length === 0 ? (
                  <Card className="border-white/10 bg-white/5 text-slate-100 shadow-2xl">
                    <CardContent className="py-12 text-center text-muted-foreground">
                      Nenhuma equipe confirmada ou com pontuação nesta categoria.
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader className="bg-white/5">
                          <TableRow className="border-white/10 hover:bg-transparent text-base">
                            <TableHead className="w-24 text-slate-300">Pos.</TableHead>
                            <TableHead className="text-slate-300">Equipe</TableHead>
                            <TableHead className="text-slate-300">Instituição</TableHead>
                            <TableHead className="text-slate-300">Cidade/UF</TableHead>
                            {rankingData.columns.map((col, i) => (
                              <TableHead key={i} className="text-right text-slate-300">
                                {col}
                              </TableHead>
                            ))}
                            <TableHead className="text-right font-bold text-slate-200">
                              Pontuação Final
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rankingData.ranking.map((team) => (
                            <TableRow
                              key={team.teamId}
                              className={`border-white/10 transition-colors duration-700 hover:bg-white/5 ${team.rank <= 3 ? "bg-amber-300/10" : ""}`}
                            >
                              <TableCell>
                                <RankMedal
                                  rank={team.rank}
                                  movement={rankMovement[team.teamId] ?? 0}
                                />
                              </TableCell>
                              <TableCell className="text-lg font-bold">{team.teamName}</TableCell>
                              <TableCell className="text-base text-slate-300">
                                {team.institution}
                              </TableCell>
                              <TableCell className="text-base text-slate-300">
                                {team.city}/{team.state}
                              </TableCell>
                              {team.scores.map((score, i) => (
                                <TableCell key={i} className="text-right">
                                  {score}
                                </TableCell>
                              ))}
                              <TableCell className="text-right text-2xl font-black text-[#f5c84c]">
                                {team.finalScore.toFixed(2)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function RankMedal({ rank, movement }: { rank: number; movement: number }) {
  const position = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}°`;
  const movementLabel =
    movement > 0 ? `▲ ${movement}` : movement < 0 ? `▼ ${Math.abs(movement)}` : "—";
  const movementClass =
    movement > 0 ? "text-[#b9df7e]" : movement < 0 ? "text-rose-300" : "text-slate-500";
  return (
    <span className="flex items-center gap-2 font-mono font-bold">
      <span className="text-xl">{position}</span>
      <span className={`text-xs transition-all duration-500 ${movementClass}`}>
        {movementLabel}
      </span>
    </span>
  );
}
