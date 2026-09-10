export type OfflineCommand<T = unknown> = {
  id: string;
  eventId: string;
  kind: "TRANSITION" | "FINALIZE" | "DRAW_SURPRISE" | "DECIDE_SURPRISE";
  payload: T;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const KEY = "valhalla-offline-commands-v1";

export function readOfflineCommands(storage: Pick<Storage, "getItem">, eventId?: string) {
  try {
    const parsed = JSON.parse(storage.getItem(KEY) ?? "[]") as OfflineCommand[];
    if (!Array.isArray(parsed)) return [];
    return eventId ? parsed.filter((command) => command.eventId === eventId) : parsed;
  } catch {
    return [];
  }
}

function write(storage: Pick<Storage, "setItem">, commands: OfflineCommand[]) {
  storage.setItem(KEY, JSON.stringify(commands));
}

export function enqueueOfflineCommand(
  storage: Pick<Storage, "getItem" | "setItem">,
  command: Omit<OfflineCommand, "createdAt" | "attempts">,
) {
  const commands = readOfflineCommands(storage);
  if (!commands.some((item) => item.id === command.id))
    commands.push({ ...command, createdAt: new Date().toISOString(), attempts: 0 });
  write(storage, commands);
  return commands;
}

export function removeOfflineCommand(storage: Pick<Storage, "getItem" | "setItem">, id: string) {
  const commands = readOfflineCommands(storage).filter((command) => command.id !== id);
  write(storage, commands);
  return commands;
}

export function updateOfflineCommandPayload(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
  payload: unknown,
) {
  const commands = readOfflineCommands(storage).map((command) =>
    command.id === id ? { ...command, payload } : command,
  );
  write(storage, commands);
  return commands;
}

export function markOfflineCommandFailure(
  storage: Pick<Storage, "getItem" | "setItem">,
  id: string,
  error: string,
) {
  const commands = readOfflineCommands(storage).map((command) =>
    command.id === id ? { ...command, attempts: command.attempts + 1, lastError: error } : command,
  );
  write(storage, commands);
  return commands;
}
