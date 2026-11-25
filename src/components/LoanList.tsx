"use client";

import type { FunctionReturnType } from "convex/server";
import { useEffect, useState, type ReactNode } from "react";
import type { api } from "@convex/_generated/api";
import { CATEGORY_LABELS } from "@/lib/labels";
import { Card, Empty, Loading, StatusBadge, TrustedBadge } from "./ui";

export type LoanView = FunctionReturnType<typeof api.loans.myRequests>[number];
type Activity = LoanView["activity"][number];

const ACTIVITY_LABELS: Record<Activity["type"], string> = {
  request_notification: "Notification",
  overdue_reminder: "Reminder",
};

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "2 days ago", "5 minutes ago"… */
function timeAgo(at: number, now: number) {
  const seconds = Math.round((at - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

/** Hora actual que se refresca cada minuto, para que "x minutes ago" no se quede fijo. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Actividad reciente de las automatizaciones de n8n en un préstamo. */
function ActivityLine({ activity }: { activity?: Activity[] }) {
  const now = useNow();
  // Puede faltar si el frontend se actualiza antes que el backend durante un despliegue.
  if (!activity?.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-zinc-500">
      {activity.map((a, i) => (
        <li key={i} className={a.status === "failed" ? "text-red-600 dark:text-red-400" : undefined}>
          {a.status === "failed"
            ? `${ACTIVITY_LABELS[a.type]} failed ${timeAgo(a.at, now)}`
            : `${ACTIVITY_LABELS[a.type]} sent ${timeAgo(a.at, now)}`}
        </li>
      ))}
    </ul>
  );
}

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
              <ActivityLine activity={loan.activity} />
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
