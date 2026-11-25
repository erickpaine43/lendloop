"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RequestForm } from "@/components/RequestForm";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge, Button, Card, Empty, ErrorText, Loading, PageTitle, TrustedBadge } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { CATEGORIES, CATEGORY_LABELS, CONDITION_LABELS, type Category } from "@/lib/labels";

export default function ToolsPage() {
  return (
    <RequireAuth>
      <Catalog />
    </RequireAuth>
  );
}

function Catalog() {
  const [category, setCategory] = useState<Category | undefined>();
  const tools = useQuery(api.tools.list, { category });
  const me = useQuery(api.users.me);
  const [requesting, setRequesting] = useState<Id<"tools"> | null>(null);

  return (
    <>
      <PageTitle
        action={
          <Link href="/my-listings">
            <Button>List a tool</Button>
          </Link>
        }
      >
        Tools
      </PageTitle>

      <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <FilterChip active={!category} onClick={() => setCategory(undefined)}>
          All
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
      </div>

      {tools === undefined ? (
        <Loading />
      ) : tools.length === 0 ? (
        <Empty>No tools in this category yet.</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {tools.map((t) => (
            <li key={t._id}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-medium">{t.name}</h2>
                  {t.available ? (
                    <Badge className="bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">Available</Badge>
                  ) : (
                    <Badge className="bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">On loan</Badge>
                  )}
                </div>
                <p className="text-sm text-zinc-500">
                  {CATEGORY_LABELS[t.category]} · {CONDITION_LABELS[t.condition]} condition
                </p>
                {t.description && <p className="text-sm">{t.description}</p>}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-sm text-zinc-500">
                  <span>{t.isMine ? "Your tool" : `Lent by ${t.owner?.name ?? "unknown"}`}</span>
                  {t.owner?.trustedLender && <TrustedBadge />}
                </div>

                {!t.isMine &&
                  (t.requestPending ? (
                    // Viene del servidor: se mantiene aunque recargues la página.
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Request pending. Track it in{" "}
                      <Link href="/my-requests" className="underline">My requests</Link>.
                    </p>
                  ) : requesting === t._id ? (
                    <RequestForm toolId={t._id} onDone={() => setRequesting(null)} />
                  ) : (
                    <div>
                      <Button variant="secondary" onClick={() => setRequesting(t._id)}>
                        Request to borrow
                      </Button>
                    </div>
                  ))}

                {me?.role === "admin" && !t.isMine && <AdminRemove toolId={t._id} />}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-sm ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900"
          : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

/** Moderación: un admin puede quitar cualquier publicación (Convex lo valida). */
function AdminRemove({ toolId }: { toolId: Id<"tools"> }) {
  const remove = useMutation(api.tools.remove);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-1 border-t border-zinc-200 pt-2 dark:border-zinc-800">
      <Button
        variant="danger"
        className="w-fit"
        onClick={async () => {
          if (!confirm("Remove this listing? Pending requests will be declined.")) return;
          try {
            await remove({ toolId });
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        Remove listing (admin)
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
