import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/database/prisma";

export async function GET() {
  const started = Date.now();
  try {
    await prisma.event.count();
    return NextResponse.json({
      status: "ok",
      database: "ok",
      latencyMs: Date.now() - started,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { status: "error", database: "error", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
