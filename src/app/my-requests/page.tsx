"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { LenderLine, LoanList } from "@/components/LoanList";
import { RequireAuth } from "@/components/RequireAuth";
import { PageTitle } from "@/components/ui";

export default function MyRequestsPage() {
  return (
    <RequireAuth>
      <MyRequests />
    </RequireAuth>
  );
}

function MyRequests() {
  const loans = useQuery(api.loans.myRequests);
  return (
    <>
      <PageTitle>My requests</PageTitle>
      <LoanList
        loans={loans}
        empty="You haven't requested any tools yet."
        person={(loan) => <LenderLine loan={loan} />}
      />
    </>
  );
}
