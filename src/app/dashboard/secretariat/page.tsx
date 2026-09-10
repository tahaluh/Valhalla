import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { prisma } from "@/infrastructure/database/prisma";
import SecretariatDashboardClient from "./SecretariatDashboardClient";

export default async function SecretariatDashboardPage() {
  const session = await getSession();

  if (!session.user || (session.user.role !== "SECRETARIAT" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  if (!(await prisma.event.count({ where: { id: session.user.eventId } }))) {
    session.destroy();
    redirect("/login");
  }

  return <SecretariatDashboardClient eventId={session.user.eventId} />;
}
