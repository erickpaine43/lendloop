import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireAdmin, requireUser } from "./lib/auth";
import { assertValidRange, rangesOverlap, todayUTC } from "./lib/dates";

async function hasApprovedOverlap(
  ctx: QueryCtx | MutationCtx,
  toolId: Id<"tools">,
  startDate: string,
  endDate: string,
  ignoreLoanId?: Id<"loans">,
) {
  const approved = await ctx.db
    .query("loans")
    .withIndex("by_tool_status", (q) => q.eq("toolId", toolId).eq("status", "approved"))
    .collect();
  return approved.some(
    (l) => l._id !== ignoreLoanId && rangesOverlap(startDate, endDate, l.startDate, l.endDate),
  );
}

/** Vista de un préstamo con solo los datos que cada parte necesita. */
async function describe(ctx: QueryCtx, loan: Doc<"loans">) {
  const [tool, borrower, lender] = await Promise.all([
    ctx.db.get(loan.toolId),
    ctx.db.get(loan.borrowerId),
    ctx.db.get(loan.lenderId),
  ]);
  return {
    _id: loan._id,
    _creationTime: loan._creationTime,
    startDate: loan.startDate,
    endDate: loan.endDate,
    status: loan.status,
    overdue: loan.status === "approved" && loan.endDate < todayUTC(),
    tool: tool ? { _id: tool._id, name: tool.name, category: tool.category } : null,
    borrower: borrower ? { name: borrower.name } : null,
    lender: lender ? { name: lender.name, trustedLender: lender.trustedLender } : null,
  };
}

/** Pedir prestada una herramienta para un rango de fechas. */
export const request = mutation({
  args: { toolId: v.id("tools"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const tool = await ctx.db.get(args.toolId);
    if (!tool || tool.removedAt !== undefined) throw new ConvexError("Tool not found");
    if (tool.ownerId === me._id) throw new ConvexError("You cannot borrow your own tool");
    assertValidRange(args.startDate, args.endDate);
    if (await hasApprovedOverlap(ctx, tool._id, args.startDate, args.endDate)) {
      throw new ConvexError("The tool is already lent for those dates");
    }

    const mine = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .collect();
    if (mine.some((l) => l.toolId === tool._id && l.status === "pending")) {
      throw new ConvexError("You already have a pending request for this tool");
    }

    return await ctx.db.insert("loans", {
      toolId: tool._id,
      borrowerId: me._id,
      lenderId: tool.ownerId,
      startDate: args.startDate,
      endDate: args.endDate,
      status: "pending",
    });
  },
});

/** Solo el dueño de la herramienta decide sobre una solicitud pendiente. */
export const decide = mutation({
  args: { loanId: v.id("loans"), approve: v.boolean() },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("Request not found");
    if (loan.lenderId !== me._id) throw new ConvexError("Forbidden");
    if (loan.status !== "pending") throw new ConvexError("This request was already decided");

    if (args.approve) {
      const tool = await ctx.db.get(loan.toolId);
      if (!tool || tool.removedAt !== undefined) throw new ConvexError("Tool not found");
      if (await hasApprovedOverlap(ctx, loan.toolId, loan.startDate, loan.endDate, loan._id)) {
        throw new ConvexError("The tool is already lent for those dates");
      }
    }
    await ctx.db.patch(loan._id, {
      status: args.approve ? "approved" : "declined",
      decidedAt: Date.now(),
    });
  },
});

/** El dueño marca el préstamo como devuelto. */
export const markReturned = mutation({
  args: { loanId: v.id("loans") },
  handler: async (ctx, args) => {
    const me = await requireUser(ctx);
    const loan = await ctx.db.get(args.loanId);
    if (!loan) throw new ConvexError("Loan not found");
    if (loan.lenderId !== me._id) throw new ConvexError("Forbidden");
    if (loan.status !== "approved") throw new ConvexError("Only approved loans can be returned");
    await ctx.db.patch(loan._id, { status: "returned", returnedAt: Date.now() });
  },
});

/** "My requests": préstamos que pedí. */
export const myRequests = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_borrower", (q) => q.eq("borrowerId", me._id))
      .order("desc")
      .take(200);
    return await Promise.all(loans.map((l) => describe(ctx, l)));
  },
});

/** "Incoming requests": solicitudes sobre mis herramientas. */
export const incoming = query({
  args: {},
  handler: async (ctx) => {
    const me = await requireUser(ctx);
    const loans = await ctx.db
      .query("loans")
      .withIndex("by_lender", (q) => q.eq("lenderId", me._id))
      .order("desc")
      .take(200);
    return await Promise.all(loans.map((l) => describe(ctx, l)));
  },
});

/** Admin: todos los préstamos. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const loans = await ctx.db.query("loans").order("desc").take(500);
    return await Promise.all(loans.map((l) => describe(ctx, l)));
  },
});
