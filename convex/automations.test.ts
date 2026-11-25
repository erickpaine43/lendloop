import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { assertValidRange, rangesOverlap } from "./lib/dates";
import { signPayload } from "./lib/hmac";
import { day, drill, setup, signUp, type T } from "./test.helpers";

const N8N_SECRET = "a".repeat(64); // n8n → Convex
const CONVEX_SECRET = "b".repeat(64); // Convex → n8n

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("N8N_TO_CONVEX_SECRET", N8N_SECRET);
  vi.stubEnv("CONVEX_TO_N8N_SECRET", CONVEX_SECRET);
  vi.stubEnv("N8N_WEBHOOK_BASE_URL", "http://n8n.test/webhook");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** Petición firmada como la haría n8n. */
async function signed(data: unknown, opts: { secret?: string; now?: number } = {}) {
  const { body, headers } = await signPayload(opts.secret ?? N8N_SECRET, data, opts.now);
  return { method: "POST", body, headers };
}

/** Préstamo aprobado y vencido, insertado directamente (la API no permite fechas pasadas). */
async function seedOverdueLoan(t: T) {
  const alice = await signUp(t, "alice");
  const bob = await signUp(t, "bob");
  const toolId = await alice.as.mutation(api.tools.create, drill);
  const loanId = await t.run(async (ctx) =>
    ctx.db.insert("loans", {
      toolId,
      borrowerId: bob.userId,
      lenderId: alice.userId,
      startDate: day(-6),
      endDate: day(-3),
      status: "approved",
    }),
  );
  return { loanId, alice, bob };
}

describe("dates", () => {
  test("overlap is inclusive", () => {
    expect(rangesOverlap("2026-01-01", "2026-01-05", "2026-01-05", "2026-01-08")).toBe(true);
    expect(rangesOverlap("2026-01-01", "2026-01-04", "2026-01-05", "2026-01-08")).toBe(false);
  });

  test("allows starting yesterday (time zones behind UTC), not earlier", () => {
    expect(() => assertValidRange(day(-1), day(1))).not.toThrow();
    expect(() => assertValidRange(day(-2), day(1))).toThrow("past");
  });
});

describe("signed HTTP endpoints for n8n", () => {
  test("reject missing, wrong, tampered and stale signatures", async () => {
    const t = setup();
    const valid = await signed({});

    expect((await t.fetch("/n8n/overdue-loans", { method: "POST", body: "{}" })).status).toBe(401);
    expect((await t.fetch("/n8n/overdue-loans", await signed({}, { secret: "c".repeat(64) }))).status).toBe(401);
    const tampered = { ...valid, body: JSON.stringify({ payload: '{"x":1}' }) };
    expect((await t.fetch("/n8n/overdue-loans", tampered)).status).toBe(401);
    const stale = await signed({}, { now: Date.now() - 10 * 60_000 });
    expect((await t.fetch("/n8n/overdue-loans", stale)).status).toBe(401);
    expect((await t.fetch("/n8n/overdue-loans", valid)).status).toBe(200);
  });

  test("overdue loans: listed once per day, then excluded after the reminder", async () => {
    const t = setup();
    const { loanId } = await seedOverdueLoan(t);

    const first = await (await t.fetch("/n8n/overdue-loans", await signed({}))).json();
    expect(first.loans).toHaveLength(1);
    expect(first.loans[0]).toMatchObject({ loanId, daysOverdue: 3, recipient: { name: "bob" } });
    expect(JSON.stringify(first)).not.toContain("@"); // sin correos

    const ev = { loanId, type: "overdue_reminder", status: "sent", idempotencyKey: first.loans[0].idempotencyKey };
    expect(await (await t.fetch("/n8n/automation-events", await signed(ev))).json()).toMatchObject({ duplicate: false });
    expect(await (await t.fetch("/n8n/automation-events", await signed(ev))).json()).toMatchObject({ duplicate: true });

    const second = await (await t.fetch("/n8n/overdue-loans", await signed({}))).json();
    expect(second.loans).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("automationEvents").collect())).toHaveLength(1);
  });

  test("write-back validates the payload", async () => {
    const t = setup();
    const { loanId } = await seedOverdueLoan(t);
    const bad = await t.fetch("/n8n/automation-events", await signed({ loanId, type: "nope" }));
    expect(bad.status).toBe(400);
    const unknown = await t.fetch(
      "/n8n/automation-events",
      await signed({ loanId: "abc", type: "overdue_reminder", status: "sent", idempotencyKey: "k" }),
    );
    expect(unknown.status).toBe(400);
  });
});

describe("loan notifications", () => {
  test("each loan change schedules a notification", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });
    await alice.as.mutation(api.loans.decide, { loanId, approve: true });
    await alice.as.mutation(api.loans.markReturned, { loanId });

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled.map((s) => (s.args[0] as { event: string }).event)).toEqual([
      "loan.requested",
      "loan.approved",
      "loan.returned",
    ]);
  });

  test("sends a signed, minimal payload to n8n and notifies the right person", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });

    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await t.action(internal.automations.notifyLoanEvent, { loanId, event: "loan.requested" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://n8n.test/webhook/lendloop-loan-event");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-LendLoop-Signature"]).toMatch(/^[0-9a-f]{64}$/);

    const payload = JSON.parse(JSON.parse(init.body as string).payload);
    expect(payload).toMatchObject({ event: "loan.requested", recipient: { name: "alice" } }); // al dueño
    expect(Object.keys(payload.recipient).sort()).toEqual(["clerkUserId", "name"]);
  });

  test("retries when n8n is down, then records a failed event", async () => {
    const t = setup();
    const alice = await signUp(t, "alice");
    const bob = await signUp(t, "bob");
    const toolId = await alice.as.mutation(api.tools.create, drill);
    const loanId = await bob.as.mutation(api.loans.request, { toolId, startDate: day(0), endDate: day(1) });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));

    await t.action(internal.automations.notifyLoanEvent, { loanId, event: "loan.requested", attempt: 3 });

    const events = await t.run((ctx) => ctx.db.query("automationEvents").collect());
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "failed", type: "request_notification" });
    expect(events[0].detail).toContain("503");
  });

  test("recent activity is shown on the loan without internal details", async () => {
    const t = setup();
    const { loanId, bob } = await seedOverdueLoan(t);
    await t.mutation(internal.automations.recordEvent, {
      loanId: loanId as Id<"loans">,
      type: "overdue_reminder",
      status: "sent",
      idempotencyKey: "k1",
      detail: "internal detail",
    });

    const [loan] = await bob.as.query(api.loans.myRequests, {});
    expect(loan.activity).toHaveLength(1);
    expect(loan.activity[0]).toMatchObject({ type: "overdue_reminder", status: "sent" });
    expect(loan.activity[0]).not.toHaveProperty("detail");
  });
});
