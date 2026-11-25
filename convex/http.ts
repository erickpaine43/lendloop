import { httpRouter } from "convex/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { requireSecret, verifyRequest } from "./lib/hmac";

/**
 * Endpoints que llama n8n. Todos exigen firma HMAC con N8N_TO_CONVEX_SECRET
 * (la dirección n8n → Convex tiene su propio secreto).
 */
const http = httpRouter();

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function verified(request: Request) {
  const result = await verifyRequest(requireSecret("N8N_TO_CONVEX_SECRET"), request);
  if (!result.ok) console.warn(`Rejected n8n request: ${result.reason}`);
  return result;
}

/** Lista de préstamos vencidos que necesitan recordatorio hoy. */
http.route({
  path: "/n8n/overdue-loans",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await verified(request);
    if (!auth.ok) return json(401, { error: "unauthorized" });
    const loans = await ctx.runQuery(internal.automations.overdueLoans, {});
    return json(200, { loans });
  }),
});

const automationEventSchema = z.object({
  loanId: z.string().min(1).max(64),
  type: z.enum(["request_notification", "overdue_reminder"]),
  status: z.enum(["sent", "failed"]),
  idempotencyKey: z.string().min(1).max(200),
  detail: z.string().max(300).optional(),
});

/** Write-back idempotente de lo que hizo n8n (notificación o recordatorio). */
http.route({
  path: "/n8n/automation-events",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const auth = await verified(request);
    if (!auth.ok) return json(401, { error: "unauthorized" });

    const parsed = automationEventSchema.safeParse(auth.data);
    if (!parsed.success) return json(400, { error: "invalid payload" });

    try {
      const result = await ctx.runMutation(internal.automations.recordEvent, {
        ...parsed.data,
        loanId: parsed.data.loanId as Id<"loans">,
      });
      return json(200, result);
    } catch {
      // ID de préstamo inexistente o con formato inválido.
      return json(400, { error: "unknown loan" });
    }
  }),
});

export default http;
