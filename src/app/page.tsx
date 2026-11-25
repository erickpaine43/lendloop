"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@convex/_generated/api";
import { Badge, Button, Empty, Loading } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/labels";

/** Página pública: solo nombre y categoría de las herramientas disponibles. */
export default function Home() {
  const tools = useQuery(api.tools.listPublic);

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4 py-6">
        <h1 className="text-4xl font-semibold tracking-tight">LendLoop</h1>
        <p className="text-xl text-zinc-600 dark:text-zinc-400">
          Borrow what you need. Lend what you don&apos;t.
        </p>
        <div>
          <Show when="signed-out">
            <SignInButton>
              <Button>Sign in to lend or borrow</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Link href="/tools">
              <Button>Browse tools</Button>
            </Link>
          </Show>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-medium">Available now</h2>
        {tools === undefined ? (
          <Loading />
        ) : tools.length === 0 ? (
          <Empty>No tools available yet.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((t, i) => (
              <li
                key={`${t.name}-${i}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800"
              >
                <span className="font-medium">{t.name}</span>
                <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {CATEGORY_LABELS[t.category]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
