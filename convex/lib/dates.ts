import { ConvexError } from "convex/values";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha de hoy (UTC) en formato YYYY-MM-DD. */
export function todayUTC(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/**
 * Valida un rango de préstamo. Permite empezar "ayer" en UTC para no rechazar
 * a usuarios en husos horarios detrás de UTC (p. ej. Colombia por la noche).
 */
export function assertValidRange(startDate: string, endDate: string, now = Date.now()) {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new ConvexError("Dates must use the YYYY-MM-DD format");
  }
  if (startDate > endDate) throw new ConvexError("Start date must be before end date");
  const yesterday = todayUTC(now - 24 * 60 * 60 * 1000);
  if (startDate < yesterday) throw new ConvexError("Start date cannot be in the past");
  const maxDays = 60;
  const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000 + 1;
  if (days > maxDays) throw new ConvexError(`Loans cannot be longer than ${maxDays} days`);
}

/** Dos rangos inclusivos se solapan. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}
