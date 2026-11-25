import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import { todayUTC } from "./lib/dates";
import { requireSecret, signPayload } from "./lib/hmac";

export const loanEvents = v.union(
  v.literal("loan.requested"),
  v.literal("loan.approved"),
  v.literal("loan.declined"),
  v.literal("loan.returned"),
);
type LoanEvent = "loan.requested" | "loan.approved" | "loan.declined" | "loan.returned";

const automationType = v.union(v.literal("request_notification"), v.literal("overdue_reminder"));

/** Lo mínimo que n8n necesita para notificar a una persona (sin correo ni datos extra). */
async function recipient(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return null;
  // El ID de Clerk permite a n8n buscar el correo en Clerk si se envía un email real,
  // así Convex no necesita guardar correos.
  return { name: user.name, clerkUserId: user.tokenIdentifier.split("|").pop() ?? "" };
}

const MESSAGES: Record<LoanEvent, (tool: string, other: string) => string> = {
  "loan.requested": (tool, other) => `${other} wants to borrow your "${tool}".`,
  "loan.approved": (tool, other) => `${other} approved your request for "${tool}".`,
  "loan.declined": (tool, other) => `${other} declined your request for "${tool}".`,
  "loan.returned": (tool, other) => `${other} marked "${tool}" as returned. Thanks for borrowing!`,
};

/** Payload de la notificación de un cambio de estado de un préstamo. */
export const loanEventPayload = internalQuery({
  args: { loanId: v.id("loans"), event: loanEvents },
  handler: async (ctx, { loanId, event }) => {
    const loan = await ctx.db.get(loanId);
    if (!loan) return null;
    const tool = await ctx.db.get(loan.toolId);
    // "requested" se avisa al dueño; el resto, a quien pidió prestado.
    const toLender = event === "loan.requested";
    const to = await recipient(ctx, toLender ? loan.lenderId : loan.borrowerId);
    const other = await recipient(ctx, toLender ? loan.borrowerId : loan.lenderId);
    if (!to || !other) return null;
    const toolName = tool?.name ?? "a tool";
    return {
      event,
      loanId,
      idempotencyKey: `notify:${loanId}:${event}`,
      tool: { name: toolName },
      startDate: loan.startDate,
      endDate: loan.endDate,
      recipient: to,
      message: MESSAGES[event](toolName, other.name),
    };
  },
});

const MAX_ATTEMPTS = 3;

/**
 * Envía el evento a n8n firmado con HMAC. Si falla, reintenta con espera creciente;
 * si se agotan los intentos, deja registrado el fallo para que sea visible.
 */
export const notifyLoanEvent = internalAction({
  args: { loanId: v.id("loans"), event: loanEvents, attempt: v.optional(v.number()) },
  handler: async (ctx, { loanId, event, attempt = 1 }) => {
    const payload = await ctx.runQuery(internal.automations.loanEventPayload, { loanId, event });
    if (!payload) return;

    let error = "";
    try {
      const base = process.env.N8N_WEBHOOK_BASE_URL;
      if (!base) throw new Error("N8N_WEBHOOK_BASE_URL is not configured");
      const { body, headers } = await signPayload(requireSecret("CONVEX_TO_N8N_SECRET"), payload);
      const res = await fetch(`${base}/lendloop-loan-event`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return;
      error = `n8n responded ${res.status}`;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    if (attempt < MAX_ATTEMPTS) {
      // 10 s, 40 s… antes de rendirse.
      const delayMs = 10_000 * 4 ** (attempt - 1);
      await ctx.scheduler.runAfter(delayMs, internal.automations.notifyLoanEvent, {
        loanId,
        event,
        attempt: attempt + 1,
      });
      return;
    }
    await ctx.runMutation(internal.automations.recordEvent, {
      loanId,
      type: "request_notification",
      status: "failed",
      idempotencyKey: payload.idempotencyKey,
      detail: `Gave up after ${MAX_ATTEMPTS} attempts: ${error}`.slice(0, 300),
    });
  },
});

/** Préstamos aprobados y vencidos que todavía no recibieron recordatorio hoy. */
export const overdueLoans = internalQuery({
  args: {},
  handler: async (ctx) => {
    const today = todayUTC();
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_status_endDate", (q) => q.eq("status", "approved").lt("endDate", today))
      .take(500);

    const result = [];
    for (const loan of loans) {
      const idempotencyKey = `overdue:${loan._id}:${today}`;
      const already = await ctx.db
        .query("automationEvents")
        .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", idempotencyKey))
        .unique();
      if (already?.status === "sent") continue;

      const tool = await ctx.db.get(loan.toolId);
      const to = await recipient(ctx, loan.borrowerId);
      if (!to) continue;
      const daysOverdue = Math.round((Date.parse(today) - Date.parse(loan.endDate)) / 86_400_000);
      result.push({
        loanId: loan._id,
        idempotencyKey,
        tool: { name: tool?.name ?? "a tool" },
        endDate: loan.endDate,
        daysOverdue,
        recipient: to,
        message: `"${tool?.name ?? "The tool"}" was due ${daysOverdue} day(s) ago. Please return it.`,
      });
    }
    return result;
  },
});

/**
 * Registra lo que hizo n8n. Es idempotente por `idempotencyKey`: un reintento no crea
 * duplicados, y un "sent" posterior a un "failed" actualiza el registro.
 */
export const recordEvent = internalMutation({
  args: {
    loanId: v.id("loans"),
    type: automationType,
    status: v.union(v.literal("sent"), v.literal("failed")),
    idempotencyKey: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ duplicate: boolean; id: Id<"automationEvents"> }> => {
    const existing: Doc<"automationEvents"> | null = await ctx.db
      .query("automationEvents")
      .withIndex("by_idempotency_key", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .unique();
    if (existing) {
      if (existing.status === "sent") return { duplicate: true, id: existing._id };
      await ctx.db.patch(existing._id, { status: args.status, detail: args.detail });
      return { duplicate: false, id: existing._id };
    }
    const id = await ctx.db.insert("automationEvents", args);
    return { duplicate: false, id };
  },
});
