import { convexTest } from "convex-test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";

export function setup() {
  return convexTest(schema, modules);
}

export type T = ReturnType<typeof setup>;

/** Usuario registrado con una identidad de Clerk simulada. */
export async function signUp(t: T, name: string, role: "user" | "admin" = "user") {
  const as = t.withIdentity({ subject: name, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${name}` });
  const userId = (await as.mutation(api.users.store, { name })) as Id<"users">;
  if (role === "admin") await t.mutation(internal.users.setRole, { userId, role });
  return { as, userId };
}

export function day(offset: number) {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

export const drill = { name: "Cordless drill", category: "power_tools", condition: "good", description: "18V" } as const;
