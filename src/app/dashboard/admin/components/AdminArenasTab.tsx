"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/presentation/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/presentation/components/ui/card";
import {
  DEFAULT_RESCUE_RULESET_2026,
  parseRescueRuleset,
  type RescueRuleset,
} from "@/domain/entities/ruleset";

type ChallengeKey = keyof RescueRuleset["challengePoints"];
const CHALLENGES: Array<{ key: ChallengeKey; label: string }> = [
  { key: "seesaws", label: "Gangorras" },
  { key: "intersections", label: "Interseções / becos" },
  { key: "obstacles", label: "Obstáculos" },
  { key: "ramps", label: "Rampas" },
  { key: "gaps", label: "Gaps" },
  { key: "speedBumps", label: "Lombadas" },
];
type ArenaForm = {
  name: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  checkpointMode: "UNIFORM" | "INDIVIDUAL";
  uniformTiles: number;
  checkpointTiles: number[];
  quantities: Record<ChallengeKey, number>;
  rulesetName: string;
  rulesetVersion: string;
  rules: RescueRuleset;
};

function emptyForm(): ArenaForm {
  return {
    name: "",
    difficulty: "MEDIUM",
    checkpointMode: "UNIFORM",
    uniformTiles: 5,
    checkpointTiles: [5, 5, 5],
    quantities: { seesaws: 0, intersections: 0, obstacles: 0, ramps: 0, gaps: 0, speedBumps: 0 },
    rulesetName: "OBR Prática Regional 2026",
    rulesetVersion: "2026.1",
    rules: structuredClone(DEFAULT_RESCUE_RULESET_2026),
  };
}
function parseTiles(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(Number).filter(Number.isFinite) : [];
  } catch {
    return [];
  }
}

export function AdminArenasTab({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const { data: arenas = [], isLoading } = trpc.arena.listByEvent.useQuery(eventId);
  const [form, setForm] = useState<ArenaForm>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const done = () => {
    void utils.arena.listByEvent.invalidate(eventId);
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setError("");
  };
  const create = trpc.arena.create.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const update = trpc.arena.update.useMutation({
    onSuccess: done,
    onError: (e) => setError(e.message),
  });
  const remove = trpc.arena.delete.useMutation({
    onSuccess: () => utils.arena.listByEvent.invalidate(eventId),
  });
  const setTilesCount = (count: number) =>
    setForm((old) => ({
      ...old,
      checkpointTiles: Array.from(
        { length: Math.max(0, count) },
        (_, i) => old.checkpointTiles[i] ?? old.uniformTiles,
      ),
    }));
  const setUniformTiles = (value: number) =>
    setForm((old) => ({
      ...old,
      uniformTiles: value,
      checkpointTiles: old.checkpointTiles.map(() => value),
    }));
  const setRule = <K extends keyof RescueRuleset>(key: K, value: RescueRuleset[K]) =>
    setForm((old) => ({ ...old, rules: { ...old.rules, [key]: value } }));
  function edit(arena: (typeof arenas)[number]) {
    const tiles = parseTiles(arena.checkpointTiles);
    const uniform = tiles.length < 2 || tiles.every((v) => v === tiles[0]);
    setForm({
      name: arena.name,
      difficulty: arena.difficulty as ArenaForm["difficulty"],
      checkpointMode: uniform ? "UNIFORM" : "INDIVIDUAL",
      uniformTiles: tiles[0] ?? 5,
      checkpointTiles: tiles,
      quantities: {
        seesaws: arena.seesaws,
        intersections: arena.intersections,
        obstacles: arena.obstacles,
        ramps: arena.ramps,
        gaps: arena.gaps,
        speedBumps: arena.speedBumps,
      },
      rulesetName: arena.rulesetName,
      rulesetVersion: arena.rulesetVersion,
      rules: parseRescueRuleset(arena.scoringRules),
    });
    setEditingId(arena.id);
    setShowForm(true);
    setError("");
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Informe o nome da arena.");
      return;
    }
    const payload = {
      name: form.name.trim(),
      difficulty: form.difficulty,
      checkpointCount: form.checkpointTiles.length,
      checkpointTiles: form.checkpointTiles,
      ...form.quantities,
      rulesetName: form.rulesetName,
      rulesetVersion: form.rulesetVersion,
      scoringRules: form.rules,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate(payload);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold">Arenas e rulesets</h3>
          <p className="text-sm text-muted-foreground">
            Configure a pista, seus elementos e quanto cada desafio vale.
          </p>
        </div>
        {!showForm && <Button onClick={() => setShowForm(true)}>Adicionar arena</Button>}
      </div>
      {showForm && (
        <form onSubmit={submit} className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{editingId ? "Editar arena" : "Nova arena"}</CardTitle>
              <CardDescription>
                O ruleset é copiado para cada sessão para preservar o cálculo original.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Field
                label="Nome da arena"
                value={form.name}
                onChange={(v) => setForm((o) => ({ ...o, name: v }))}
              />
              <Field
                label="Ruleset"
                value={form.rulesetName}
                onChange={(v) => setForm((o) => ({ ...o, rulesetName: v }))}
              />
              <Field
                label="Versão"
                value={form.rulesetVersion}
                onChange={(v) => setForm((o) => ({ ...o, rulesetVersion: v }))}
              />
              <label className="text-sm font-medium">
                Dificuldade da arena
                <select
                  className="mt-1 h-10 w-full rounded-md border px-3"
                  value={form.difficulty}
                  onChange={(event) =>
                    setForm((old) => ({
                      ...old,
                      difficulty: event.target.value as ArenaForm["difficulty"],
                    }))
                  }
                >
                  <option value="EASY">Fácil</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HARD">Difícil</option>
                </select>
              </label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Checkpoints</CardTitle>
              <CardDescription>
                Use um padrão para todos ou informe cada trecho individualmente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={form.checkpointMode === "UNIFORM" ? "default" : "outline"}
                  onClick={() =>
                    setForm((o) => ({
                      ...o,
                      checkpointMode: "UNIFORM",
                      checkpointTiles: o.checkpointTiles.map(() => o.uniformTiles),
                    }))
                  }
                >
                  Mesmo valor para todos
                </Button>
                <Button
                  type="button"
                  variant={form.checkpointMode === "INDIVIDUAL" ? "default" : "outline"}
                  onClick={() => setForm((o) => ({ ...o, checkpointMode: "INDIVIDUAL" }))}
                >
                  Configurar individualmente
                </Button>
              </div>
              {form.checkpointMode === "UNIFORM" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField
                    label="Quantidade de checkpoints"
                    value={form.checkpointTiles.length}
                    onChange={setTilesCount}
                  />
                  <NumberField
                    label="Ladrilhos em cada checkpoint"
                    value={form.uniformTiles}
                    onChange={setUniformTiles}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {form.checkpointTiles.map((tiles, index) => (
                      <div
                        key={index}
                        className="flex items-end gap-2 rounded-lg border bg-slate-50 p-3"
                      >
                        <NumberField
                          label={`Checkpoint ${index + 1} · ladrilhos`}
                          value={tiles}
                          onChange={(value) =>
                            setForm((o) => ({
                              ...o,
                              checkpointTiles: o.checkpointTiles.map((v, i) =>
                                i === index ? value : v,
                              ),
                            }))
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            setForm((o) => ({
                              ...o,
                              checkpointTiles: o.checkpointTiles.filter((_, i) => i !== index),
                            }))
                          }
                        >
                          −
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setForm((o) => ({
                        ...o,
                        checkpointTiles: [...o.checkpointTiles, o.uniformTiles],
                      }))
                    }
                  >
                    + Adicionar checkpoint
                  </Button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                {form.rules.checkpointAttemptPoints.map((points, index) => (
                  <NumberField
                    key={index}
                    label={`${index + 1}ª tentativa · pontos/ladrilho`}
                    value={points}
                    onChange={(value) =>
                      setRule(
                        "checkpointAttemptPoints",
                        form.rules.checkpointAttemptPoints.map((v, i) => (i === index ? value : v)),
                      )
                    }
                  />
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Desafios do percurso</CardTitle>
              <CardDescription>Quantidade na arena × valor unitário do ruleset.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2">
                {CHALLENGES.map(({ key, label }) => (
                  <div key={key} className="grid grid-cols-2 gap-3 rounded-lg border p-3">
                    <NumberField
                      label={`${label} · quantidade`}
                      value={form.quantities[key]}
                      onChange={(value) =>
                        setForm((o) => ({ ...o, quantities: { ...o.quantities, [key]: value } }))
                      }
                    />
                    <NumberField
                      label="Pontos por unidade"
                      value={form.rules.challengePoints[key]}
                      onChange={(value) =>
                        setRule("challengePoints", { ...form.rules.challengePoints, [key]: value })
                      }
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tempos, bônus e multiplicadores</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <NumberField
                label="Calibração (s)"
                value={form.rules.calibrationSeconds}
                onChange={(v) => setRule("calibrationSeconds", v)}
              />
              <NumberField
                label="Rodada (s)"
                value={form.rules.roundSeconds}
                onChange={(v) => setRule("roundSeconds", v)}
              />
              <NumberField
                label="Ladrilho inicial"
                value={form.rules.startTilePoints}
                onChange={(v) => setRule("startTilePoints", v)}
              />
              <NumberField
                label="Bônus de saída"
                value={form.rules.exitBonusPoints}
                onChange={(v) => setRule("exitBonusPoints", v)}
              />
              <NumberField
                label="Desconto/falha"
                value={form.rules.exitPenaltyPerFailure}
                onChange={(v) => setRule("exitPenaltyPerFailure", v)}
              />
              <NumberField
                label="Vítima correta ×"
                value={form.rules.correctVictimMultiplier}
                step="0.1"
                onChange={(v) => setRule("correctVictimMultiplier", v)}
              />
              <NumberField
                label="Vítima invertida ×"
                value={form.rules.switchedVictimMultiplier}
                step="0.1"
                onChange={(v) => setRule("switchedVictimMultiplier", v)}
              />
              <NumberField
                label="Desafio surpresa ×"
                value={form.rules.surpriseChallengeMultiplier}
                step="0.1"
                onChange={(v) => setRule("surpriseChallengeMultiplier", v)}
              />
            </CardContent>
          </Card>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={done}>
              Cancelar
            </Button>
            <Button disabled={create.isPending || update.isPending}>
              {editingId ? "Salvar alterações" : "Criar arena"}
            </Button>
          </div>
        </form>
      )}
      {isLoading && <p>Carregando...</p>}
      {!showForm && (
        <div className="grid gap-4 lg:grid-cols-2">
          {arenas.map((arena) => {
            const rules = parseRescueRuleset(arena.scoringRules);
            return (
              <Card key={arena.id}>
                <CardHeader>
                  <div className="flex justify-between gap-3">
                    <div>
                      <CardTitle>{arena.name}</CardTitle>
                      <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-[#164c78]">
                        {arena.difficulty === "EASY"
                          ? "Fácil"
                          : arena.difficulty === "HARD"
                            ? "Difícil"
                            : "Média"}
                      </span>
                      <CardDescription>
                        {arena.rulesetName} · {arena.rulesetVersion}
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => edit(arena)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => confirm(`Remover ${arena.name}?`) && remove.mutate(arena.id)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm">
                    <strong>{arena.checkpointCount}</strong> checkpoints ·{" "}
                    {parseTiles(arena.checkpointTiles).join(" / ") || "sem ladrilhos"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {CHALLENGES.filter((c) => arena[c.key] > 0).map((c) => (
                      <span
                        key={c.key}
                        className="rounded-full border bg-slate-50 px-3 py-1 text-xs"
                      >
                        {c.label}: {arena[c.key]} × {rules.challengePoints[c.key]} pts
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        className="h-10 w-full rounded-md border px-3"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function NumberField({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
  return (
    <label className="block min-w-0 flex-1 space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        type="number"
        min="0"
        step={step}
        className="h-10 w-full rounded-md border bg-white px-3"
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </label>
  );
}
