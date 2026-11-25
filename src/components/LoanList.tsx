"use client";

import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";
import type { api } from "@convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/labels";
import { Card, Empty, Loading, StatusBadge, TrustedBadge } from "./ui";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];

function formatRange(start: string, end: string) {
  const fmt = (s: string) =>
    new Date(`${s}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return start === end ? fmt(start) : `${fmt(start)} – ${fmt(end)}`;
}

/** Lista de préstamos; cada vista decide qué personas mostrar y qué acciones ofrecer. */
export function LoanList({
  loans,
  empty,
  person,
  actions,
}: {
  loans: LoanView[] | undefined;
  empty: string;
  person: (loan: LoanView) => ReactNode;
  actions?: (loan: LoanView) => ReactNode;
}) {
  if (loans === undefined) return <Loading />;
  if (loans.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="flex flex-col gap-3">
      {loans.map((loan) => (
        <li key={loan._id}>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{loan.tool?.name ?? "Removed tool"}</span>
                <StatusBadge status={loan.status} overdue={loan.overdue} />
              </div>
              <p className="text-sm text-zinc-500">
                {loan.tool && `${CATEGORY_LABELS[loan.tool.category]} · `}
                {formatRange(loan.startDate, loan.endDate)}
              </p>
              <div className="text-sm">{person(loan)}</div>
            </div>
            {actions && <div className="flex gap-2">{actions(loan)}</div>}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function LenderLine({ loan }: { loan: LoanView }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      Lender: {loan.lender?.name ?? "unknown"}
      {loan.lender?.trustedLender && <TrustedBadge />}
    </span>
  );
}
