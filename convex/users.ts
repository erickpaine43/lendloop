import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, requireAdmin } from "./lib/auth";
import { cleanText } from "./lib/text";
import { roles } from "./schema";

/** Usuario de la sesión (solo campos que el propio usuario necesita). */
export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    return {
      _id: user._id,
      name: user.name,
      role: user.role,
      trustedLender: user.trustedLender,
    };
  },
});

/**
 * Registra o actualiza al usuario de la sesión. Se llama al iniciar sesión.
 * El nombre es solo para mostrar; el rol nunca se toma del cliente.
 */
export const store = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError("Not authenticated");
    const name = cleanText(args.name || "Neighbor", "Name", 1, 60);

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (existing) {
      if (existing.name !== name) await ctx.db.patch(existing._id, { name });
      return existing._id;
    }
    return await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name,
      role: "user",
      trustedLender: false,
    });
  },
});

/** Admin: lista de usuarios para moderación. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db.query("users").take(500);
    return users.map((u) => ({
      _id: u._id,
      name: u.name,
      role: u.role,
      trustedLender: u.trustedLender,
    }));
  },
});

/** Admin: marca o desmarca a un usuario como "Trusted Lender". */
export const setTrustedLender = mutation({
  args: { userId: v.id("users"), trusted: v.boolean() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new ConvexError("User not found");
    await ctx.db.patch(args.userId, { trustedLender: args.trusted });
  },
});

/**
 * Cambia el rol de un usuario. Es interna: no se puede llamar desde el navegador,
 * solo desde el servidor o la CLI, p. ej.:
 *   npx convex run users:setRole '{"userId":"...","role":"admin"}'
 */
export const setRole = internalMutation({
  args: { userId: v.id("users"), role: roles },
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (!target) throw new ConvexError("User not found");
    await ctx.db.patch(args.userId, { role: args.role });
  },
});
