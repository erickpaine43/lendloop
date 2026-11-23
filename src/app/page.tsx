"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useStoreUser } from "./useStoreUser";

// Página temporal: comprueba que Clerk y Convex están conectados.
export default function Home() {
  useStoreUser();
  const me = useQuery(api.users.me);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">LendLoop</h1>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </header>

      <p className="text-zinc-600 dark:text-zinc-400">
        Borrow what you need. Lend what you don&apos;t.
      </p>

      <Show when="signed-out">
        <SignInButton>
          <button className="w-fit rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
            Sign in to lend or borrow
          </button>
        </SignInButton>
      </Show>

      <section className="rounded-md border border-zinc-200 p-4 text-sm dark:border-zinc-800">
        <h2 className="mb-2 font-medium">Convex ve a:</h2>
        <pre className="overflow-x-auto">
          {me === undefined ? "cargando…" : JSON.stringify(me, null, 2)}
        </pre>
      </section>
    </main>
  );
}
