"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import { LoanList, type LoanView } from "@/components/LoanList";
import { RequireAuth } from "@/components/RequireAuth";
import { Button, ErrorText, PageTitle } from "@/components/ui";
import { errorMessage } from "@/lib/errors";

export default function IncomingPage() {
  return (
    <RequireAuth>
      <Incoming />
    </RequireAuth>
  );
}

function Incoming() {
  const loans = useQuery(api.loans.incoming);
  return (
    <>
      <PageTitle>Incoming requests</PageTitle>
      <LoanList
        loans={loans}
        empty="Nobody has requested your tools yet."
        person={(loan) => <span>Borrower: {loan.borrower?.name ?? "unknown"}</span>}
        actions={(loan) => <LenderActions loan={loan} />}
      />
    </>
  );
}

function LenderActions({ loan }: { loan: LoanView }) {
  const decide = useMutation(api.loans.decide);
  const markReturned = useMutation(api.loans.markReturned);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const id = loan._id;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {loan.status === "pending" && (
          <>
            <Button disabled={busy} onClick={() => run(() => decide({ loanId: id, approve: true }))}>Approve</Button>
            <Button disabled={busy} variant="secondary" onClick={() => run(() => decide({ loanId: id, approve: false }))}>Decline</Button>
          </>
        )}
        {loan.status === "approved" && (
          <Button disabled={busy} variant="secondary" onClick={() => run(() => markReturned({ loanId: id }))}>Mark as returned</Button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
