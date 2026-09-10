import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { prisma } from "@/infrastructure/database/prisma";
import RefereeDashboardClient from "./RefereeDashboardClient";

export default async function RefereeDashboardPage() {
  const session = await getSession();

  if (!session.user || (session.user.role !== "REFEREE" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  if (!(await prisma.event.count({ where: { id: session.user.eventId } }))) {
    session.destroy();
    redirect("/login");
  }

  return <RefereeDashboardClient eventId={session.user.eventId} />;
}
