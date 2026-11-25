"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

// Errores de negocio que lanzamos con `throw new ConvexError("...")` en las funciones.
// La UI ya los atrapa y los muestra, así que no deben verse como fallos.
const EXPECTED_ERROR = /^\[CONVEX [QMA]\(.+?\)\] [\s\S]*Uncaught ConvexError/;

/**
 * El cliente de Convex escribe con console.error todo error que devuelve una función,
 * y en desarrollo Next.js convierte cada console.error en un overlay. Este logger baja
 * a console.warn solo los errores esperados; los inesperados siguen como console.error.
 */
const logger = {
  logVerbose: (...args: unknown[]) => console.debug(...args),
  log: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => {
    if (typeof args[0] === "string" && EXPECTED_ERROR.test(args[0])) console.warn(...args);
    else console.error(...args);
  },
};

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { logger });

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
