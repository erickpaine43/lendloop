import type { AuthConfig } from "convex/server";

// Convex valida los tokens de sesión emitidos por Clerk (integración Clerk ↔ Convex).
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
