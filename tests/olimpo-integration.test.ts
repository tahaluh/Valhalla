import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PrismaClient } from "@prisma/client";

test("importação e exportação preservam o contrato do tournamenter-obr 2026.1.5", async () => {
  const directory = mkdtempSync(join(tmpdir(), "valhalla-olimpo-test-"));
  const received: Array<{ url: string; method: string; contentType?: string; body?: unknown }> = [];
  let rejectScore = false;
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const url = request.url ?? "/";
      received.push({
        url,
        method: request.method ?? "GET",
        contentType: request.headers["content-type"],
        body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined,
      });
      response.setHeader("content-type", "application/json");
      if (request.method === "GET" && url.startsWith("/api/events/steps/participants")) {
        response.end(
          JSON.stringify({
            id: "step-regional-n1",
            name: "Regional Paraíba Nível 1",
            teams: [
              {
                id: "olimpo-team-1",
                name: "Robôs do Futuro",
                institution: "Escola de Robótica",
                city: "João Pessoa",
                state: "PB",
              },
            ],
          }),
        );
        return;
      }
      if (request.method === "POST" && url === "/api/events/steps/score") {
        if (rejectScore) {
          response.statusCode = 422;
          response.end(JSON.stringify({ error: "payload recusado" }));
          return;
        }
        response.end(JSON.stringify({ accepted: true }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ error: "not found" }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  process.env.DATABASE_URL = `file:${join(directory, "integration.db")}`;
  process.env.SESSION_SECRET = "olimpo-integration-secret-with-at-least-32-characters";
  process.env.OLIMPO_API_BASE_URL = `${baseUrl}/api/events/steps`;
  process.env.OLIMPO_SCORE_API_URL = `${baseUrl}/api/events/steps/score`;

  let database: PrismaClient | null = null;
  try {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    });
    execFileSync("npm", ["run", "prisma:seed"], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    });
    const [{ appRouter }, databaseModule] = await Promise.all([
      import("../src/server/trpc/router"),
      import("../src/infrastructure/database/prisma"),
    ]);
    database = databaseModule.prisma;
    const event = await database.event.findFirstOrThrow({ where: { isActive: true } });
    const category = await database.category.findFirstOrThrow({
      where: { eventId: event.id, type: "RESCUE" },
      include: { scoreColumns: { orderBy: { order: "asc" } } },
    });
    const session = (role: "ADMIN" | "REFEREE") => ({
      user: { role, eventId: event.id },
      save: async () => undefined,
      destroy: () => undefined,
      updateConfig: () => undefined,
    });
    const admin = appRouter.createCaller({
      prisma: database,
      req: new Request(`${baseUrl}/api/trpc`),
      session: session("ADMIN"),
    });
    const referee = appRouter.createCaller({
      prisma: database,
      req: new Request(`${baseUrl}/api/trpc`),
      session: session("REFEREE"),
    });
    const token = "token regional + teste";
    const preview = await admin.team.previewOlimpoImport({
      eventId: event.id,
      categoryId: category.id,
      token,
    });
    assert.equal(preview.summary.createCount, 1);
    assert.equal(preview.sourceStepId, "step-regional-n1");
    assert.equal(received[0]?.url, "/api/events/steps/participants?token=token+regional+%2B+teste");
    await admin.team.applyOlimpoImport({ eventId: event.id, categoryId: category.id, token });
    const imported = await database.team.findFirstOrThrow({
      where: { externalId: "olimpo-team-1" },
    });
    assert.equal(imported.externalEventToken, token);
    assert.equal(imported.externalStepId, "step-regional-n1");
    assert.equal(await database.auditLog.count({ where: { action: "OLIMPO_TEAMS_IMPORTED" } }), 1);
    const unchanged = await admin.team.previewOlimpoImport({
      eventId: event.id,
      categoryId: category.id,
      token,
    });
    assert.equal(unchanged.actions.length, 0);
    assert.equal(unchanged.summary.unchangedCount, 1);
    const scoreData = JSON.stringify({ ficha: "oficial", checkpoint: [true, false, true] });
    await referee.score.submitBatch({
      teamId: imported.id,
      categoryId: category.id,
      scores: [{ columnIndex: 0, value: 123, data: scoreData }],
    });

    await admin.robustness.syncOlimpo(event.id);
    const post = received.find((entry) => entry.method === "POST");
    assert.equal(post?.url, "/api/events/steps/score");
    assert.equal(post?.contentType, "application/json");
    const payload = post?.body as {
      steps: Array<{
        id: string;
        token: string;
        headers: string[];
        scores: Array<{
          id: string;
          dataMap: Record<string, string>;
          headersMap: Record<string, number>;
        }>;
      }>;
    };
    assert.equal(payload.steps.length, 1);
    assert.deepEqual(payload.steps[0]?.headers, [
      "Rank",
      ...category.scoreColumns.map((column) => column.name),
      "Final",
    ]);
    assert.equal(payload.steps[0]?.id, "step-regional-n1");
    assert.equal(payload.steps[0]?.token, token);
    assert.equal(payload.steps[0]?.scores[0]?.id, "olimpo-team-1");
    assert.equal(payload.steps[0]?.scores[0]?.headersMap.Rank, 1);
    assert.equal(payload.steps[0]?.scores[0]?.headersMap.Final, 123);
    assert.equal(payload.steps[0]?.scores[0]?.headersMap[category.scoreColumns[0]!.name], 123);
    assert.equal(payload.steps[0]?.scores[0]?.dataMap[category.scoreColumns[0]!.name], scoreData);
    assert.equal(payload.steps[0]?.scores[0]?.headersMap[category.scoreColumns[1]!.name], 0);
    assert.equal(payload.steps[0]?.scores[0]?.dataMap[category.scoreColumns[1]!.name], "");
    const synced = await database.event.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(synced.olimpoLastSyncStatus, "SUCCESS");
    assert.ok(synced.olimpoLastSyncAt);
    assert.ok(synced.olimpoLastSyncAttemptAt);
    rejectScore = true;
    await assert.rejects(admin.robustness.syncOlimpo(event.id), /HTTP 422.*payload recusado/);
    const failed = await database.event.findUniqueOrThrow({ where: { id: event.id } });
    assert.equal(failed.olimpoLastSyncStatus, "ERROR");
    assert.equal(failed.olimpoLastSyncAt?.getTime(), synced.olimpoLastSyncAt.getTime());
    assert.ok(
      failed.olimpoLastSyncAttemptAt &&
        failed.olimpoLastSyncAttemptAt.getTime() >= synced.olimpoLastSyncAttemptAt.getTime(),
    );
  } finally {
    if (database) await database.$disconnect();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    rmSync(directory, { recursive: true, force: true });
  }
});
