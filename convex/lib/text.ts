import { ConvexError } from "convex/values";

/** Recorta y valida la longitud de un texto que viene del cliente. */
export function cleanText(value: string, field: string, min: number, max: number): string {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < min || text.length > max) {
    throw new ConvexError(`${field} must be between ${min} and ${max} characters`);
  }
  return text;
}
