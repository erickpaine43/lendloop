import { ConvexError } from "convex/values";

/** Mensaje legible para el usuario a partir de un error de Convex. */
export function errorMessage(err: unknown): string {
  if (err instanceof ConvexError && typeof err.data === "string") return err.data;
  return "Something went wrong. Please try again.";
}
