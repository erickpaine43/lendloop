import { clerkMiddleware } from "@clerk/nextjs/server";

// Next.js 16: "proxy" es el nuevo nombre de middleware.
// Clerk solo adjunta la sesión a la request; la autorización real se hace en las funciones de Convex.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Todo excepto archivos internos de Next.js y estáticos.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Siempre en rutas de API.
    "/(api|trpc)(.*)",
  ],
};
