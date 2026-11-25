"use client";

import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";

/**
 * Registra en Convex al usuario de la sesión cuando inicia sesión.
 * Solo se envía un nombre para mostrar (nunca el correo ni el rol).
 */
export function useStoreUser() {
  const { isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const store = useMutation(api.users.store);

  const name = user?.fullName || user?.username || user?.firstName || "Neighbor";

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    store({ name }).catch((err) => console.error("Could not register user", err));
  }, [isAuthenticated, user, name, store]);
}
