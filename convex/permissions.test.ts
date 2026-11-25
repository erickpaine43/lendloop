import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { day, drill, setup, signUp } from "./test.helpers";
import { setRole } from "./users";

// Los avisos a n8n se programan con el scheduler; con timers falsos no se ejecutan solos.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("tools", () => {
  test("anonymous users only see name and category of available tools", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    await alice.as.mutation(api.tools.create, drill);

    expect(await t.query(api.tools.listPublic, {})).toEqual([{ name: "Cordless drill", category: "power_tools" }]);
    await expect(t.query(api.tools.list, {})).rejects.toThrow("Not authenticated");
  });

  test("only the owner can edit; owner or admin can remove", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const admin = await signUp(t, "carol", "admin");
    const toolId = await alice.as.mutation(api.tools.create, drill);

    await expect(bob.as.mutation(api.tools.update, { toolId, ...drill, name: "Hacked" })).rejects.toThrow("Forbidden");
    await expect(bob.as.mutation(api.tools.remove, { toolId })).rejects.toThrow("Forbidden");
    await admin.as.mutation(api.tools.remove, { toolId });
    expect(await t.query(api.tools.listPublic, {})).toEqual([]);
  });

  test("validates text length", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    await expect(alice.as.mutation(api.tools.create, { ...drill, name: "x" })).rejects.toThrow("Name must be between");
  });

  test("the catalog marks tools I already requested as pending", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);
    await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(2) });

    const [tool] = await bob.as.query(api.tools.list, {});
    expect(tool.requestPending).toBe(true);
  });
});

describe("loans", () => {
  test("full flow: request, approve, return", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);

    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(3) });
    await alice.as.mutation(api.loans.decide, { loanId, approve: true });
    expect(await t.query(api.tools.listPublic, {})).toEqual([]); // prestada: no aparece en público
    await expect(alice.as.mutation(api.tools.remove, { toolId })).rejects.toThrow("active loan");

    await alice.as.mutation(api.loans.markReturned, { loanId });
    const [loan] = await bob.as.query(api.loans.myRequests, {});
    expect(loan.status).toBe("returned");
  });

  test("rejects invalid requests", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);

    await expect(alice.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) })).rejects.toThrow("cannot borrow your own");
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: day(-5), endDate: day(1) })).rejects.toThrow("cannot be in the past");
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: day(3), endDate: day(1) })).rejects.toThrow("before end date");
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(90) })).rejects.toThrow("longer than");
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: "2026-02-30", endDate: day(1) })).rejects.toThrow("YYYY-MM-DD");

    await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });
    await expect(bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) })).rejects.toThrow("already have a pending");
  });

  test("only the lender decides, and overlapping approvals are blocked", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const carol = await signUp(t, "carol");
    const toolId = await alice.as.mutation(api.tools.create, drill);

    const bobLoan = await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(3) });
    const carolLoan = await carol.as.mutation(api.loans.request, { toolId, startDate: day(2), endDate: day(5) });

    await expect(bob.as.mutation(api.loans.decide, { loanId: bobLoan, approve: true })).rejects.toThrow("Forbidden");
    await expect(carol.as.mutation(api.loans.decide, { loanId: bobLoan, approve: true })).rejects.toThrow("Forbidden");
    await alice.as.mutation(api.loans.decide, { loanId: bobLoan, approve: true });
    await expect(alice.as.mutation(api.loans.decide, { loanId: carolLoan, approve: true })).rejects.toThrow("already lent");
    await expect(bob.as.mutation(api.loans.markReturned, { loanId: bobLoan })).rejects.toThrow("Forbidden");
  });

  test("each side only sees its own loans", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const carol = await signUp(t, "carol");
    const toolId = await alice.as.mutation(api.tools.create, drill);
    await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });

    expect(await alice.as.query(api.loans.incoming, {})).toHaveLength(1);
    expect(await bob.as.query(api.loans.myRequests, {})).toHaveLength(1);
    expect(await carol.as.query(api.loans.incoming, {})).toHaveLength(0);
    expect(await carol.as.query(api.loans.myRequests, {})).toHaveLength(0);
  });

  test("removing a tool declines its pending requests", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);
    await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });

    await alice.as.mutation(api.tools.remove, { toolId });
    const [loan] = await bob.as.query(api.loans.myRequests, {});
    expect(loan.status).toBe("declined");
  });
});

describe("admin", () => {
  test("admin-only functions reject regular users", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    await expect(alice.as.query(api.users.list, {})).rejects.toThrow("Forbidden");
    await expect(alice.as.query(api.loans.listAll, {})).rejects.toThrow("Forbidden");
    await expect(alice.as.mutation(api.users.setTrustedLender, { userId: alice.userId, trusted: true })).rejects.toThrow("Forbidden");
  });

  test("admins can moderate", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const admin = await signUp(t, "carol", "admin");
    await admin.as.mutation(api.users.setTrustedLender, { userId: alice.userId, trusted: true });
    expect((await alice.as.query(api.users.me, {}))?.trustedLender).toBe(true);
    expect(await admin.as.query(api.users.list, {})).toHaveLength(2);
  });

  test("new users always start as regular users, whatever they send", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    expect((await alice.as.query(api.users.me, {}))?.role).toBe("user");
    // setRole está registrada como internal: el backend de Convex no la expone al navegador.
    // (convex-test no simula esa restricción, así que se comprueba el registro directamente.)
    expect((setRole as unknown as { isInternal?: boolean }).isInternal).toBe(true);
    expect((setRole as unknown as { isPublic?: boolean }).isPublic).toBeUndefined();
  });
});
