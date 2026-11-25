import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireUser } from "./lib/auth";
import { todayUTC } from "./lib/dates";
import { cleanText } from "./lib/text";
import { categories, conditions } from "./schema";

/** Una herramienta está prestada si tiene un préstamo aprobado (no devuelto) que cubre hoy. */
async function isOnLoan(ctx: QueryCtx, toolId: Id<"tools">, today: string) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  return approved.some((l) => l.startDate <= today && today <= l.endDate);
}

async function activeTools(ctx: QueryCtx, category?: Doc<"tools">["category"]) {
  const tools = category
    ? await ctx.db
        .query("tools")
        .withIndex("by_category", (q) => q.eq("category", category))
        .take(500)
    : await ctx.db.query("tools").take(500);
  return tools.filter((t) => t.removedAt === undefined);
}

/**
 * Pública (sin sesión): solo nombre y categoría de las herramientas disponibles.
 * Nunca expone dueño, descripción ni IDs internos de usuarios (minimización de datos).
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const today = todayUTC();
    const result: { name: string; category: Doc<"tools">["category"] }[] = [];
    for (const tool of await activeTools(ctx)) {
      if (!(await isOnLoan(ctx, tool._id, today))) {
        result.push({ name: tool.name, category: tool.category });
      }
    }
    return result;
  },
});

/** Catálogo para usuarios con sesión, con disponibilidad y filtro por categoría. */
export const list = query({
  args: { category: v.optional(categories) },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const today = todayUTC();
    const tools = await activeTools(ctx, args.category);
    const myLoans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .collect();
    const pendingToolIds = new Set(myLoans.filter((l) => l.status === "pending").map((l) => l.toolId));
    return await Promise.all(
      tools.map(async (tool) => {
        const owner = await ctx.db.get(tool.ownerId);
        return {
          _id: tool._id,
          name: tool.name,
          category: tool.category,
          condition: tool.condition,
          description: tool.description,
          available: !(await isOnLoan(ctx, tool._id, today)),
          isMine: tool.ownerId === me._id,
          // Ya tengo una solicitud pendiente para esta herramienta.
          requestPending: pendingToolIds.has(tool._id),
          // Del dueño solo se muestra lo necesario para decidir si pedir prestado.
          owner: owner ? { name: owner.name, trustedLender: owner.trustedLender } : null,
        };
      }),
    );
  },
});

/** Herramientas publicadas por el usuario de la sesión. */
export const myListings = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const today = todayUTC();
    const tools = await ctx.db
      .query("tools")
      .withIndex("by_owner", (q) => q.eq("ownerId", me._id))
      .collect();
    return await Promise.all(
      tools
        .filter((t) => t.removedAt === undefined)
        .map(async (t) => ({ ...t, available: !(await isOnLoan(ctx, t._id, today)) })),
    );
  },
});

const toolFields = {
  name: v.string(),
  category: categories,
  condition: conditions,
  description: v.string(),
};

function cleanToolFields(args: { name: string; description: string }) {
  return {
    name: cleanText(args.name, "Name", 2, 80),
    description: cleanText(args.description, "Description", 0, 500),
  };
}

export const create = mutation({
  args: toolFields,
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    return await ctx.db.insert("tools", {
      ownerId: me._id,
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
    });
  },
});

/** Solo el dueño puede editar su herramienta. */
export const update = mutation({
  args: { toolId: v.id("tools"), ...toolFields },
  handler: async (ctx, { toolId, ...args }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("Tool not found");
    if (tool.ownerId !== me._id) throw new ConvexError("Forbidden");
    await ctx.db.patch(toolId, {
      category: args.category,
      condition: args.condition,
      ...cleanToolFields(args),
    });
  },
});

/**
 * El dueño puede borrar su herramienta si no está prestada; un admin puede borrar
 * cualquiera (moderación). Las solicitudes pendientes se rechazan automáticamente.
 */
export const remove = mutation({
  args: { toolId: v.id("tools") },
  handler: async (ctx, { toolId }) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("Tool not found");
    const isOwner = tool.ownerId === me._id;
    if (!isOwner && me.role !== "admin") throw new ConvexError("Forbidden");

    const approved = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
      .collect();
    if (isOwner && me.role !== "admin" && approved.length > 0) {
      throw new ConvexError("This tool has an active loan. Mark it as returned first.");
    }

    const pending = await ctx.db
      .query("loans")
      .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "pending"))
      .collect();
    const now = Date.now();
    for (const loan of pending) {
      await ctx.db.patch(loan._id, { status: "declined", decidedAt: now });
    }
    await ctx.db.patch(toolId, { removedAt: now });
  },
});
