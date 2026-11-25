"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { LoanList } from "@/components/LoanList";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge, Button, Card, ErrorText, Loading, PageTitle, TrustedBadge } from "@/components/ui";
import { errorMessage } from "@/lib/errors";

export default function AdminPage() {
  return (
    <RequireAuth admin>
      <Admin />
    </RequireAuth>
  );
}

function Admin() {
  const users = useQuery(api.users.list);
  const loans = useQuery(api.loans.listAll);

  return (
    <>
      <PageTitle>Admin</PageTitle>
      <p className="mb-8 text-sm text-zinc-500">
        To remove a listing, use the &quot;Remove listing&quot; button on the{" "}
        <Link href="/tools" className="underline">Tools</Link> page.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-medium">Users</h2>
        {users === undefined ? (
          <Loading />
        ) : (
          <Card className="p-0">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((u) => (
                <li key={u._id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    {u.name}
                    {u.role === "admin" && (
                      <Badge className="bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">Admin</Badge>
                    )}
                    {u.trustedLender && <TrustedBadge />}
                  </span>
                  <TrustedToggle userId={u._id} trusted={u.trustedLender} />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">All loans</h2>
        <LoanList
          loans={loans}
          empty="There are no loans yet."
          person={(loan) => (
            <span>
              {loan.borrower?.name ?? "unknown"} borrows from {loan.lender?.name ?? "unknown"}
            </span>
          )}
        />
      </section>
    </>
  );
}

function TrustedToggle({ userId, trusted }: { userId: Id<"users">; trusted: boolean }) {
  const setTrusted = useMutation(api.users.setTrustedLender);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await setTrusted({ userId, trusted: !trusted });
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        {trusted ? "Remove Trusted Lender" : "Mark as Trusted Lender"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
