"use client";

import { SignInButton } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import type { ReactNode } from "react";
import { api } from "@convex/_generated/api";
import { Button, Empty, Loading } from "./ui";

/**
 * Muestra el contenido solo con sesión válida en Convex y con el usuario ya registrado.
 * Es solo UX: la autorización real la hace cada función de Convex.
 */
export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  return (
    <>
      <AuthLoading>
        <Loading />
      </AuthLoading>
      <Unauthenticated>
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-zinc-600 dark:text-zinc-400">You need to sign in to see this page.</p>
          <SignInButton>
            <Button>Sign in to lend or borrow</Button>
          </SignInButton>
        </div>
      </Unauthenticated>
      <Authenticated>
        <Registered admin={admin}>{children}</Registered>
      </Authenticated>
    </>
  );
}

function Registered({ children, admin }: { children: ReactNode; admin: boolean }) {
  const me = useQuery(api.users.me);
  if (me === undefined || me === null) return <Loading />;
  if (admin && me.role !== "admin") return <Empty>This page is only available to admins.</Empty>;
  return <>{children}</>;
}
