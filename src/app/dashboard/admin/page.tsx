import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { prisma } from "@/infrastructure/database/prisma";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  const session = await getSession();

  if (!session.user || session.user.role !== "ADMIN") {
    redirect("/login");
  }

  if (!(await prisma.event.count({ where: { id: session.user.eventId } }))) {
    session.destroy();
    redirect("/login");
  }

  return <AdminDashboardClient eventId={session.user.eventId} />;
}
