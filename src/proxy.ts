import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Next.js 16: "proxy" es el nuevo nombre de middleware.
// Redirige a iniciar sesión en las páginas privadas. Es un chequeo optimista de UX:
// la autorización real se hace en cada función de Convex.
const isPrivateRoute = createRouteMatcher([
  "/tools(.*)",
  "/my-listings(.*)",
  "/my-requests(.*)",
  "/incoming(.*)",
  "/admin(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPrivateRoute(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Todo excepto archivos internos de Next.js y estáticos.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Siempre en rutas de API.
    "/(api|trpc)(.*)",
  ],
};
