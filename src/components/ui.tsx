import type { ButtonHTMLAttributes, ReactNode } from "react";
import { STATUS_STYLES, type LoanStatus } from "@/lib/labels";

type Variant = "primary" | "secondary" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200",
  secondary:
    "border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800",
  danger: "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-zinc-200 p-4 dark:border-zinc-800 ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status, overdue }: { status: LoanStatus; overdue?: boolean }) {
  if (overdue) {
    return <Badge className="bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200">Overdue</Badge>;
  }
  return <Badge className={STATUS_STYLES[status]}>{status[0].toUpperCase() + status.slice(1)}</Badge>;
}

export function TrustedBadge() {
  return (
    <Badge className="bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-200">
      ★ Trusted Lender
    </Badge>
  );
}

export function PageTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{children}</h1>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-zinc-500">{children}</p>;
}

export function Loading() {
  return <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
      {children}
    </p>
  );
}

export const inputClass =
  "w-full rounded-md border border-zinc-300 bg-transparent px-3 py-1.5 text-sm dark:border-zinc-700";
