import type { Doc } from "@convex/_generated/dataModel";

export type Category = Doc<"tools">["category"];
export type Condition = Doc<"tools">["condition"];
export type LoanStatus = Doc<"loans">["status"];

export const CATEGORY_LABELS: Record<Category, string> = {
  power_tools: "Power tools",
  hand_tools: "Hand tools",
  garden: "Garden",
  kitchen: "Kitchen",
  camping: "Camping",
  cleaning: "Cleaning",
  other: "Other",
};

export const CONDITION_LABELS: Record<Condition, string> = {
  new: "New",
  good: "Good",
  fair: "Fair",
  worn: "Worn",
};

export const STATUS_STYLES: Record<LoanStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  approved: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  declined: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  returned: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
};

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
export const CONDITIONS = Object.keys(CONDITION_LABELS) as Condition[];
