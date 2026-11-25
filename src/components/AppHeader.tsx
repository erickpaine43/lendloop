"use client";

import { Show, SignInButton, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@convex/_generated/api";
import { useStoreUser } from "./useStoreUser";

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/my-listings", label: "My listings" },
  { href: "/my-requests", label: "My requests" },
  { href: "/incoming", label: "Incoming requests" },
];

export function AppHeader() {
  useStoreUser();
  const me = useQuery(api.users.me);
  const pathname = usePathname();

  const links = me?.role === "admin" ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          LendLoop
        </Link>
        <Show when="signed-in">
          <nav className="flex flex-1 flex-wrap gap-4 text-sm">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={
                  pathname.startsWith(l.href)
                    ? "font-medium text-zinc-900 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                }
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <UserButton />
        </Show>
        <Show when="signed-out">
          <div className="flex-1" />
          <SignInButton>
            <button className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
              Sign in
            </button>
          </SignInButton>
        </Show>
      </div>
    </header>
  );
}
