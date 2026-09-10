import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, adminProcedure } from "@/server/trpc/trpc";
import { AuthService } from "@/application/services/auth.service";

const loginSchema = z.object({
  eventId: z.string().min(1),
  role: z.enum(["ADMIN", "REFEREE", "SECRETARIAT"]),
  password: z.string().min(1),
});

export const authRouter = router({
  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    const user = await AuthService.authenticate(input.eventId, input.role, input.password);

    if (!user) {
      await ctx.prisma.auditLog
        .create({
          data: {
            eventId: input.eventId,
            action: "LOGIN_FAILED",
            entityType: "Session",
            entityId: input.eventId,
            actorRole: input.role,
            reason: "Credencial inválida",
          },
        })
        .catch(() => undefined);
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid credentials",
      });
    }

    await AuthService.createSession(user);
    await ctx.prisma.auditLog.create({
      data: {
        eventId: user.eventId,
        action: "LOGIN_SUCCESS",
        entityType: "Session",
        entityId: user.eventId,
        actorRole: user.role,
      },
    });
    return { role: user.role, eventId: user.eventId };
  }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.session.user)
      await ctx.prisma.auditLog.create({
        data: {
          eventId: ctx.session.user.eventId,
          action: "LOGOUT",
          entityType: "Session",
          entityId: ctx.session.user.eventId,
          actorRole: ctx.session.user.role,
        },
      });
    await AuthService.destroySession();
    return { success: true };
  }),

  me: publicProcedure.query(async ({ ctx }) => {
    return ctx.session.user ?? null;
  }),

  // Admin can reset the referee password
  changeRefereePassword: adminProcedure
    .input(z.object({ newPassword: z.string().min(4) }))
    .mutation(async ({ ctx, input }) => {
      const hash = await AuthService.hashPassword(input.newPassword);
      await ctx.prisma.event.update({
        where: { id: ctx.user.eventId },
        data: { refereePassword: hash },
      });
      await ctx.prisma.auditLog.create({
        data: {
          eventId: ctx.user.eventId,
          action: "REFEREE_PASSWORD_CHANGED",
          entityType: "Event",
          entityId: ctx.user.eventId,
          actorRole: ctx.user.role,
        },
      });
      return { success: true };
    }),
});
