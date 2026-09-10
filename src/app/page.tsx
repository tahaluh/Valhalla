import { redirect } from "next/navigation";
import { getSession } from "@/infrastructure/auth/session";
import { prisma } from "@/infrastructure/database/prisma";

// A rota consulta o banco para decidir o redirecionamento e não pode ser
// pré-renderizada durante o build (o CI e a imagem de produção ainda não têm DB).
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Check if any events exist — if not, redirect to first-run setup
  const eventCount = await prisma.event.count();
  if (eventCount === 0) {
    redirect("/setup");
  }

  const session = await getSession();

  if (!session.user) {
    redirect("/login");
  }

  if (session.user.role === "ADMIN") {
    redirect("/dashboard/admin");
  }

  if (session.user.role === "REFEREE") {
    redirect("/dashboard/referee");
  }

  redirect("/view");
}
