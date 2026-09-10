"use client";

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/presentation/components/ui/button";
import { Card, CardContent } from "@/presentation/components/ui/card";

type Config = {
  categoryId?: string;
  title?: string;
  message?: string;
  theme?: "OBR" | "DARK" | "LIGHT";
  maxItems?: number;
  imageUrl?: string;
};
type Category = { id: string; name: string; type: string };
function parse(value: string): Config {
  try {
    return JSON.parse(value) as Config;
  } catch {
    return {};
  }
}

export function AdminViewsTab({
  eventId,
  categories,
}: {
  eventId: string;
  categories: Category[];
}) {
  const utils = trpc.useUtils();
  const { data: views = [] } = trpc.view.list.useQuery(eventId);
  const { data: screens = [] } = trpc.view.listScreens.useQuery(eventId);
  const [screenId, setScreenId] = useState("");
  const [newScreenName, setNewScreenName] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([utils.view.list.invalidate(eventId), utils.view.listScreens.invalidate(eventId)]);
  const create = trpc.view.create.useMutation({ onSuccess: refresh });
  const update = trpc.view.update.useMutation({ onSuccess: refresh });
  const remove = trpc.view.remove.useMutation({ onSuccess: refresh });
  const createScreen = trpc.view.createScreen.useMutation({
    onSuccess: async (screen) => {
      await refresh();
      setScreenId(screen.id);
      setNewScreenName("");
    },
  });
  const updateScreen = trpc.view.updateScreen.useMutation({ onSuccess: refresh });
  const removeScreen = trpc.view.removeScreen.useMutation({ onSuccess: refresh });
  const selectedScreen = screens.find((screen) => screen.id === screenId) ?? screens[0];
  const screenViews = views.filter((view) => view.screenId === selectedScreen?.id);
  useEffect(() => {
    if (!screenId && screens[0]) setScreenId(screens[0].id);
  }, [screenId, screens]);
  const add = (type: "RANKING" | "SCHEDULE" | "ANNOUNCEMENT" | "CALLS" | "STATIONS" | "IMAGE") =>
    create.mutate({
      eventId,
      type,
      name:
        type === "RANKING"
          ? "Ranking"
          : type === "SCHEDULE"
            ? "Próximos horários"
            : type === "CALLS"
              ? "Chamadas recentes"
              : type === "STATIONS"
                ? "Situação das mesas"
                : type === "IMAGE"
                  ? "Imagem"
                  : "Aviso",
      durationSeconds: 20,
      order: screenViews.length,
      enabled: true,
      screenId: selectedScreen?.id,
      config: JSON.stringify(
        type === "ANNOUNCEMENT"
          ? {
              title: "Bem-vindos à OBR",
              message: "Acompanhe a programação e os resultados nesta tela.",
            }
          : type === "RANKING"
            ? { categoryId: categories[0]?.id }
            : {
                title:
                  type === "CALLS"
                    ? "Chamadas recentes"
                    : type === "STATIONS"
                      ? "Mesas e palcos"
                      : "Próximas atividades",
              },
      ),
    });
  const patchConfig = (id: string, config: Config, changes: Partial<Config>) =>
    update.mutate({ id, config: JSON.stringify({ ...config, ...changes }) });
  const move = (index: number, direction: -1 | 1) => {
    const other = screenViews[index + direction];
    const current = screenViews[index];
    if (!other || !current) return;
    update.mutate(
      { id: current.id, order: other.order },
      { onSuccess: () => update.mutate({ id: other.id, order: current.order }) },
    );
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Telões e views públicas</h2>
          <p className="text-sm text-muted-foreground">
            Cada tela física possui um link e uma sequência independente que alterna sozinha.
          </p>
        </div>
        <a
          href={selectedScreen ? `/view/${selectedScreen.slug}` : "/view"}
          target="_blank"
          className="rounded-md border px-4 py-2 text-sm font-semibold"
        >
          Abrir {selectedScreen?.name ?? "tela pública"} ↗
        </a>
      </div>
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap gap-2">
            {screens.map((screen) => (
              <button
                key={screen.id}
                onClick={() => setScreenId(screen.id)}
                className={`rounded-xl border-2 px-4 py-3 text-left ${selectedScreen?.id === screen.id ? "border-[#164c78] bg-blue-50 text-[#164c78]" : "border-slate-200 bg-white"}`}
              >
                <strong className="block">{screen.name}</strong>
                <span className="text-xs">
                  /view/{screen.slug} · {screen._count.views} view(s)
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <input
              className="h-10 min-w-60 flex-1 rounded-md border px-3"
              placeholder="Nome do novo telão (ex.: Ranking do ginásio)"
              value={newScreenName}
              onChange={(event) => setNewScreenName(event.target.value)}
            />
            <Button
              disabled={newScreenName.trim().length < 2 || createScreen.isPending}
              onClick={() => createScreen.mutate({ eventId, name: newScreenName.trim() })}
            >
              + Criar telão
            </Button>
            {selectedScreen && (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `${window.location.origin}/view/${selectedScreen.slug}`,
                    )
                  }
                >
                  Copiar link
                </Button>
                <label className="flex items-center gap-2 rounded-md border px-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedScreen.enabled}
                    onChange={(event) =>
                      updateScreen.mutate({ id: selectedScreen.id, enabled: event.target.checked })
                    }
                  />{" "}
                  Ativo
                </label>
                <Button
                  variant="outline"
                  className="text-red-700"
                  disabled={selectedScreen._count.views > 0 || screens.length === 1}
                  onClick={() =>
                    confirm(`Excluir o telão ${selectedScreen.name}?`) &&
                    removeScreen.mutate(selectedScreen.id)
                  }
                >
                  Excluir telão
                </Button>
              </>
            )}
          </div>
          {removeScreen.error && (
            <p className="text-sm text-red-700">{removeScreen.error.message}</p>
          )}
        </CardContent>
      </Card>
      <div>
        <h3 className="text-lg font-bold">Sequência de {selectedScreen?.name ?? "tela"}</h3>
        <p className="text-sm text-muted-foreground">
          Adicione quantas views quiser. A ordem abaixo é a ordem de rotação deste telão.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => add("RANKING")}>+ Ranking</Button>
        <Button onClick={() => add("SCHEDULE")}>+ Horários</Button>
        <Button onClick={() => add("ANNOUNCEMENT")}>+ Aviso</Button>
        <Button onClick={() => add("CALLS")}>+ Chamadas</Button>
        <Button onClick={() => add("STATIONS")}>+ Mesas ao vivo</Button>
        <Button onClick={() => add("IMAGE")}>+ Imagem</Button>
      </div>
      <div className="space-y-3">
        {screenViews.map((view, index) => {
          const config = parse(view.config);
          return (
            <Card
              key={view.id}
              draggable
              onDragStart={() => setDragId(view.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                const dragged = screenViews.find((item) => item.id === dragId);
                if (dragged && dragged.id !== view.id)
                  update.mutate(
                    { id: dragged.id, order: view.order },
                    { onSuccess: () => update.mutate({ id: view.id, order: dragged.order }) },
                  );
                setDragId(null);
              }}
              className={dragId === view.id ? "opacity-60" : ""}
            >
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded bg-[#164c78] px-2 py-1 text-xs font-bold text-white">
                    ⋮⋮ {view.type}
                  </span>
                  <input
                    className="h-9 min-w-52 flex-1 rounded border px-3 font-semibold"
                    defaultValue={view.name}
                    onBlur={(e) => update.mutate({ id: view.id, name: e.target.value })}
                  />
                  <label className="text-sm">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={view.enabled}
                      onChange={(e) => update.mutate({ id: view.id, enabled: e.target.checked })}
                    />
                    Exibir
                  </label>
                  <label className="text-sm">
                    Telão{" "}
                    <select
                      className="ml-2 rounded border px-2 py-1"
                      value={view.screenId ?? ""}
                      onChange={(event) =>
                        update.mutate({
                          id: view.id,
                          screenId: event.target.value || null,
                          order: 999,
                        })
                      }
                    >
                      {screens.map((screen) => (
                        <option key={screen.id} value={screen.id}>
                          {screen.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Duração{" "}
                    <input
                      type="number"
                      min="5"
                      max="300"
                      className="ml-2 w-20 rounded border px-2 py-1"
                      defaultValue={view.durationSeconds}
                      onBlur={(e) =>
                        update.mutate({
                          id: view.id,
                          durationSeconds: Number(e.target.value) || 20,
                        })
                      }
                    />{" "}
                    s
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => move(index, 1)}
                    disabled={index === screenViews.length - 1}
                  >
                    ↓
                  </Button>
                  <button className="text-sm text-red-700" onClick={() => remove.mutate(view.id)}>
                    Remover
                  </button>
                </div>
                {view.type === "RANKING" && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Categoria exibida</span>
                    <select
                      className="h-10 w-full rounded border px-3"
                      value={config.categoryId ?? ""}
                      onChange={(e) => patchConfig(view.id, config, { categoryId: e.target.value })}
                    >
                      <option value="">Primeira categoria automaticamente</option>
                      {categories.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Visual</span>
                    <select
                      className="h-10 w-full rounded border px-3"
                      value={config.theme ?? "OBR"}
                      onChange={(e) =>
                        patchConfig(view.id, config, { theme: e.target.value as Config["theme"] })
                      }
                    >
                      <option value="OBR">OBR 2026 · Azul oficial</option>
                      <option value="DARK">OBR 2026 · Azul noturno</option>
                      <option value="LIGHT">OBR 2026 · Azul claro</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Itens na tela</span>
                    <input
                      type="number"
                      min="3"
                      max="20"
                      className="h-10 w-full rounded border px-3"
                      defaultValue={config.maxItems ?? 10}
                      onBlur={(e) =>
                        patchConfig(view.id, config, {
                          maxItems: Math.max(3, Math.min(20, Number(e.target.value) || 10)),
                        })
                      }
                    />
                  </label>
                </div>
                {view.type !== "RANKING" && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Título</span>
                    <input
                      className="h-10 w-full rounded border px-3"
                      defaultValue={config.title ?? ""}
                      onBlur={(e) => patchConfig(view.id, config, { title: e.target.value })}
                    />
                  </label>
                )}
                {view.type === "ANNOUNCEMENT" && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">
                      Mensagem em Markdown (aceita imagens)
                    </span>
                    <textarea
                      className="min-h-28 w-full rounded border p-3"
                      defaultValue={config.message ?? ""}
                      onBlur={(e) => patchConfig(view.id, config, { message: e.target.value })}
                    />
                  </label>
                )}
                {view.type === "IMAGE" && (
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">URL da imagem</span>
                    <input
                      className="h-10 w-full rounded border px-3"
                      defaultValue={config.imageUrl ?? ""}
                      onBlur={(e) => patchConfig(view.id, config, { imageUrl: e.target.value })}
                    />
                  </label>
                )}
              </CardContent>
            </Card>
          );
        })}
        {screenViews.length === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
            Adicione ranking, horários ou avisos para começar a rotação.
          </p>
        )}
      </div>
    </div>
  );
}
